import WebSocket from 'ws';
import {
  isChannelActiveInConfig,
  type AppConfig,
  type EarthquakeSourceConfig,
  type TickerItem,
} from '@cathobar/shared';
import type { SourceContext, TickerSource } from './types.js';

interface P2pQuakePoint {
  pref?: string;
  addr?: string;
  scale?: number;
}

interface P2pQuake551 {
  id?: string;
  code: 551;
  time?: string;
  issue?: { source?: string; time?: string; type?: string };
  earthquake?: {
    time?: string;
    maxScale?: number;
    domesticTsunami?: string;
    hypocenter?: {
      name?: string;
      depth?: number;
      magnitude?: number;
    };
  };
  points?: P2pQuakePoint[];
}

interface P2pQuake552Area {
  name?: string;
  grade?: string;
  immediate?: boolean;
}

interface P2pQuake552 {
  id?: string;
  code: 552;
  time?: string;
  cancelled?: boolean;
  areas?: P2pQuake552Area[];
}

interface P2pQuake556 {
  id?: string;
  code: 556;
  time?: string;
  cancelled?: boolean;
  earthquake?: {
    hypocenter?: {
      name?: string;
      magnitude?: number;
    };
  };
  areas?: Array<{ pref?: string; name?: string; scaleFrom?: number; scaleTo?: number }>;
}

/**
 * Formats JMA / P2PQuake scale integer code (10..70) into Japanese seismic intensity label.
 */
export function formatJmaScale(scale: number): string {
  switch (scale) {
    case 10:
      return '震度1';
    case 20:
      return '震度2';
    case 30:
      return '震度3';
    case 40:
      return '震度4';
    case 45:
      return '震度5弱';
    case 46:
      return '震度5弱以上';
    case 50:
      return '震度5強';
    case 55:
      return '震度6弱';
    case 60:
      return '震度6強';
    case 70:
      return '震度7';
    default:
      return scale >= 10 ? `震度${Math.floor(scale / 10)}` : '震度不明';
  }
}

function formatTsunamiNotice(code: string | undefined): string {
  switch (code) {
    case 'MajorWarning':
      return '大津波警報';
    case 'Warning':
      return '津波警報';
    case 'Watch':
      return '津波注意報';
    case 'NonEffective':
      return '若干の海面変動';
    case 'Checking':
      return '津波調査中';
    case 'None':
      return '津波の心配なし';
    default:
      return '';
  }
}

/**
 * Parses a P2PQuake v2 JSON event (551: Earthquake, 552: Tsunami, 556: EEW Warning) into a TickerItem.
 */
export function parseP2pQuakeEvent(
  raw: unknown,
  cfg: EarthquakeSourceConfig,
  isLiveWs: boolean,
): TickerItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const code = data.code;

  if (code === 551) {
    const evt = raw as P2pQuake551;
    const eq = evt.earthquake;
    if (!eq) return null;
    const maxScale = eq.maxScale ?? -1;
    if (maxScale < cfg.minScale) return null;

    const hypo = eq.hypocenter;
    const hypoName = hypo?.name?.trim() || '震源地不明';
    const scaleStr = formatJmaScale(maxScale);
    const mag =
      typeof hypo?.magnitude === 'number' && hypo.magnitude >= 0
        ? `M${hypo.magnitude.toFixed(1)}`
        : '';
    const depth =
      typeof hypo?.depth === 'number' && hypo.depth >= 0
        ? hypo.depth === 0
          ? 'ごく浅い'
          : `深さ${hypo.depth}km`
        : '';
    const tsunami = formatTsunamiNotice(eq.domesticTsunami);

    const topPrefs = Array.from(
      new Set(
        (evt.points ?? [])
          .filter((p) => (p.scale ?? 0) >= maxScale && p.pref)
          .map((p) => p.pref!),
      ),
    ).slice(0, 3);
    const areaHint = topPrefs.length > 0 ? ` [${topPrefs.join('・')}]` : '';
    const meta = [mag, depth, tsunami].filter(Boolean).join(' / ');
    const timeLabel = eq.time ?? evt.time ?? '';
    const isTsunamiWarning =
      eq.domesticTsunami === 'Warning' || eq.domesticTsunami === 'MajorWarning';
    const isBreaking = isLiveWs && (maxScale >= cfg.breakingMinScale || isTsunamiWarning);
    const isHigh = maxScale >= cfg.breakingMinScale || isTsunamiWarning;

    return {
      id: `quake-551-${evt.id ?? `${Date.now()}-${hypoName}`}`,
      source: 'earthquake',
      badge: `地震 ${scaleStr}`,
      text: `${timeLabel ? `${timeLabel} ` : ''}${hypoName} 最大${scaleStr}${areaHint}${meta ? ` (${meta})` : ''}`,
      color: maxScale >= 45 ? '#ef4444' : maxScale >= 30 ? '#f97316' : '#facc15',
      timestamp: Date.now(),
      priority: isHigh ? 'high' : 'normal',
      oneShot: false,
      breaking: isBreaking,
      icon: isTsunamiWarning ? 'tsunami' : 'quake',
    };
  }

  if (code === 552 && cfg.includeTsunami) {
    const evt = raw as P2pQuake552;
    if (evt.cancelled) {
      return {
        id: `quake-552-cancel-${evt.id ?? Date.now()}`,
        source: 'earthquake',
        badge: '津波解除',
        text: '発表されていた津波警報・注意報はすべて解除されました',
        color: '#22d3ee',
        timestamp: Date.now(),
        priority: 'normal',
        oneShot: false,
        breaking: false,
        icon: 'tsunami',
      };
    }
    const areas = (evt.areas ?? []).slice(0, 5);
    if (areas.length === 0) return null;
    const areaText = areas.map((a) => `${a.name ?? ''}(${a.grade ?? ''})`).join('・');
    const hasMajor = areas.some((a) => a.grade === 'MajorWarning' || a.grade === 'Warning');
    return {
      id: `quake-552-${evt.id ?? Date.now()}`,
      source: 'earthquake',
      badge: hasMajor ? '津波警報' : '津波注意報',
      text: `津波情報発表: ${areaText}`,
      color: hasMajor ? '#ef4444' : '#f59e0b',
      timestamp: Date.now(),
      priority: 'high',
      oneShot: false,
      breaking: isLiveWs,
      icon: 'tsunami',
    };
  }

  if (code === 556) {
    const evt = raw as P2pQuake556;
    if (evt.cancelled) return null;
    const hypoName = evt.earthquake?.hypocenter?.name?.trim() || '緊急地震速報';
    const areaNames = Array.from(
      new Set((evt.areas ?? []).map((a) => a.pref ?? a.name).filter(Boolean)),
    )
      .slice(0, 5)
      .join('・');
    return {
      id: `quake-556-${evt.id ?? Date.now()}`,
      source: 'earthquake',
      badge: '緊急地震速報',
      text: `【緊急地震速報】${hypoName} 強い揺れに警戒${areaNames ? ` (${areaNames})` : ''}`,
      color: '#ff2a22',
      timestamp: Date.now(),
      priority: 'high',
      oneShot: isLiveWs,
      breaking: isLiveWs,
      icon: 'alert',
    };
  }

  return null;
}

export class EarthquakeSource implements TickerSource {
  readonly id = 'earthquake' as const;
  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldRun = false;
  private backoffMs = 5_000;
  private seenIds = new Set<string>();
  private pollIntervalSec = 120;

  constructor(private readonly ctx: SourceContext) {}

  start(): void {
    this.evaluateState(this.ctx.getConfig());
  }

  stop(): void {
    this.shouldRun = false;
    this.clearTimers();
    this.closeSocket();
    this.ctx.updateStatus({ id: this.id, active: false, connected: false });
  }

  onConfigUpdate(config: AppConfig): void {
    this.evaluateState(config);
  }

  async refreshNow(): Promise<void> {
    if (!this.isConfigActive(this.ctx.getConfig())) {
      this.ctx.updateStatus({ id: this.id, active: false, connected: false });
      return;
    }
    await this.fetchHistory();
  }

  private isConfigActive(config: AppConfig): boolean {
    return (
      config.sources.earthquake.enabled &&
      (isChannelActiveInConfig(config, 'disaster') || config.display.breakingAlertEnabled)
    );
  }

  private evaluateState(config: AppConfig): void {
    const nextRun = this.isConfigActive(config);
    const nextInterval = config.sources.earthquake.pollIntervalSec;

    if (!nextRun) {
      if (this.shouldRun) this.stop();
      return;
    }

    const intervalChanged = this.pollIntervalSec !== nextInterval;
    if (!this.shouldRun || intervalChanged) {
      this.shouldRun = true;
      this.pollIntervalSec = nextInterval;
      this.syncPollTimer();
      if (!this.ws && !process.env.VITEST) {
        this.connectWs();
      }
      void this.fetchHistory();
    }
  }

  private connectWs(): void {
    if (!this.shouldRun || this.ws) return;
    this.ctx.updateStatus({ id: this.id, active: true });

    try {
      const ws = new WebSocket('wss://api.p2pquake.net/v2/ws', {
        headers: { 'User-Agent': 'CATHOBAR/0.2' },
      });
      this.ws = ws;

      ws.on('open', () => {
        this.backoffMs = 5_000;
        this.ctx.updateStatus({
          id: this.id,
          active: true,
          connected: true,
          lastError: null,
        });
      });

      ws.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString()) as unknown;
          const cfg = this.ctx.getConfig().sources.earthquake;
          const item = parseP2pQuakeEvent(parsed, cfg, true);
          if (item && !this.seenIds.has(item.id)) {
            this.recordSeen(item.id);
            this.ctx.emitItems([item]);
            this.ctx.updateStatus({
              id: this.id,
              active: true,
              connected: true,
              lastFetchAt: Date.now(),
              lastError: null,
            });
          }
        } catch {
          // ignore malformed frames
        }
      });

      ws.on('error', () => {
        // handled by close
      });

      ws.on('close', () => {
        this.ws = null;
        if (this.shouldRun) {
          this.scheduleReconnect();
        }
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  private async fetchHistory(): Promise<void> {
    if (!this.isConfigActive(this.ctx.getConfig())) return;
    try {
      const res = await fetch(
        'https://api.p2pquake.net/v2/history?codes=551&codes=552&limit=5',
        {
          headers: { 'User-Agent': 'CATHOBAR/0.2' },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const list = (await res.json()) as unknown[];
      const cfg = this.ctx.getConfig().sources.earthquake;
      const items: TickerItem[] = [];
      for (const entry of [...list].reverse()) {
        const item = parseP2pQuakeEvent(entry, cfg, false);
        if (item && !this.seenIds.has(item.id)) {
          this.recordSeen(item.id);
          items.push(item);
        }
      }
      if (items.length > 0) {
        this.ctx.emitItems(items);
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
        connected: Boolean(this.ws && this.ws.readyState === WebSocket.OPEN),
        lastFetchAt: Date.now(),
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private syncPollTimer(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.pollTimer = setInterval(() => {
      void this.fetchHistory();
    }, this.pollIntervalSec * 1000);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.shouldRun) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(60_000, this.backoffMs * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWs();
    }, delay);
  }

  private clearTimers(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private closeSocket(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  private recordSeen(id: string): void {
    this.seenIds.add(id);
    if (this.seenIds.size > 400) {
      this.seenIds = new Set(Array.from(this.seenIds).slice(-200));
    }
  }
}
