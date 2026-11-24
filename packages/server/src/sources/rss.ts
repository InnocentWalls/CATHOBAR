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
        sourceKey: `rss:${feed.id}`,
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
        sourceKey: `rss:${feed.id}`,
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
        sourceKey: `rss:${feed.id}`,
        url,
      };
    }).filter((x) => x.text.length > 0);
  }

  return [];
}

export class RssSource implements TickerSource {
  readonly id = 'rss' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private seenIdsByFeed = new Map<string, Set<string>>();
  private pollIntervalSec = 300;

  constructor(private readonly ctx: SourceContext) { }

  start(): void {
    this.onConfigUpdate(this.ctx.getConfig());
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.seenIdsByFeed.clear();
    this.ctx.updateStatus({ id: this.id, active: false, connected: false });
  }

  onConfigUpdate(config: AppConfig): void {
    const enabledFeedIds = new Set(
      config.sources.rss.feeds.filter((f) => f.enabled).map((f) => f.id),
    );
    for (const feedId of this.seenIdsByFeed.keys()) {
      if (!enabledFeedIds.has(feedId)) {
        this.seenIdsByFeed.delete(feedId);
      }
    }

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
    const perFeedResults: Array<{ feedId: string; items: TickerItem[] }> = [];
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
          perFeedResults.push({ feedId: feed.id, items });
        } catch (err) {
          errors.push(`${feed.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );

    const latestConfig = this.ctx.getConfig();
    const latestShouldRun =
      latestConfig.sources.rss.enabled &&
      (latestConfig.activeChannel === 'all' || latestConfig.activeChannel === 'rss');
    if (!latestShouldRun) {
      return;
    }

    const latestEnabledFeedIds = new Set(
      latestConfig.sources.rss.feeds.filter((f) => f.enabled).map((f) => f.id),
    );
    const collected: TickerItem[] = [];
    for (const { feedId, items } of perFeedResults) {
      if (!latestEnabledFeedIds.has(feedId)) continue;
      if (items.length === 0) continue;
      const currentIds = new Set(items.map((item) => item.id));
      this.ctx.retainSourceKeyItems(`rss:${feedId}`, currentIds);
      const prevSeen = this.seenIdsByFeed.get(feedId) ?? new Set<string>();
      for (const item of items) {
        if (!prevSeen.has(item.id)) {
          collected.push(item);
        }
      }
      this.seenIdsByFeed.set(feedId, currentIds);
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
