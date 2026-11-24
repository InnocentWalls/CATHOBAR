import type {
  AppConfig,
  ChannelId,
  SourcesConfig,
  TickerItem,
  TickerSourceId,
} from './schema.js';

/**
 * Returns whether a TickerSourceId belongs to the given display ChannelId.
 */
export function sourceMatchesChannel(source: TickerSourceId, channel: ChannelId): boolean {
  if (channel === 'clock') return false;
  if (channel === 'all') return source !== 'clock';
  if (source === 'push' || source === 'webhook') return true;
  if (channel === 'disaster') {
    return source === 'earthquake' || source === 'transit';
  }
  return source === channel;
}

/**
 * Returns whether a specific channel is currently active directly or via channel rotation.
 */
export function isChannelActiveInConfig(
  config: Pick<AppConfig, 'activeChannel' | 'rotation'>,
  targetChannel: ChannelId,
): boolean {
  if (config.activeChannel === 'all' || config.activeChannel === targetChannel) {
    return true;
  }
  if (config.rotation.enabled) {
    return config.rotation.channels.some((c) => c === 'all' || c === targetChannel);
  }
  return false;
}

/**
 * Checks whether an item's text or badge matches any configured mute keyword.
 * Supports `/regex/flags` syntax as well as case-insensitive substring matching.
 */
export function matchesMuteKeywords(
  text: string,
  badge: string,
  muteKeywords: string[],
): boolean {
  if (muteKeywords.length === 0) return false;
  const target = `${badge} ${text}`;
  const lower = target.toLowerCase();

  for (const rawRule of muteKeywords) {
    const rule = rawRule.trim();
    if (!rule) continue;
    if (rule.startsWith('/') && rule.lastIndexOf('/') > 0) {
      const lastSlash = rule.lastIndexOf('/');
      const pattern = rule.slice(1, lastSlash);
      const flags = rule.slice(lastSlash + 1);
      try {
        const re = new RegExp(pattern, flags.includes('i') ? flags : `${flags}i`);
        if (re.test(target)) return true;
        continue;
      } catch {
        // Fallback to plain substring match if regex is invalid
      }
    }
    if (lower.includes(rule.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Returns whether a TickerItem belongs to an enabled source (and feed/location/event if applicable).
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
    case 'earthquake':
      return sources.earthquake.enabled;
    case 'transit': {
      if (!sources.transit.enabled) return false;
      if (item.sourceKey && item.sourceKey.startsWith('transit:feed:')) {
        const feedId = item.sourceKey.slice('transit:feed:'.length);
        return sources.transit.customFeeds.some((f) => f.enabled && f.id === feedId);
      }
      return true;
    }
    case 'market': {
      if (!sources.market.enabled) return false;
      const key = item.sourceKey ?? item.replaceKey;
      if (key && key.startsWith('market:')) {
        const symId = key.slice('market:'.length);
        return sources.market.symbols.some((s) => s.enabled && s.id === symId);
      }
      return sources.market.symbols.length === 0 || sources.market.symbols.some((s) => s.enabled);
    }
    case 'nowplaying':
      return sources.nowplaying.enabled;
    case 'countdown': {
      if (!sources.countdown.enabled) return false;
      const key = item.sourceKey ?? item.replaceKey;
      if (key && key.startsWith('countdown:')) {
        const evId = key.slice('countdown:'.length);
        return sources.countdown.events.some((ev) => ev.enabled && ev.id === evId);
      }
      return true;
    }
    case 'webhook':
      return sources.webhook.enabled;
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
  if (item.breaking) return true;
  if (config.activeChannel === 'clock') return false;
  if (!isItemEnabledBySources(item, config.sources)) return false;
  return sourceMatchesChannel(item.source, config.activeChannel);
}
