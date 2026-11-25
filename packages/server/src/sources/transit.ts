import { createHash } from 'node:crypto';
import {
  isChannelActiveInConfig,
  RAILWAY_NAME_MAP,
  type AppConfig,
  type TickerItem,
  type TransitDiscoveredLine,
  type TransitSourceConfig,
} from '@cathobar/shared';
import { parseRssXml } from './rss.js';
import { cleanText, type SourceContext, type TickerSource } from './types.js';

const OPERATOR_NAME_MAP: Record<string, string> = {
  Toei: '都営',
  TokyoMetro: '東京メトロ',
  'JR-East': 'JR東日本',
  Tokyu: '東急',
  Odakyu: '小田急',
  Keio: '京王',
  Seibu: '西武',
  Tobu: '東武',
  Keikyu: '京急',
  Keisei: '京成',
  Sotetsu: '相鉄',
  MIR: 'つくばエクスプレス',
  TWR: 'りんかい線',
  Yurikamome: 'ゆりかもめ',
};

interface OdptTrainInfoEntry {
  'owl:sameAs'?: string;
  'odpt:railway'?: string;
  'odpt:operator'?: string;
  'odpt:railwayTitle'?: { ja?: string; en?: string };
  'odpt:trainInformationStatus'?: { ja?: string; en?: string };
  'odpt:trainInformationText'?: { ja?: string; en?: string };
}

function resolveLineInfo(entry: OdptTrainInfoEntry): {
  shortKey: string;
  canonicalName: string | undefined;
  lineName: string;
  operator: string;
} {
  const rawRailway = entry['odpt:railway'] ?? entry['owl:sameAs'] ?? '';
  const shortKey = rawRailway.split(':').pop() ?? rawRailway;
  const canonicalName = RAILWAY_NAME_MAP[shortKey];
  const titleJa = entry['odpt:railwayTitle']?.ja?.trim();
  const lineName = titleJa || canonicalName || shortKey.replace('.', ' ');

  const rawOp = entry['odpt:operator'] ?? '';
  const opFromField = rawOp.split(':').pop() ?? '';
  const opPrefix = opFromField || (shortKey.includes('.') ? shortKey.split('.')[0] ?? '' : '');
  const operator = OPERATOR_NAME_MAP[opPrefix] ?? (opPrefix || 'その他');

  return { shortKey, canonicalName, lineName, operator };
}

function isNormalOperation(statusText: string, bodyText: string): boolean {
  const combined = `${statusText} ${bodyText}`;
  if (!combined.trim()) return true;
  if (/遅延はありません|平常どおり|平常通り|平常運転/.test(combined)) {
    return !/一部.*(遅れ|見合わせ|運休)/.test(combined);
  }
  return false;
}

function isSevereSuspension(statusText: string, bodyText: string): boolean {
  return /運転見合わせ|見合わせ|運休|不通|ストップ/.test(`${statusText} ${bodyText}`);
}

/**
 * Parses ODPT TrainInformation JSON array into normalized TickerItems and discovered line metadata.
 */
export function parseOdptTrainInfo(
  raw: unknown,
  cfg: TransitSourceConfig,
  prevSuspendedKeys?: Set<string>,
): {
  items: TickerItem[];
  suspendedKeys: Set<string>;
  discoveredLines: TransitDiscoveredLine[];
} {
  if (!Array.isArray(raw)) {
    return { items: [], suspendedKeys: new Set(), discoveredLines: [] };
  }

  const items: TickerItem[] = [];
  const suspendedKeys = new Set<string>();
  const discoveredLines: TransitDiscoveredLine[] = [];
  const now = Date.now();
  const normalizedFilters = cfg.lineFilter.map((f) => f.trim().toLowerCase()).filter(Boolean);

  for (const entry of raw as OdptTrainInfoEntry[]) {
    if (!entry || typeof entry !== 'object') continue;
    const { shortKey, canonicalName, lineName, operator } = resolveLineInfo(entry);
    if (!lineName) continue;

    const statusText = cleanText(entry['odpt:trainInformationStatus']?.ja ?? '');
    const bodyText = cleanText(entry['odpt:trainInformationText']?.ja ?? '');
    const normal = isNormalOperation(statusText, bodyText);
    const severe = !normal && isSevereSuspension(statusText, bodyText);
    const summary =
      statusText && !bodyText.includes(statusText)
        ? `${statusText} — ${bodyText}`
        : bodyText || statusText || '平常運転';

    const railwayKey = entry['odpt:railway'] ?? entry['owl:sameAs'] ?? lineName;
    discoveredLines.push({
      id: shortKey || railwayKey,
      railwayKey,
      name: lineName,
      operator,
      normal,
      severe,
      statusText: summary,
    });

    const candidates = [lineName, canonicalName, shortKey]
      .filter((v): v is string => Boolean(v))
      .map((v) => v.toLowerCase());

    if (
      normalizedFilters.length > 0 &&
      !normalizedFilters.some((f) => candidates.some((c) => c.includes(f)))
    ) {
      continue;
    }

    if (cfg.onlyProblems && normal) {
      continue;
    }

    const key = `transit:odpt:${railwayKey}`;
    if (severe) {
      suspendedKeys.add(key);
    }

    const newlySuspended =
      cfg.breakingOnSuspension &&
      severe &&
      prevSuspendedKeys !== undefined &&
      !prevSuspendedKeys.has(key);

    const contentHash = createHash('sha1')
      .update(`${key}|${summary}|${severe ? 'S' : normal ? 'N' : 'D'}`)
      .digest('hex')
      .slice(0, 16);

    items.push({
      id: `transit-odpt-${contentHash}`,
      source: 'transit',
      badge: `運行:${lineName}`,
      text: summary,
      color: severe ? '#ef4444' : normal ? '#22c55e' : '#f59e0b',
      timestamp: now,
      priority: normal ? 'normal' : 'high',
      oneShot: false,
      breaking: newlySuspended,
      icon: normal ? 'train' : 'train-alert',
      replaceKey: key,
      sourceKey: 'transit:odpt',
    });
  }

  return { items, suspendedKeys, discoveredLines };
}

export class TransitSource implements TickerSource {
  readonly id = 'transit' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalSec = 180;
  private knownSuspendedKeys: Set<string> | undefined = undefined;
  private seenFeedIds = new Set<string>();
  private discoveredLines: TransitDiscoveredLine[] = [];
  private lastOdptRawPayloads: unknown[] = [];
  private lastEndpointSignature = '';
  private lastFilterSignature = '';

  constructor(private readonly ctx: SourceContext) {}

  getDiscoveredLines(): TransitDiscoveredLine[] {
    return [...this.discoveredLines].sort((a, b) => {
      const opCmp = a.operator.localeCompare(b.operator, 'ja');
      return opCmp !== 0 ? opCmp : a.name.localeCompare(b.name, 'ja');
    });
  }

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

    const t = config.sources.transit;
    const nextEndpointSig = this.getEndpointSignature(t);
    const nextFilterSig = this.getFilterSignature(t);

    const intervalChanged = this.pollIntervalSec !== t.pollIntervalSec;
    const endpointChanged = this.lastEndpointSignature !== nextEndpointSig;
    const filterChanged = this.lastFilterSignature !== nextFilterSig;

    this.lastEndpointSignature = nextEndpointSig;
    this.lastFilterSignature = nextFilterSig;

    if (filterChanged && this.lastOdptRawPayloads.length > 0 && !endpointChanged) {
      this.applyCachedOdptFilter(t);
    }

    if (!this.timer || intervalChanged || endpointChanged) {
      this.pollIntervalSec = t.pollIntervalSec;
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

    const t = config.sources.transit;
    this.lastEndpointSignature = this.getEndpointSignature(t);
    this.lastFilterSignature = this.getFilterSignature(t);
    this.ctx.updateStatus({ id: this.id, active: true });

    const endpoints: string[] = [];
    if (t.usePublicOdpt) {
      endpoints.push('https://api-public.odpt.org/api/v4/odpt:TrainInformation');
    }
    if (t.odptToken.trim()) {
      endpoints.push(
        `https://api.odpt.org/api/v4/odpt:TrainInformation?acl:consumerKey=${encodeURIComponent(t.odptToken.trim())}`,
      );
    }

    const collected: TickerItem[] = [];
    const nextSuspended = new Set<string>();
    const rawPayloads: unknown[] = [];
    const discoveredMap = new Map<string, TransitDiscoveredLine>();
    const odptKeepIds = new Set<string>();
    const errors: string[] = [];
    let successCount = 0;

    await Promise.all(
      endpoints.map(async (url) => {
        try {
          const res = await fetch(url, {
            headers: { 'User-Agent': 'CATHOBAR/0.2' },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) throw new Error(`ODPT HTTP ${res.status}`);
          const json = (await res.json()) as unknown;
          rawPayloads.push(json);
          const parsed = parseOdptTrainInfo(json, t, this.knownSuspendedKeys);
          for (const line of parsed.discoveredLines) {
            discoveredMap.set(line.railwayKey, line);
          }
          for (const item of parsed.items) {
            odptKeepIds.add(item.id);
            collected.push(item);
          }
          for (const k of parsed.suspendedKeys) nextSuspended.add(k);
          successCount += 1;
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }),
    );

    if (rawPayloads.length > 0 || endpoints.length === 0) {
      this.lastOdptRawPayloads = rawPayloads;
      this.discoveredLines = Array.from(discoveredMap.values());
      this.ctx.retainSourceKeyItems('transit:odpt', odptKeepIds);
    }

    const normalizedFilters = t.lineFilter.map((f) => f.trim().toLowerCase()).filter(Boolean);
    const enabledFeeds = t.customFeeds.filter((f) => f.enabled);
    await Promise.all(
      enabledFeeds.map(async (feed) => {
        try {
          const res = await fetch(feed.url, {
            headers: { 'User-Agent': 'CATHOBAR/0.2' },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) throw new Error(`${feed.name} HTTP ${res.status}`);
          const xml = await res.text();
          const feedItems = parseRssXml(xml, feed)
            .map((it) => ({
              ...it,
              id: `transit-${it.id}`,
              source: 'transit' as const,
              icon: 'train' as const,
              sourceKey: `transit:feed:${feed.id}`,
            }))
            .filter((it) => {
              if (normalizedFilters.length === 0) return true;
              const target = `${it.badge} ${it.text}`.toLowerCase();
              return normalizedFilters.some((f) => target.includes(f));
            });
          const keepIds = new Set(feedItems.map((i) => i.id));
          this.ctx.retainSourceKeyItems(`transit:feed:${feed.id}`, keepIds);
          for (const item of feedItems) {
            if (!this.seenFeedIds.has(item.id)) {
              this.seenFeedIds.add(item.id);
              collected.push(item);
            }
          }
          successCount += 1;
        } catch (err) {
          errors.push(`${feed.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );

    this.knownSuspendedKeys = nextSuspended;

    if (this.seenFeedIds.size > 400) {
      this.seenFeedIds = new Set(Array.from(this.seenFeedIds).slice(-200));
    }

    if (collected.length > 0) {
      this.ctx.emitItems(collected);
    }

    const totalSources = endpoints.length + enabledFeeds.length;
    this.ctx.updateStatus({
      id: this.id,
      active: true,
      connected: totalSources > 0 && successCount > 0,
      lastFetchAt: Date.now(),
      lastError: errors.length > 0 ? errors.join('; ') : null,
    });
  }

  private applyCachedOdptFilter(t: TransitSourceConfig): void {
    const collected: TickerItem[] = [];
    const nextSuspended = new Set<string>();
    const discoveredMap = new Map<string, TransitDiscoveredLine>();
    const odptKeepIds = new Set<string>();

    for (const raw of this.lastOdptRawPayloads) {
      const parsed = parseOdptTrainInfo(raw, t, this.knownSuspendedKeys);
      for (const line of parsed.discoveredLines) {
        discoveredMap.set(line.railwayKey, line);
      }
      for (const item of parsed.items) {
        odptKeepIds.add(item.id);
        collected.push(item);
      }
      for (const k of parsed.suspendedKeys) nextSuspended.add(k);
    }

    this.discoveredLines = Array.from(discoveredMap.values());
    this.knownSuspendedKeys = nextSuspended;
    this.ctx.retainSourceKeyItems('transit:odpt', odptKeepIds);
    if (collected.length > 0) {
      this.ctx.emitItems(collected);
    }
  }

  private getEndpointSignature(t: TransitSourceConfig): string {
    return JSON.stringify({
      usePublicOdpt: t.usePublicOdpt,
      odptToken: t.odptToken.trim(),
      customFeeds: t.customFeeds,
    });
  }

  private getFilterSignature(t: TransitSourceConfig): string {
    return JSON.stringify({
      lineFilter: t.lineFilter,
      onlyProblems: t.onlyProblems,
      breakingOnSuspension: t.breakingOnSuspension,
    });
  }

  private isConfigActive(config: AppConfig): boolean {
    return (
      config.sources.transit.enabled &&
      (isChannelActiveInConfig(config, 'disaster') || config.sources.transit.breakingOnSuspension)
    );
  }

  private syncTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.pollIntervalSec = this.ctx.getConfig().sources.transit.pollIntervalSec;
    this.timer = setInterval(() => {
      void this.refreshNow();
    }, this.pollIntervalSec * 1000);
  }
}
