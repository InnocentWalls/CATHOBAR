import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  isChannelActiveInConfig,
  type AppConfig,
  type NowPlayingPushInput,
  type NowPlayingState,
  type TickerItem,
} from '@cathobar/shared';
import type { SourceContext, TickerSource } from './types.js';

const execFileAsync = promisify(execFile);

const WIN_SMTC_SCRIPT = `
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name.StartsWith('IAsyncOperation') })[0]
Function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(1500) | Out-Null
  return $netTask.Result
}
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$session = $mgr.GetCurrentSession()
if ($null -eq $session) { Write-Output 'NONE' } else {
  $info = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $pb = $session.GetPlaybackInfo()
  @{ status = [string]$pb.PlaybackStatus; title = $info.Title; artist = $info.Artist; album = $info.AlbumTitle } | ConvertTo-Json -Compress
}
`;

const WIN_SMTC_ENCODED = Buffer.from(WIN_SMTC_SCRIPT, 'utf16le').toString('base64');

interface LastFmResponse {
  recenttracks?: {
    track?: Array<{
      name?: string;
      artist?: { '#text'?: string };
      album?: { '#text'?: string };
      '@attr'?: { nowplaying?: string };
    }>;
  };
}

export class NowPlayingSource implements TickerSource {
  readonly id = 'nowplaying' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalSec = 8;
  private pollInFlight = false;
  private lastTrackKey = '';
  private externalPushUntil = 0;

  constructor(private readonly ctx: SourceContext) {}

  start(): void {
    this.onConfigUpdate(this.ctx.getConfig());
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.ctx.updateStatus({ id: this.id, active: false, connected: false });
  }

  onConfigUpdate(config: AppConfig): void {
    if (!this.isConfigActive(config)) {
      this.stop();
      return;
    }
    const intervalChanged = this.pollIntervalSec !== config.sources.nowplaying.pollIntervalSec;
    if (!this.timer || intervalChanged) {
      this.pollIntervalSec = config.sources.nowplaying.pollIntervalSec;
      this.syncTimer();
      void this.refreshNow();
    }
  }

  applyExternalPush(input: NowPlayingPushInput): NowPlayingState {
    const now = Date.now();
    const state: NowPlayingState = {
      playing: input.playing,
      title: input.title,
      artist: input.artist,
      album: input.album,
      sourceApp: input.sourceApp,
      updatedAt: now,
      levels: input.levels,
    };
    this.externalPushUntil = now + 90_000;
    this.publishState(state);
    return state;
  }

  async refreshNow(): Promise<void> {
    const config = this.ctx.getConfig();
    if (!this.isConfigActive(config)) {
      this.ctx.updateStatus({ id: this.id, active: false, connected: false });
      return;
    }
    if (this.pollInFlight) return;
    if (Date.now() < this.externalPushUntil) {
      this.ctx.updateStatus({ id: this.id, active: true, connected: true, lastError: null });
      return;
    }

    this.pollInFlight = true;
    try {
      const np = config.sources.nowplaying;
      let detected: NowPlayingState | null = null;

      if (np.lastfmUsername.trim() && np.lastfmApiKey.trim()) {
        detected = await this.fetchLastFm(np.lastfmUsername.trim(), np.lastfmApiKey.trim());
      }

      if (!detected && np.enableSystemMedia && !process.env.VITEST) {
        if (process.platform === 'win32') {
          detected = await this.queryWindowsSmtc();
        } else if (process.platform === 'linux') {
          detected = await this.queryLinuxPlayerctl();
        }
      }

      if (detected) {
        this.publishState(detected);
      } else {
        this.ctx.updateNowPlaying?.(null);
      }

      this.ctx.updateStatus({
        id: this.id,
        active: true,
        connected: true,
        lastFetchAt: Date.now(),
        lastError: null,
      });
    } catch (err) {
      this.ctx.updateStatus({
        id: this.id,
        active: true,
        connected: false,
        lastFetchAt: Date.now(),
        lastError: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.pollInFlight = false;
    }
  }

  private publishState(state: NowPlayingState): void {
    this.ctx.updateNowPlaying?.(state);
    if (!state.playing || !state.title.trim()) return;

    const trackKey = `${state.artist}|${state.title}`;
    const displayText = state.artist ? `${state.title} — ${state.artist}` : state.title;
    const now = Date.now();
    const persistentItem: TickerItem = {
      id: `nowplaying-${now}`,
      source: 'nowplaying',
      badge: 'NOW PLAYING',
      text: displayText,
      color: '#f472b6',
      timestamp: now,
      priority: 'normal',
      oneShot: false,
      breaking: false,
      icon: 'music',
      replaceKey: 'nowplaying:current',
      sourceKey: 'nowplaying:current',
    };

    const items: TickerItem[] = [persistentItem];
    if (trackKey !== this.lastTrackKey) {
      this.lastTrackKey = trackKey;
      items.push({
        ...persistentItem,
        id: `nowplaying-oneshot-${now}`,
        priority: 'high',
        oneShot: true,
        replaceKey: undefined,
      });
    }
    this.ctx.emitItems(items);
  }

  private async fetchLastFm(username: string, apiKey: string): Promise<NowPlayingState | null> {
    const url = new URL('https://ws.audioscrobbler.com/2.0/');
    url.searchParams.set('method', 'user.getrecenttracks');
    url.searchParams.set('user', username);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');

    const res = await fetch(url, {
      headers: { 'User-Agent': 'CATHOBAR/0.2' },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) {
      throw new Error(`Last.fm HTTP ${res.status}`);
    }
    const json = (await res.json()) as LastFmResponse;
    const track = json.recenttracks?.track?.[0];
    if (!track?.name) return null;

    const playing = track['@attr']?.nowplaying === 'true';
    return {
      playing,
      title: track.name,
      artist: track.artist?.['#text'] ?? '',
      album: track.album?.['#text'] ?? '',
      sourceApp: 'Last.fm',
      updatedAt: Date.now(),
    };
  }

  private async queryWindowsSmtc(): Promise<NowPlayingState | null> {
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', WIN_SMTC_ENCODED],
        { timeout: 6_000, windowsHide: true },
      );
      const line = stdout.trim();
      if (!line || line === 'NONE') return null;
      const parsed = JSON.parse(line) as {
        status?: string;
        title?: string;
        artist?: string;
        album?: string;
      };
      if (!parsed.title) return null;
      return {
        playing: parsed.status === 'Playing',
        title: parsed.title,
        artist: parsed.artist ?? '',
        album: parsed.album ?? '',
        sourceApp: 'Windows SMTC',
        updatedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }

  private async queryLinuxPlayerctl(): Promise<NowPlayingState | null> {
    try {
      const { stdout } = await execFileAsync(
        'playerctl',
        ['metadata', '--format', '{{status}}\t{{title}}\t{{artist}}\t{{album}}'],
        { timeout: 2_500 },
      );
      const parts = stdout.trim().split('\t');
      const status = parts[0] ?? '';
      const title = parts[1] ?? '';
      if (!title) return null;
      return {
        playing: status.toLowerCase() === 'playing',
        title,
        artist: parts[2] ?? '',
        album: parts[3] ?? '',
        sourceApp: 'MPRIS',
        updatedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }

  private isConfigActive(config: AppConfig): boolean {
    return (
      config.sources.nowplaying.enabled &&
      (isChannelActiveInConfig(config, 'nowplaying') || config.display.showSpectrumAnalyzer)
    );
  }

  private syncTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.pollIntervalSec = this.ctx.getConfig().sources.nowplaying.pollIntervalSec;
    this.timer = setInterval(() => {
      void this.refreshNow();
    }, this.pollIntervalSec * 1000);
  }
}
