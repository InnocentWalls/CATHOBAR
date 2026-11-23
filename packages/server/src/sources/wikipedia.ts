import type { AppConfig, TickerItem } from '@cathobar/shared';
import { cleanText, type SourceContext, type TickerSource } from './types.js';

interface WikiSummaryResponse {
  title?: string;
  extract?: string;
  content_urls?: {
    desktop?: { page?: string };
  };
}

export class WikipediaSource implements TickerSource {
  readonly id = 'wikipedia' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalSec = 45;

  constructor(private readonly ctx: SourceContext) {}

  start(): void {
    this.syncTimer();
    void this.refreshNow();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.ctx.updateStatus({ id: this.id, active: false, connected: false });
  }

  onConfigUpdate(config: AppConfig): void {
    const shouldRun =
      config.sources.wikipedia.enabled &&
      (config.activeChannel === 'all' || config.activeChannel === 'wikipedia');
    if (!shouldRun) {
      this.stop();
      return;
    }
    if (this.pollIntervalSec !== config.sources.wikipedia.pollIntervalSec || !this.timer) {
      this.pollIntervalSec = config.sources.wikipedia.pollIntervalSec;
      this.syncTimer();
      void this.refreshNow();
    }
  }

  async refreshNow(): Promise<void> {
    const config = this.ctx.getConfig();
    const wikiCfg = config.sources.wikipedia;
    const shouldRun =
      wikiCfg.enabled && (config.activeChannel === 'all' || config.activeChannel === 'wikipedia');
    if (!shouldRun) {
      this.ctx.updateStatus({ id: this.id, active: false, connected: false });
      return;
    }

    try {
      const lang = encodeURIComponent(wikiCfg.lang || 'ja');
      const url = `https://${lang}.wikipedia.org/api/rest_v1/page/random/summary`;
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            process.env.CATHOBAR_USER_AGENT ||
            'CATHOBAR/0.1 (local desktop ticker; https://github.com/)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as WikiSummaryResponse;
      const title = cleanText(data.title ?? '');
      const extract = cleanText(data.extract ?? '');
      if (title) {
        const summary = extract.length > 140 ? `${extract.slice(0, 140)}…` : extract;
        const item: TickerItem = {
          id: `wiki-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          source: 'wikipedia',
          badge: 'Wiki',
          text: summary ? `【${title}】${summary}` : title,
          color: '#a78bfa',
          timestamp: Date.now(),
          priority: 'normal',
          oneShot: false,
          url: data.content_urls?.desktop?.page,
        };
        this.ctx.emitItems([item]);
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
    }
  }

  private syncTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.pollIntervalSec = this.ctx.getConfig().sources.wikipedia.pollIntervalSec;
    this.timer = setInterval(() => {
      void this.refreshNow();
    }, this.pollIntervalSec * 1000);
  }
}
