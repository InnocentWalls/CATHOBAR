import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import type { AppConfig, RssFeedConfig, TickerItem } from '@cathobar/shared';
import { cleanText, type SourceContext, type TickerSource } from './types.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function extractText(field: unknown): string {
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (field && typeof field === 'object') {
    const obj = field as Record<string, unknown>;
    if (typeof obj['#text'] === 'string') return obj['#text'];
  }
  return '';
}

function extractLink(field: unknown): string | undefined {
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) {
    for (const entry of field) {
      const href = extractLink(entry);
      if (href) return href;
    }
    return undefined;
  }
  if (field && typeof field === 'object') {
    const obj = field as Record<string, unknown>;
    if (typeof obj['@_href'] === 'string') return obj['@_href'];
    if (typeof obj['#text'] === 'string') return obj['#text'];
  }
  return undefined;
}

/**
 * Parses RSS 2.0, Atom, and RSS 1.0 (RDF) XML feeds into TickerItems.
 */
export function parseRssXml(xml: string, feed: RssFeedConfig): TickerItem[] {
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;
  const now = Date.now();
  const color = feed.color ?? '#38bdf8';

  const rssChannel = (parsed.rss as Record<string, unknown> | undefined)?.channel as
    | Record<string, unknown>
    | undefined;
  if (rssChannel) {
    return toArray(rssChannel.item as Record<string, unknown>[]).slice(0, 12).map((item) => {
      const title = cleanText(extractText(item.title));
      const url = extractLink(item.link);
      const id = createHash('sha1').update(`${feed.id}:${url ?? title}`).digest('hex').slice(0, 16);
      return {
        id: `rss-${id}`,
        source: 'rss' as const,
        badge: feed.name,
        text: title,
        color,
        timestamp: now,
        priority: 'normal' as const,
        oneShot: false,
        url,
      };
    }).filter((x) => x.text.length > 0);
  }

  const atomFeed = parsed.feed as Record<string, unknown> | undefined;
  if (atomFeed) {
    return toArray(atomFeed.entry as Record<string, unknown>[]).slice(0, 12).map((entry) => {
      const title = cleanText(extractText(entry.title));
      const url = extractLink(entry.link);
      const id = createHash('sha1').update(`${feed.id}:${url ?? title}`).digest('hex').slice(0, 16);
      return {
        id: `rss-${id}`,
        source: 'rss' as const,
        badge: feed.name,
        text: title,
        color,
        timestamp: now,
        priority: 'normal' as const,
        oneShot: false,
        url,
      };
    }).filter((x) => x.text.length > 0);
  }

  const rdf = parsed['rdf:RDF'] as Record<string, unknown> | undefined;
  if (rdf) {
    return toArray(rdf.item as Record<string, unknown>[]).slice(0, 12).map((item) => {
      const title = cleanText(extractText(item.title));
      const url = extractLink(item.link);
      const id = createHash('sha1').update(`${feed.id}:${url ?? title}`).digest('hex').slice(0, 16);
      return {
        id: `rss-${id}`,
        source: 'rss' as const,
        badge: feed.name,
        text: title,
        color,
        timestamp: now,
        priority: 'normal' as const,
        oneShot: false,
        url,
      };
    }).filter((x) => x.text.length > 0);
  }

  return [];
}

export class RssSource implements TickerSource {
  readonly id = 'rss' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private seenIds = new Set<string>();
  private pollIntervalSec = 300;

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
      config.sources.rss.enabled &&
      (config.activeChannel === 'all' || config.activeChannel === 'rss');
    if (!shouldRun) {
      this.stop();
      return;
    }
    if (this.pollIntervalSec !== config.sources.rss.pollIntervalSec || !this.timer) {
      this.pollIntervalSec = config.sources.rss.pollIntervalSec;
      this.syncTimer();
    }
    void this.refreshNow();
  }

  async refreshNow(): Promise<void> {
    const config = this.ctx.getConfig();
    const shouldRun =
      config.sources.rss.enabled &&
      (config.activeChannel === 'all' || config.activeChannel === 'rss');
    if (!shouldRun) {
      this.ctx.updateStatus({ id: this.id, active: false, connected: false });
      return;
    }

    const enabledFeeds = config.sources.rss.feeds.filter((f) => f.enabled);
    if (enabledFeeds.length === 0) {
      this.ctx.updateStatus({
        id: this.id,
        active: true,
        connected: false,
        lastError: 'No RSS feeds enabled',
      });
      return;
    }

    this.ctx.updateStatus({ id: this.id, active: true });
    const collected: TickerItem[] = [];
    const errors: string[] = [];

    await Promise.all(
      enabledFeeds.map(async (feed) => {
        try {
          const res = await fetch(feed.url, {
            headers: { 'User-Agent': 'CATHOBAR/0.1 (+https://localhost)' },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const xml = await res.text();
          const items = parseRssXml(xml, feed);
          for (const item of items) {
            if (!this.seenIds.has(item.id)) {
              this.seenIds.add(item.id);
              collected.push(item);
            }
          }
        } catch (err) {
          errors.push(`${feed.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );

    if (this.seenIds.size > 1000) {
      const trimmed = Array.from(this.seenIds).slice(-500);
      this.seenIds = new Set(trimmed);
    }

    if (collected.length > 0) {
      this.ctx.emitItems(collected);
    }

    this.ctx.updateStatus({
      id: this.id,
      active: true,
      connected: errors.length < enabledFeeds.length,
      lastFetchAt: Date.now(),
      lastError: errors.length > 0 ? errors.join('; ') : null,
    });
  }

  private syncTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.pollIntervalSec = this.ctx.getConfig().sources.rss.pollIntervalSec;
    this.timer = setInterval(() => {
      void this.refreshNow();
    }, this.pollIntervalSec * 1000);
  }
}
