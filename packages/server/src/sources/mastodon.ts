import WebSocket from 'ws';
import type { AppConfig, MastodonSourceConfig, TickerItem } from '@cathobar/shared';
import { cleanText, type SourceContext, type TickerSource } from './types.js';

export interface MastodonApiStatus {
  id?: string;
  url?: string;
  content?: string;
  spoiler_text?: string;
  language?: string | null;
  reblog?: unknown;
  account?: {
    acct?: string;
    username?: string;
    display_name?: string;
  };
}

interface MastodonStreamEvent {
  event?: string;
  payload?: string;
}

/**
 * Strips Mastodon HTML tags while preserving spacing at block/line breaks.
 */
export function stripMastodonHtml(html: string): string {
  const spaced = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>\s*<p>/gi, ' ');
  return cleanText(spaced);
}

/**
 * Parses a Mastodon API Status object into a TickerItem if it passes filters.
 */
export function parseMastodonStatus(
  status: MastodonApiStatus,
  cfg: MastodonSourceConfig,
): TickerItem | null {
  if (!status || status.reblog) {
    return null;
  }

  if (cfg.lang.trim()) {
    const lang = (status.language ?? '').toLowerCase();
    if (lang && !lang.startsWith(cfg.lang.trim().toLowerCase())) {
      return null;
    }
  }

  const body = stripMastodonHtml(status.content ?? '');
  const spoiler = cleanText(status.spoiler_text ?? '');
  const combined = spoiler ? `[CW: ${spoiler}] ${body}` : body;

  if (combined.length < 2 || combined.length > 260) {
    return null;
  }

  if (cfg.keywords.length > 0) {
    const lower = combined.toLowerCase();
    const matched = cfg.keywords.some((kw) => lower.includes(kw.toLowerCase()));
    if (!matched) return null;
  }

  const acct = status.account?.acct || status.account?.username || 'mastodon';
  const shortAcct = acct.includes('@') ? `@${acct.split('@')[0]}` : `@${acct}`;

  return {
    id: `mstdn-${status.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`}`,
    source: 'mastodon',
    badge: shortAcct.slice(0, 18),
    text: combined,
    color: '#818cf8',
    timestamp: Date.now(),
    priority: 'normal',
    oneShot: false,
    url: status.url,
  };
}

export class MastodonSource implements TickerSource {
  readonly id = 'mastodon' as const;
  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldRun = false;
  private backoffMs = 3000;
  private lastEmitAt = 0;
  private seenIds = new Set<string>();
  private configKey = '';

  constructor(private readonly ctx: SourceContext) {}

  start(): void {
    this.evaluateState(this.ctx.getConfig());
  }

  stop(): void {
    this.shouldRun = false;
    this.clearTimers();
    this.closeSocket();
    this.seenIds.clear();
    this.ctx.updateStatus({ id: this.id, active: false, connected: false });
  }

  onConfigUpdate(config: AppConfig): void {
    this.evaluateState(config);
  }

  async refreshNow(): Promise<void> {
    if (!this.shouldRun) return;
    await this.pollRestTimeline();
  }

  private evaluateState(config: AppConfig): void {
    const m = config.sources.mastodon;
    const nextRun =
      m.enabled && (config.activeChannel === 'all' || config.activeChannel === 'mastodon');
    const nextKey = `${m.instanceUrl}|${m.stream}|${m.hashtag}|${m.accessToken}|${m.pollIntervalSec}`;

    if (!nextRun) {
      if (this.shouldRun) this.stop();
      return;
    }

    if (!this.shouldRun || nextKey !== this.configKey) {
      this.configKey = nextKey;
      this.shouldRun = true;
      this.clearTimers();
      this.closeSocket();
      this.backoffMs = 3000;
      this.connectStream();
      void this.pollRestTimeline();
    }
  }

  private connectStream(): void {
    if (!this.shouldRun || this.ws) return;
    const cfg = this.ctx.getConfig().sources.mastodon;

    let wsUrl: URL;
    try {
      const base = new URL(cfg.instanceUrl);
      const wsProto = base.protocol === 'http:' ? 'ws:' : 'wss:';
      wsUrl = new URL(`${wsProto}//${base.host}/api/v1/streaming`);
      wsUrl.searchParams.set('stream', cfg.stream);
      if (cfg.stream === 'hashtag' && cfg.hashtag.trim()) {
        wsUrl.searchParams.set('tag', cfg.hashtag.trim().replace(/^#/, ''));
      }
      if (cfg.accessToken.trim()) {
        wsUrl.searchParams.set('access_token', cfg.accessToken.trim());
      }
    } catch (err) {
      this.ctx.updateStatus({
        id: this.id,
        active: true,
        connected: false,
        lastError: `Invalid Mastodon URL: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    this.ctx.updateStatus({ id: this.id, active: true });

    try {
      const ws = new WebSocket(wsUrl.toString(), {
        headers: { 'User-Agent': 'CATHOBAR/0.1' },
      });
      this.ws = ws;

      ws.on('open', () => {
        if (!this.shouldRun) return;
        this.backoffMs = 3000;
        this.stopPollingFallback();
        this.ctx.updateStatus({
          id: this.id,
          active: true,
          connected: true,
          lastError: null,
        });
      });

      ws.on('message', (raw) => {
        this.handleWsMessage(raw.toString());
      });

      ws.on('error', () => {
        this.startPollingFallback();
      });

      ws.on('close', () => {
        this.ws = null;
        if (this.shouldRun) {
          this.startPollingFallback();
          this.scheduleReconnect();
        }
      });
    } catch {
      this.startPollingFallback();
      this.scheduleReconnect();
    }
  }

  private handleWsMessage(raw: string): void {
    if (!this.shouldRun) return;
    let evt: MastodonStreamEvent;
    try {
      evt = JSON.parse(raw) as MastodonStreamEvent;
    } catch {
      return;
    }
    if (evt.event !== 'update' || typeof evt.payload !== 'string') {
      return;
    }

    let status: MastodonApiStatus;
    try {
      status = JSON.parse(evt.payload) as MastodonApiStatus;
    } catch {
      return;
    }

    const fullCfg = this.ctx.getConfig();
    if (!fullCfg.sources.mastodon.enabled) return;
    const cfg = fullCfg.sources.mastodon;
    const minIntervalMs = Math.max(500, Math.floor(60_000 / Math.max(1, cfg.maxItemsPerMinute)));
    const now = Date.now();
    if (now - this.lastEmitAt < minIntervalMs) {
      return;
    }

    const item = parseMastodonStatus(status, cfg);
    if (!item || this.seenIds.has(item.id)) return;

    this.recordSeen(item.id);
    this.lastEmitAt = now;
    this.ctx.emitItems([item]);
    this.ctx.updateStatus({ id: this.id, connected: true, lastFetchAt: now, lastError: null });
  }

  private async pollRestTimeline(): Promise<void> {
    if (!this.shouldRun) return;
    const cfg = this.ctx.getConfig().sources.mastodon;

    try {
      const base = new URL(cfg.instanceUrl);
      let endpoint = '/api/v1/timelines/public';
      const params = new URLSearchParams({ limit: '15' });
      if (cfg.stream === 'public:local') {
        params.set('local', 'true');
      } else if (cfg.stream === 'hashtag' && cfg.hashtag.trim()) {
        const tag = encodeURIComponent(cfg.hashtag.trim().replace(/^#/, ''));
        endpoint = `/api/v1/timelines/tag/${tag}`;
      }

      const url = `${base.origin}${endpoint}?${params.toString()}`;
      const headers: Record<string, string> = { 'User-Agent': 'CATHOBAR/0.1' };
      if (cfg.accessToken.trim()) {
        headers.Authorization = `Bearer ${cfg.accessToken.trim()}`;
      }

      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const list = (await res.json()) as MastodonApiStatus[];
      if (!this.shouldRun || !this.ctx.getConfig().sources.mastodon.enabled) {
        return;
      }
      const items: TickerItem[] = [];
      for (const status of list.reverse()) {
        const item = parseMastodonStatus(status, cfg);
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
      if (!this.shouldRun || !this.ctx.getConfig().sources.mastodon.enabled) {
        return;
      }
      this.ctx.updateStatus({
        id: this.id,
        active: true,
        connected: Boolean(this.ws && this.ws.readyState === WebSocket.OPEN),
        lastFetchAt: Date.now(),
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private startPollingFallback(): void {
    if (this.pollTimer || !this.shouldRun) return;
    const sec = this.ctx.getConfig().sources.mastodon.pollIntervalSec;
    this.pollTimer = setInterval(() => {
      void this.pollRestTimeline();
    }, sec * 1000);
  }

  private stopPollingFallback(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(60_000, this.backoffMs * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectStream();
    }, delay);
  }

  private clearTimers(): void {
    this.stopPollingFallback();
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
    if (this.seenIds.size > 1000) {
      this.seenIds = new Set(Array.from(this.seenIds).slice(-500));
    }
  }
}
