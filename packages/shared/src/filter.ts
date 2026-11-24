import type { AppConfig, SourcesConfig, TickerItem } from './schema.js';

/**
 * Returns whether a TickerItem belongs to an enabled source (and feed/location if applicable).
 */
export function isItemEnabledBySources(item: TickerItem, sources: SourcesConfig): boolean {
  switch (item.source) {
    case 'rss': {
      if (!sources.rss.enabled) return false;
      if (item.sourceKey) {
        return sources.rss.feeds.some((f) => f.enabled && `rss:${f.id}` === item.sourceKey);
      }
      return sources.rss.feeds.length === 0 || sources.rss.feeds.some((f) => f.enabled);
    }
    case 'wikipedia':
      return sources.wikipedia.enabled;
    case 'weather': {
      if (!sources.weather.enabled) return false;
      const key = item.sourceKey ?? item.replaceKey;
      if (key) {
        return sources.weather.locations.some((l) => l.enabled && `weather:${l.id}` === key);
      }
      return (
        sources.weather.locations.length === 0 ||
        sources.weather.locations.some((l) => l.enabled)
      );
    }
    case 'mastodon':
      return sources.mastodon.enabled;
    case 'push':
    case 'clock':
      return true;
  }
}

/**
 * Returns whether a TickerItem should be shown under the active channel and source toggles.
 */
export function isItemAllowedByConfig(
  item: TickerItem,
  config: Pick<AppConfig, 'activeChannel' | 'sources'>,
): boolean {
  if (config.activeChannel === 'clock') return false;
  if (!isItemEnabledBySources(item, config.sources)) return false;
  if (config.activeChannel === 'all') return true;
  return item.source === config.activeChannel || item.source === 'push';
}
