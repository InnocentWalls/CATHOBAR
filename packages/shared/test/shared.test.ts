import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  evaluateNightMode,
  isChannelActiveInConfig,
  isItemAllowedByConfig,
  isItemEnabledBySources,
  isTimeInRange,
  matchesMuteKeywords,
  parseHHMM,
  sourceMatchesChannel,
  type TickerItem,
} from '../src/index.js';

function makeItem(overrides: Partial<TickerItem> = {}): TickerItem {
  return {
    id: 'item-1',
    source: 'rss',
    badge: 'NEWS',
    text: 'テスト記事',
    color: '#38fad9',
    timestamp: 1_700_000_000_000,
    priority: 'normal',
    oneShot: false,
    breaking: false,
    ...overrides,
  };
}

describe('filter helpers', () => {
  it('maps sources to channels accurately via sourceMatchesChannel', () => {
    expect(sourceMatchesChannel('rss', 'clock')).toBe(false);
    expect(sourceMatchesChannel('clock', 'all')).toBe(false);
    expect(sourceMatchesChannel('rss', 'all')).toBe(true);
    expect(sourceMatchesChannel('push', 'market')).toBe(true);
    expect(sourceMatchesChannel('webhook', 'weather')).toBe(true);

    expect(sourceMatchesChannel('nhk-breaking', 'rss')).toBe(true);
    expect(sourceMatchesChannel('nhk-breaking', 'disaster')).toBe(true);
    expect(sourceMatchesChannel('nhk-breaking', 'market')).toBe(false);

    expect(sourceMatchesChannel('earthquake', 'disaster')).toBe(true);
    expect(sourceMatchesChannel('transit', 'disaster')).toBe(true);
    expect(sourceMatchesChannel('countdown', 'countdown')).toBe(true);
    expect(sourceMatchesChannel('calendar', 'countdown')).toBe(true);
    expect(sourceMatchesChannel('sysmon', 'system')).toBe(true);
    expect(sourceMatchesChannel('sensors', 'system')).toBe(true);
    expect(sourceMatchesChannel('weather', 'weather')).toBe(true);
    expect(sourceMatchesChannel('weather', 'rss')).toBe(false);
  });

  it('checks active channel directly and via rotation in isChannelActiveInConfig', () => {
    expect(
      isChannelActiveInConfig(
        {
          activeChannel: 'all',
          rotation: { enabled: false, intervalSec: 45, channels: ['rss'] },
        },
        'weather',
      ),
    ).toBe(true);

    expect(
      isChannelActiveInConfig(
        {
          activeChannel: 'market',
          rotation: { enabled: false, intervalSec: 45, channels: ['rss', 'weather'] },
        },
        'weather',
      ),
    ).toBe(false);

    expect(
      isChannelActiveInConfig(
        {
          activeChannel: 'market',
          rotation: { enabled: true, intervalSec: 45, channels: ['rss', 'weather'] },
        },
        'weather',
      ),
    ).toBe(true);
  });

  it('matches mute keywords using substring, badge, regex, and invalid regex fallback', () => {
    expect(matchesMuteKeywords('通常ニュース', 'NHK', [])).toBe(false);
    expect(matchesMuteKeywords('本日のPR情報', 'RSS', ['pr'])).toBe(true);
    expect(matchesMuteKeywords('通常本文', 'AD-SPONSOR', ['sponsor'])).toBe(true);
    expect(matchesMuteKeywords('期間限定キャンペーン開催', 'INFO', ['/広告|キャンペーン/'])).toBe(true);
    expect(matchesMuteKeywords('壊れた[正規表現テスト', 'INFO', ['/[invalid/'])).toBe(false);
    expect(matchesMuteKeywords('文字列/[invalid/を含む', 'INFO', ['/[invalid/'])).toBe(true);
  });

  it('evaluates source-level and item-level toggles in isItemEnabledBySources & isItemAllowedByConfig', () => {
    const cfg = structuredClone(DEFAULT_CONFIG);
    const firstFeed = cfg.sources.rss.feeds[0]!;
    const firstLoc = cfg.sources.weather.locations[0]!;
    const firstSym = cfg.sources.market.symbols[0]!;

    expect(
      isItemEnabledBySources(makeItem({ source: 'rss', sourceKey: `rss:${firstFeed.id}` }), cfg.sources),
    ).toBe(firstFeed.enabled);
    expect(
      isItemEnabledBySources(makeItem({ source: 'rss', sourceKey: 'rss:nonexistent' }), cfg.sources),
    ).toBe(false);

    expect(
      isItemEnabledBySources(
        makeItem({ source: 'weather', sourceKey: `weather:${firstLoc.id}` }),
        cfg.sources,
      ),
    ).toBe(true);
    expect(
      isItemEnabledBySources(
        makeItem({ source: 'weather', sourceKey: `weather-rain:${firstLoc.id}` }),
        {
          ...cfg.sources,
          weather: { ...cfg.sources.weather, rainAlertEnabled: false },
        },
      ),
    ).toBe(false);
    expect(
      isItemEnabledBySources(
        makeItem({ source: 'weather', sourceKey: `weather-jma:${firstLoc.id}` }),
        {
          ...cfg.sources,
          weather: { ...cfg.sources.weather, jmaWarningEnabled: false },
        },
      ),
    ).toBe(false);

    expect(
      isItemEnabledBySources(makeItem({ source: 'market', sourceKey: `market:${firstSym.id}` }), cfg.sources),
    ).toBe(true);
    expect(
      isItemEnabledBySources(makeItem({ source: 'market', sourceKey: 'market:unknown' }), cfg.sources),
    ).toBe(false);

    expect(
      isItemEnabledBySources(makeItem({ source: 'countdown', sourceKey: 'countdown:missing' }), cfg.sources),
    ).toBe(false);
    expect(
      isItemEnabledBySources(makeItem({ source: 'calendar', sourceKey: 'calendar:missing' }), cfg.sources),
    ).toBe(false);
    expect(
      isItemEnabledBySources(makeItem({ source: 'transit', sourceKey: 'transit:feed:missing' }), cfg.sources),
    ).toBe(false);

    // Breaking items bypass clock mode and disabled channel checks
    expect(
      isItemAllowedByConfig(makeItem({ source: 'earthquake', breaking: true }), {
        activeChannel: 'clock',
        sources: cfg.sources,
      }),
    ).toBe(true);

    expect(
      isItemAllowedByConfig(makeItem({ source: 'rss', breaking: false }), {
        activeChannel: 'clock',
        sources: cfg.sources,
      }),
    ).toBe(false);
  });
});

describe('schedule helpers', () => {
  it('parses HH:MM bounds safely', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('23:59')).toBe(1439);
    expect(parseHHMM(' 07:30 ')).toBe(450);
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('12:60')).toBeNull();
    expect(parseHHMM('9:00')).toBeNull();
  });

  it('evaluates daytime, overnight, and equal time ranges', () => {
    const morning = new Date(2026, 10, 26, 8, 30, 0);
    const midnight = new Date(2026, 10, 26, 0, 15, 0);
    const lateNight = new Date(2026, 10, 26, 23, 30, 0);

    expect(isTimeInRange(morning, '08:00', '18:00')).toBe(true);
    expect(isTimeInRange(lateNight, '08:00', '18:00')).toBe(false);

    expect(isTimeInRange(lateNight, '23:00', '07:00')).toBe(true);
    expect(isTimeInRange(midnight, '23:00', '07:00')).toBe(true);
    expect(isTimeInRange(morning, '23:00', '07:00')).toBe(false);

    expect(isTimeInRange(morning, '12:00', '12:00')).toBe(true);
  });

  it('evaluates nightMode overrides accurately', () => {
    const baseCfg = {
      enabled: true,
      startTime: '23:00',
      endTime: '07:00',
      behavior: 'clock-only' as const,
      brightness: 0.35,
      forceAmberVfd: true,
    };

    const off = evaluateNightMode({ ...baseCfg, enabled: false }, new Date(2026, 10, 26, 2, 0, 0));
    expect(off.active).toBe(false);
    expect(off.brightnessOverride).toBeNull();

    const daytime = evaluateNightMode(baseCfg, new Date(2026, 10, 26, 14, 0, 0));
    expect(daytime.active).toBe(false);

    const active = evaluateNightMode(baseCfg, new Date(2026, 10, 26, 2, 0, 0));
    expect(active).toEqual({
      active: true,
      blackout: false,
      clockOnly: true,
      brightnessOverride: 0.35,
      paletteOverride: 'amber',
    });

    const blackout = evaluateNightMode(
      { ...baseCfg, behavior: 'blackout', forceAmberVfd: false },
      new Date(2026, 10, 26, 23, 30, 0),
    );
    expect(blackout.blackout).toBe(true);
    expect(blackout.clockOnly).toBe(false);
    expect(blackout.paletteOverride).toBeNull();
  });
});
