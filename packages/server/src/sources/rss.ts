import { createHash } from 'node:crypto';
import {
  isChannelActiveInConfig,
  type AppConfig,
  type RssFeedConfig,
  type TickerItem,
} from '@cathobar/shared';
import { cleanText, type SourceContext, type TickerSource } from './types.js';
import { extractLink, extractText, toArray, xmlParser } from './xml-utils.js';

/**
 * Parses RSS 2.0, Atom, and RSS 1.0 (RDF) XML feeds into TickerItems.
 */
export function parseRssXml(xml: string, feed: RssFeedConfig): TickerItem[] {
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;
  const now = Date.now();
  const color = feed.color ?? '#38bdf8';

  const buildItem = (titleRaw: unknown, linkRaw: unknown): TickerItem | null => {
    const title = cleanText(extractText(titleRaw));
    if (!title) return null;
    const url = extractLink(linkRaw);
    const id = createHash('sha1').update(`${feed.id}:${url ?? title}`).digest('hex').slice(0, 16);
    return {
      id: `rss-${id}`,
      source: 'rss',
      badge: feed.name,
      text: title,
      color,
      timestamp: now,
      priority: 'normal',
      oneShot: false,
      breaking: false,
      icon: 'news',
      sourceKey: `rss:${feed.id}`,
      url,
    };
  };

  const rssChannel = (parsed.rss as Record<string, unknown> | undefined)?.channel as
    | Record<string, unknown>
    | undefined;
  if (rssChannel) {
    return toArray(rssChannel.item as Record<string, unknown>[])
      .slice(0, 12)
      .map((item) => buildItem(item.title, item.link))
      .filter((x): x is TickerItem => x !== null);
  }

  const atomFeed = parsed.feed as Record<string, unknown> | undefined;
  if (atomFeed) {
    return toArray(atomFeed.entry as Record<string, unknown>[])
      .slice(0, 12)
      .map((entry) => buildItem(entry.title, entry.link))
      .filter((x): x is TickerItem => x !== null);
  }

  const rdf = parsed['rdf:RDF'] as Record<string, unknown> | undefined;
  if (rdf) {
    return toArray(rdf.item as Record<string, unknown>[])
      .slice(0, 12)
      .map((item) => buildItem(item.title, item.link))
      .filter((x): x is TickerItem => x !== null);
  }

  return [];
}

function buildFeedsSignature(feeds: RssFeedConfig[]): string {
  return feeds
    .filter((f) => f.enabled)
    .map((f) => `${f.id}:${f.name}:${f.url}:${f.color ?? ''}`)
    .join('|');
}

export class RssSource implements TickerSource {
  readonly id = 'rss' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private seenIdsByFeed = new Map<string, Set<string>>();
  private etagByFeed = new Map<string, string>();
  private lastModifiedByFeed = new Map<string, string>();
  private pollIntervalSec = 300;
  private lastFeedsSignature = '';

  constructor(private readonly ctx: SourceContext) {}

  start(): void {
    this.onConfigUpdate(this.ctx.getConfig());
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.seenIdsByFeed.clear();
    this.etagByFeed.clear();
    this.lastModifiedByFeed.clear();
    this.lastFeedsSignature = '';
    this.ctx.updateStatus({ id: this.id, active: false, connected: false });
  }

  onConfigUpdate(config: AppConfig): void {
    const enabledFeedIds = new Set(
      config.sources.rss.feeds.filter((f) => f.enabled).map((f) => f.id),
    );
    for (const feedId of this.seenIdsByFeed.keys()) {
      if (!enabledFeedIds.has(feedId)) {
        this.seenIdsByFeed.delete(feedId);
        this.etagByFeed.delete(feedId);
        this.lastModifiedByFeed.delete(feedId);
      }
    }

    const shouldRun =
      config.sources.rss.enabled && isChannelActiveInConfig(config, 'rss');
    if (!shouldRun) {
      this.stop();
      return;
    }

    const nextSig = buildFeedsSignature(config.sources.rss.feeds);
    const intervalChanged = this.pollIntervalSec !== config.sources.rss.pollIntervalSec;
    const feedsChanged = this.lastFeedsSignature !== nextSig;
    const wasStopped = !this.timer;

    if (wasStopped || intervalChanged) {
      this.pollIntervalSec = config.sources.rss.pollIntervalSec;
      this.syncTimer();
    }
    if (wasStopped || intervalChanged || feedsChanged) {
      this.lastFeedsSignature = nextSig;
      void this.refreshNow();
    }
  }

  async refreshNow(): Promise<void> {
    const config = this.ctx.getConfig();
    const shouldRun =
      config.sources.rss.enabled && isChannelActiveInConfig(config, 'rss');
    if (!shouldRun) {
      this.ctx.updateStatus({ id: this.id, active: false, connected: false });
      return;
    }

    const enabledFeeds = config.sources.rss.feeds.filter((f) => f.enabled);
    this.lastFeedsSignature = buildFeedsSignature(config.sources.rss.feeds);
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
    const perFeedResults: Array<{ feedId: string; items: TickerItem[]; notModified?: boolean }> = [];
    const errors: string[] = [];

    await Promise.all(
      enabledFeeds.map(async (feed) => {
        try {
          const headers: Record<string, string> = {
            'User-Agent': 'CATHOBAR/0.2 (+https://localhost)',
          };
          const prevEtag = this.etagByFeed.get(feed.id);
          const prevLastMod = this.lastModifiedByFeed.get(feed.id);
          if (prevEtag) headers['If-None-Match'] = prevEtag;
          if (prevLastMod) headers['If-Modified-Since'] = prevLastMod;

          const res = await fetch(feed.url, {
            headers,
            signal: AbortSignal.timeout(10_000),
          });
          if (res.status === 304) {
            perFeedResults.push({ feedId: feed.id, items: [], notModified: true });
            return;
          }
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const nextEtag = res.headers?.get?.('etag');
          const nextLastMod = res.headers?.get?.('last-modified');
          if (nextEtag) this.etagByFeed.set(feed.id, nextEtag);
          if (nextLastMod) this.lastModifiedByFeed.set(feed.id, nextLastMod);

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
      latestConfig.sources.rss.enabled && isChannelActiveInConfig(latestConfig, 'rss');
    if (!latestShouldRun) {
      return;
    }

    const latestEnabledFeedIds = new Set(
      latestConfig.sources.rss.feeds.filter((f) => f.enabled).map((f) => f.id),
    );
    const collected: TickerItem[] = [];
    for (const { feedId, items, notModified } of perFeedResults) {
      if (!latestEnabledFeedIds.has(feedId)) continue;
      if (notModified || items.length === 0) continue;
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
