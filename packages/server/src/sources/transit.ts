import {
  isChannelActiveInConfig,
  type AppConfig,
  type TickerItem,
  type TransitSourceConfig,
} from '@cathobar/shared';
import { parseRssXml } from './rss.js';
import { cleanText, type SourceContext, type TickerSource } from './types.js';

const RAILWAY_NAME_MAP: Record<string, string> = {
  'Toei.Asakusa': '都営浅草線',
  'Toei.Mita': '都営三田線',
  'Toei.Shinjuku': '都営新宿線',
  'Toei.Oedo': '都営大江戸線',
  'Toei.Arakawa': '東京さくらトラム',
  'Toei.NipporiToneri': '日暮里・舎人ライナー',
  'TokyoMetro.Ginza': '東京メトロ銀座線',
  'TokyoMetro.Marunouchi': '東京メトロ丸ノ内線',
  'TokyoMetro.Hibiya': '東京メトロ日比谷線',
  'TokyoMetro.Tozai': '東京メトロ東西線',
  'TokyoMetro.Chiyoda': '東京メトロ千代田線',
  'TokyoMetro.Yurakucho': '東京メトロ有楽町線',
  'TokyoMetro.Hanzomon': '東京メトロ半蔵門線',
  'TokyoMetro.Namboku': '東京メトロ南北線',
  'TokyoMetro.Fukutoshin': '東京メトロ副都心線',
  'JR-East.Yamanote': 'JR山手線',
  'JR-East.ChuoRapid': 'JR中央線快速',
  'JR-East.ChuoSobuLocal': 'JR中央・総武線',
  'JR-East.KeihinTohokuNegishi': 'JR京浜東北線',
  'JR-East.Tokaido': 'JR東海道線',
  'JR-East.SaikyoKawagoe': 'JR埼京線',
  'JR-East.ShonanShinjuku': 'JR湘南新宿ライン',
  'JR-East.SobuRapid': 'JR総武線快速',
  'JR-East.Joban': 'JR常磐線',
  'JR-East.Keiyo': 'JR京葉線',
};

interface OdptTrainInfoEntry {
  'owl:sameAs'?: string;
  'odpt:railway'?: string;
  'odpt:railwayTitle'?: { ja?: string; en?: string };
  'odpt:trainInformationStatus'?: { ja?: string; en?: string };
  'odpt:trainInformationText'?: { ja?: string; en?: string };
}

function resolveLineName(entry: OdptTrainInfoEntry): string {
  const titleJa = entry['odpt:railwayTitle']?.ja?.trim();
  if (titleJa) return titleJa;

  const rawRailway = entry['odpt:railway'] ?? entry['owl:sameAs'] ?? '';
  const shortKey = rawRailway.split(':').pop() ?? rawRailway;
  return RAILWAY_NAME_MAP[shortKey] ?? shortKey.replace('.', ' ');
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
 * Parses ODPT TrainInformation JSON array into normalized TickerItems.
 */
export function parseOdptTrainInfo(
  raw: unknown,
  cfg: TransitSourceConfig,
  prevSuspendedKeys?: Set<string>,
): { items: TickerItem[]; suspendedKeys: Set<string> } {
  if (!Array.isArray(raw)) {
    return { items: [], suspendedKeys: new Set() };
  }

  const items: TickerItem[] = [];
  const suspendedKeys = new Set<string>();
  const now = Date.now();
  const normalizedFilters = cfg.lineFilter.map((f) => f.trim().toLowerCase()).filter(Boolean);

  for (const entry of raw as OdptTrainInfoEntry[]) {
    if (!entry || typeof entry !== 'object') continue;
    const lineName = resolveLineName(entry);
    if (!lineName) continue;

    if (
      normalizedFilters.length > 0 &&
      !normalizedFilters.some((f) => lineName.toLowerCase().includes(f))
    ) {
      continue;
    }

    const statusText = cleanText(entry['odpt:trainInformationStatus']?.ja ?? '');
    const bodyText = cleanText(entry['odpt:trainInformationText']?.ja ?? '');
    const normal = isNormalOperation(statusText, bodyText);
    if (cfg.onlyProblems && normal) {
      continue;
    }

    const severe = !normal && isSevereSuspension(statusText, bodyText);
    const key = `transit:odpt:${entry['odpt:railway'] ?? entry['owl:sameAs'] ?? lineName}`;
    if (severe) {
      suspendedKeys.add(key);
    }

    const newlySuspended =
      cfg.breakingOnSuspension &&
      severe &&
      prevSuspendedKeys !== undefined &&
      !prevSuspendedKeys.has(key);

    const summary = statusText && !bodyText.includes(statusText)
      ? `${statusText} — ${bodyText}`
      : bodyText || statusText || '平常運転';

    items.push({
      id: `${key}-${now}`,
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

  return { items, suspendedKeys };
}

export class TransitSource implements TickerSource {
  readonly id = 'transit' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalSec = 180;
  private knownSuspendedKeys: Set<string> | undefined = undefined;
  private seenFeedIds = new Set<string>();

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
    const intervalChanged = this.pollIntervalSec !== config.sources.transit.pollIntervalSec;
    if (!this.timer || intervalChanged) {
      this.pollIntervalSec = config.sources.transit.pollIntervalSec;
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
          const parsed = parseOdptTrainInfo(json, t, this.knownSuspendedKeys);
          collected.push(...parsed.items);
          for (const k of parsed.suspendedKeys) nextSuspended.add(k);
          successCount += 1;
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }),
    );

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
          const feedItems = parseRssXml(xml, feed).map((it) => ({
            ...it,
            id: `transit-${it.id}`,
            source: 'transit' as const,
            icon: 'train' as const,
            sourceKey: `transit:feed:${feed.id}`,
          }));
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
