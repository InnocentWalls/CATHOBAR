import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  AppConfigSchema,
  DEFAULT_CONFIG,
  PartialAppConfigSchema,
  type AppConfig,
  type PartialAppConfig,
} from '@cathobar/shared';

/**
 * Persists application configuration to disk as JSON with atomic writes.
 */
export class ConfigStore {
  private readonly filePath: string;
  private config: AppConfig;

  constructor(filePath = resolve(process.cwd(), 'data', 'config.json')) {
    this.filePath = filePath;
    this.config = structuredClone(DEFAULT_CONFIG);
  }

  async load(): Promise<AppConfig> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      this.config = this.mergeWithDefaults(parsed);
      if (hasMigratedRssFeedUrl(parsed, this.config)) {
        await this.save();
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        this.config = structuredClone(DEFAULT_CONFIG);
        await this.save();
      } else {
        console.warn('[ConfigStore] Failed to parse config, using defaults:', err);
        this.config = structuredClone(DEFAULT_CONFIG);
      }
    }
    return this.get();
  }

  get(): AppConfig {
    return structuredClone(this.config);
  }

  async patch(input: unknown): Promise<AppConfig> {
    const patchData = PartialAppConfigSchema.parse(input);
    const next = this.applyPatch(this.config, patchData);
    this.config = AppConfigSchema.parse(next);
    await this.save();
    return this.get();
  }

  async save(): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(this.config, null, 2)}\n`, 'utf-8');
    await rename(tmpPath, this.filePath);
  }

  private mergeWithDefaults(raw: unknown): AppConfig {
    if (!raw || typeof raw !== 'object') {
      return structuredClone(DEFAULT_CONFIG);
    }
    const obj = raw as Record<string, unknown>;
    const rawSources = isPlainObject(obj.sources) ? obj.sources : {};
    const rawRss = isPlainObject(rawSources.rss) ? rawSources.rss : {};
    const rawWeather = isPlainObject(rawSources.weather) ? rawSources.weather : {};

    const rssFeeds = Array.isArray(rawRss.feeds)
      ? rawRss.feeds.map((entry) =>
        isPlainObject(entry) && typeof entry.url === 'string'
          ? { ...entry, url: migrateLegacyRssUrl(entry.url) }
          : entry,
      )
      : DEFAULT_CONFIG.sources.rss.feeds;

    // Migrate legacy single-city weather config to multi-location array
    let weatherLocations = DEFAULT_CONFIG.sources.weather.locations;
    if (Array.isArray(rawWeather.locations)) {
      weatherLocations = rawWeather.locations;
    } else if (typeof rawWeather.cityName === 'string') {
      weatherLocations = [
        {
          id: 'migrated-primary',
          cityName: rawWeather.cityName,
          latitude:
            typeof rawWeather.latitude === 'number'
              ? rawWeather.latitude
              : DEFAULT_CONFIG.sources.weather.locations[0]!.latitude,
          longitude:
            typeof rawWeather.longitude === 'number'
              ? rawWeather.longitude
              : DEFAULT_CONFIG.sources.weather.locations[0]!.longitude,
          enabled: true,
        },
      ];
    }

    const activeChannel =
      obj.activeChannel === 'bluesky' ? 'mastodon' : (obj.activeChannel ?? DEFAULT_CONFIG.activeChannel);

    const merged = {
      ...DEFAULT_CONFIG,
      ...obj,
      activeChannel,
      display: {
        ...DEFAULT_CONFIG.display,
        ...(isPlainObject(obj.display) ? obj.display : {}),
      },
      sources: {
        rss: {
          ...DEFAULT_CONFIG.sources.rss,
          ...rawRss,
          feeds: rssFeeds,
        },
        wikipedia: {
          ...DEFAULT_CONFIG.sources.wikipedia,
          ...(isPlainObject(rawSources.wikipedia) ? rawSources.wikipedia : {}),
        },
        weather: {
          enabled:
            typeof rawWeather.enabled === 'boolean'
              ? rawWeather.enabled
              : DEFAULT_CONFIG.sources.weather.enabled,
          pollIntervalSec:
            typeof rawWeather.pollIntervalSec === 'number'
              ? rawWeather.pollIntervalSec
              : DEFAULT_CONFIG.sources.weather.pollIntervalSec,
          locations: weatherLocations,
        },
        mastodon: {
          ...DEFAULT_CONFIG.sources.mastodon,
          ...(isPlainObject(rawSources.mastodon) ? rawSources.mastodon : {}),
        },
      },
    };
    return AppConfigSchema.parse(merged);
  }

  private applyPatch(current: AppConfig, patch: PartialAppConfig): AppConfig {
    return {
      version: 1,
      activeChannel: patch.activeChannel ?? current.activeChannel,
      display: {
        ...current.display,
        ...(patch.display ?? {}),
      },
      sources: {
        rss: {
          ...current.sources.rss,
          ...(patch.sources?.rss ?? {}),
        },
        wikipedia: {
          ...current.sources.wikipedia,
          ...(patch.sources?.wikipedia ?? {}),
        },
        weather: {
          ...current.sources.weather,
          ...(patch.sources?.weather ?? {}),
        },
        mastodon: {
          ...current.sources.mastodon,
          ...(patch.sources?.mastodon ?? {}),
        },
      },
    };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function migrateLegacyRssUrl(url: string): string {
  return url.replace(
    /^https?:\/\/www3\.nhk\.or\.jp\/rss\/news\/(cat\d+\.xml)$/i,
    'https://news.web.nhk/n-data/conf/na/rss/$1',
  );
}

function hasMigratedRssFeedUrl(raw: unknown, merged: AppConfig): boolean {
  if (!isPlainObject(raw) || !isPlainObject(raw.sources) || !isPlainObject(raw.sources.rss)) {
    return false;
  }
  const rawFeeds = raw.sources.rss.feeds;
  if (!Array.isArray(rawFeeds)) return false;
  return rawFeeds.some((entry, idx) => {
    if (!isPlainObject(entry) || typeof entry.url !== 'string') return false;
    return merged.sources.rss.feeds[idx]?.url !== entry.url;
  });
}
