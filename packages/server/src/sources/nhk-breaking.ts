import { createHash } from 'node:crypto';
import {
  isChannelActiveInConfig,
  type AppConfig,
  type TickerItem,
} from '@cathobar/shared';
import { cleanText, type SourceContext, type TickerSource } from './types.js';
import {
  extractLink,
  extractText,
  normalizeTitleKey,
  parseTimestampMs,
  toArray,
  xmlParser,
} from './xml-utils.js';

const SEEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SEEN_ENTRIES = 500;

export interface NhkBreakingEntry {
  id: string;
  dedupeKey: string;
  titleKey: string;
  title: string;
  url?: string;
  pubDateMs: number | null;
}

/**
 * Parses NHK breaking news (JUST IN / cat-live.xml) RSS/Atom XML into normalized entries.
 */
export function parseNhkBreakingXml(xml: string): NhkBreakingEntry[] {
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;

  const rssChannel = (parsed.rss as Record<string, unknown> | undefined)?.channel as
    | Record<string, unknown>
    | undefined;
  if (rssChannel) {
    return toArray(rssChannel.item as Record<string, unknown>[])
      .slice(0, 12)
      .map((item): NhkBreakingEntry | null => {
        const title = cleanText(extractText(item.title));
        if (!title) return null;
        const url = extractLink(item.link);
        const guid = extractText(item.guid).trim();
        const titleKey = normalizeTitleKey(title);
        const dedupeKey = (guid || url || titleKey).trim();
        if (!dedupeKey) return null;
        const idHash = createHash('sha1').update(dedupeKey).digest('hex').slice(0, 16);
        return {
          id: `nhk-breaking-${idHash}`,
          dedupeKey,
          titleKey,
          title,
          url,
          pubDateMs: parseTimestampMs(item.pubDate ?? item['dc:date']),
        };
      })
      .filter((x): x is NhkBreakingEntry => x !== null);
  }

  const atomFeed = parsed.feed as Record<string, unknown> | undefined;
  if (atomFeed) {
    return toArray(atomFeed.entry as Record<string, unknown>[])
      .slice(0, 12)
      .map((entry): NhkBreakingEntry | null => {
        const title = cleanText(extractText(entry.title));
        if (!title) return null;
        const url = extractLink(entry.link);
        const atomId = extractText(entry.id).trim();
        const titleKey = normalizeTitleKey(title);
        const dedupeKey = (atomId || url || titleKey).trim();
        if (!dedupeKey) return null;
        const idHash = createHash('sha1').update(dedupeKey).digest('hex').slice(0, 16);
        return {
          id: `nhk-breaking-${idHash}`,
          dedupeKey,
          titleKey,
          title,
          url,
          pubDateMs: parseTimestampMs(entry.updated ?? entry.published),
        };
      })
      .filter((x): x is NhkBreakingEntry => x !== null);
  }

  return [];
}

export class NhkBreakingSource implements TickerSource {
  readonly id = 'nhk-breaking' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalSec = 60;
  private lastUrl = '';
  private initialized = false;
  private etag: string | null = null;
  private lastModified: string | null = null;
  // Cumulative 24h history prevents re-triggering on CDN flicker, title edits, or repeated polls.
  private alertedKeys = new Map<string, number>();
  private alertedTitleKeys = new Map<string, number>();

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
    const cfg = config.sources.nhkBreaking;
    if (this.lastUrl && this.lastUrl !== cfg.url) {
      this.initialized = false;
      this.etag = null;
      this.lastModified = null;
    }
    this.lastUrl = cfg.url;

    if (!this.isConfigActive(config)) {
      this.stop();
      return;
    }

    const intervalChanged = this.pollIntervalSec !== cfg.pollIntervalSec;
    if (!this.timer || intervalChanged) {
      this.pollIntervalSec = cfg.pollIntervalSec;
      this.syncTimer();
      void this.refreshNow();
    }
  }

  async refreshNow(): Promise<void> {
    const config = this.ctx.getConfig();
    if (!this.isConfigActive(config)) {
      this.ctx.updateStatus({ id: this.id, active: false, connected: false });
      return;
    }

    const cfg = config.sources.nhkBreaking;
    if (this.lastUrl && this.lastUrl !== cfg.url) {
      this.initialized = false;
      this.etag = null;
      this.lastModified = null;
    }
    this.lastUrl = cfg.url;

    this.ctx.updateStatus({ id: this.id, active: true });

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'CATHOBAR/0.2 (+https://localhost)',
      };
      if (this.etag) headers['If-None-Match'] = this.etag;
      if (this.lastModified) headers['If-Modified-Since'] = this.lastModified;

      const res = await fetch(cfg.url, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      const now = Date.now();
      if (res.status === 304) {
        this.ctx.updateStatus({
          id: this.id,
          active: true,
          connected: true,
          lastFetchAt: now,
          lastError: null,
        });
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const nextEtag = res.headers?.get?.('etag') ?? null;
      const nextLastMod = res.headers?.get?.('last-modified') ?? null;
      if (nextEtag) this.etag = nextEtag;
      if (nextLastMod) this.lastModified = nextLastMod;

      const xml = await res.text();
      const entries = parseNhkBreakingXml(xml);

      const latestConfig = this.ctx.getConfig();
      if (!this.isConfigActive(latestConfig) || latestConfig.sources.nhkBreaking.url !== cfg.url) {
        return;
      }

      const currentIds = new Set(entries.map((e) => e.id));
      this.ctx.retainSourceKeyItems('nhk-breaking', currentIds);
      this.pruneSeenMaps(now);

      const maxAgeMs = latestConfig.sources.nhkBreaking.maxItemAgeMinutes * 60_000;
      const emitted: TickerItem[] = [];

      for (const entry of entries) {
        const alreadySeen =
          this.alertedKeys.has(entry.dedupeKey) ||
          (entry.titleKey.length >= 6 && this.alertedTitleKeys.has(entry.titleKey));

        this.recordSeen(entry, now);
        if (alreadySeen) continue;

        const isFresh = entry.pubDateMs === null || now - entry.pubDateMs <= maxAgeMs;
        const shouldBreak =
          this.initialized && isFresh && latestConfig.display.breakingAlertEnabled;

        emitted.push({
          id: entry.id,
          source: 'nhk-breaking',
          badge: 'NHK速報',
          text: entry.title,
          color: '#ff3b30',
          timestamp: now,
          priority: 'high',
          oneShot: false,
          breaking: shouldBreak,
          icon: shouldBreak ? 'alert' : 'news',
          sourceKey: 'nhk-breaking',
          url: entry.url,
        });
      }

      this.initialized = true;

      if (emitted.length > 0) {
        this.ctx.emitItems(emitted);
      }

      this.ctx.updateStatus({
        id: this.id,
        active: true,
        connected: true,
        lastFetchAt: now,
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

  private isConfigActive(config: AppConfig): boolean {
    return (
      config.sources.nhkBreaking.enabled &&
      (config.display.breakingAlertEnabled ||
        isChannelActiveInConfig(config, 'rss') ||
        isChannelActiveInConfig(config, 'disaster'))
    );
  }

  private syncTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.pollIntervalSec = this.ctx.getConfig().sources.nhkBreaking.pollIntervalSec;
    this.timer = setInterval(() => {
      void this.refreshNow();
    }, this.pollIntervalSec * 1000);
  }

  private recordSeen(entry: NhkBreakingEntry, now: number): void {
    this.alertedKeys.set(entry.dedupeKey, now);
    if (entry.titleKey.length >= 6) {
      this.alertedTitleKeys.set(entry.titleKey, now);
    }
  }

  private pruneSeenMaps(now: number): void {
    const cutoff = now - SEEN_TTL_MS;
    for (const map of [this.alertedKeys, this.alertedTitleKeys]) {
      for (const [key, ts] of map.entries()) {
        if (ts < cutoff) {
          map.delete(key);
        }
      }
      if (map.size > MAX_SEEN_ENTRIES) {
        const keysToDrop = Array.from(map.keys()).slice(0, map.size - MAX_SEEN_ENTRIES);
        for (const k of keysToDrop) {
          map.delete(k);
        }
      }
    }
  }
}
