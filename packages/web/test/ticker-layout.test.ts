import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type TickerItem } from '@cathobar/shared';
import { resolveItemIcon } from '../src/engine/pixel-icons.js';
import {
  computeEffectiveChannel,
  computeEdgeAlpha,
  computeLogicalSize,
  TickerLayoutEngine,
} from '../src/engine/ticker-layout.js';

describe('computeLogicalSize', () => {
  it('adapts logical width to arbitrary monitor aspect ratios including low LED rows', () => {
    expect(computeLogicalSize(1920, 480, 96)).toEqual({ width: 384, height: 96 });
    expect(computeLogicalSize(1920, 480, 24)).toEqual({ width: 96, height: 24 });
    expect(computeLogicalSize(1280, 400, 96)).toEqual({ width: 307, height: 96 });
    expect(computeLogicalSize(640, 96, 96)).toEqual({ width: 640, height: 96 });
    expect(computeLogicalSize(100, 100, 96)).toEqual({ width: 160, height: 96 });
  });
});

describe('computeEdgeAlpha', () => {
  it('fades smoothly near left and right edges', () => {
    expect(computeEdgeAlpha(100, 80, 400, 20)).toBe(1);
    expect(computeEdgeAlpha(395, 80, 400, 20)).toBeCloseTo(0.25);
    expect(computeEdgeAlpha(-70, 80, 400, 20)).toBeCloseTo(0.5);
  });
});

describe('TickerLayoutEngine', () => {
  const measure = (text: string, size: number, weight = 500) =>
    text.length * size * (weight >= 700 ? 0.68 : 0.6);

  const makeItem = (
    id: string,
    text: string,
    opts: {
      source?: TickerItem['source'];
      priority?: 'normal' | 'high';
      oneShot?: boolean;
    } = {},
  ): TickerItem => ({
    id,
    source: opts.source ?? 'rss',
    badge: 'NEWS',
    text,
    color: '#38bdf8',
    timestamp: 1000,
    priority: opts.priority ?? 'normal',
    oneShot: opts.oneShot ?? false,
    breaking: false,
  });

  it('places items across lanes without overlapping and measures bold badge widths', () => {
    const engine = new TickerLayoutEngine();
    engine.setPool([makeItem('1', 'Item One'), makeItem('2', 'Item Two')], 'all');
    engine.enqueue([makeItem('p1', 'Urgent Push', { priority: 'high' })], 'all');

    const spans = engine.step({
      dtSec: 0.016,
      tickerWidth: 400,
      tickerHeight: 82,
      logicalHeight: 96,
      lanes: 2,
      layoutMode: 'lanes',
      visualMode: 'anobar8-vfd',
      shinkansenStyle: 'pause-head',
      activeChannel: 'all',
      scrollSpeed: 70,
      showBadge: true,
      measureText: measure,
    });

    expect(spans).toHaveLength(2);
    expect(spans[0]?.lane).toBe(0);
    expect(spans[0]?.item.id).toBe('p1');
    expect(spans[0]?.badgeWidth).toBeGreaterThan(0);
    expect(spans[1]?.lane).toBe(1);
  });

  it('plays oneShot items once and never retains them in the looping pool', () => {
    const engine = new TickerLayoutEngine();
    engine.setPool([], 'all');
    engine.enqueue([makeItem('once', 'One Time Only', { oneShot: true, priority: 'high' })], 'all');

    const first = engine.step({
      dtSec: 0.016,
      tickerWidth: 300,
      tickerHeight: 82,
      logicalHeight: 96,
      lanes: 1,
      layoutMode: 'lanes',
      visualMode: 'anobar8-vfd',
      shinkansenStyle: 'pause-head',
      activeChannel: 'all',
      scrollSpeed: 1000,
      showBadge: true,
      measureText: measure,
    });
    expect(first).toHaveLength(1);
    expect(first[0]?.item.id).toBe('once');

    for (let i = 0; i < 15; i += 1) {
      engine.step({
        dtSec: 0.1,
        tickerWidth: 300,
        tickerHeight: 82,
        logicalHeight: 96,
        lanes: 1,
        layoutMode: 'lanes',
        visualMode: 'anobar8-vfd',
        shinkansenStyle: 'pause-head',
        activeChannel: 'all',
        scrollSpeed: 1000,
        showBadge: true,
        measureText: measure,
      });
    }

    const after = engine.step({
      dtSec: 0.016,
      tickerWidth: 300,
      tickerHeight: 82,
      logicalHeight: 96,
      lanes: 1,
      layoutMode: 'lanes',
      visualMode: 'anobar8-vfd',
      shinkansenStyle: 'pause-head',
      activeChannel: 'all',
      scrollSpeed: 70,
      showBadge: true,
      measureText: measure,
    });
    expect(after).toHaveLength(0);
  });

  it('spawns danmaku free-flow items across multiple vertical slots', () => {
    const engine = new TickerLayoutEngine();
    engine.enqueue(
      [
        makeItem('d1', '弾幕1', { source: 'mastodon', oneShot: true }),
        makeItem('d2', '弾幕2', { source: 'mastodon', oneShot: true }),
        makeItem('d3', '弾幕3', { source: 'mastodon', oneShot: true }),
      ],
      'mastodon',
    );

    const spans = engine.step({
      dtSec: 0.016,
      tickerWidth: 400,
      tickerHeight: 82,
      logicalHeight: 96,
      lanes: 1,
      layoutMode: 'danmaku',
      visualMode: 'anobar8-vfd',
      shinkansenStyle: 'pause-head',
      activeChannel: 'mastodon',
      scrollSpeed: 70,
      showBadge: true,
      measureText: measure,
    });

    expect(spans).toHaveLength(3);
    const yRatios = new Set(spans.map((s) => s.yRatio));
    expect(yRatios.size).toBe(3);
  });

  it('runs Shinkansen LED pause-head choreography (slide-in -> pause -> scroll)', () => {
    const engine = new TickerLayoutEngine();
    engine.setPool(
      [makeItem('s1', '東北新幹線はやぶさ号 車内文字ニュース表示のテスト長文テキストです')],
      'all',
    );

    const stepShinkansen = (dtSec: number) =>
      engine.step({
        dtSec,
        tickerWidth: 96,
        tickerHeight: 21,
        logicalHeight: 24,
        lanes: 1,
        layoutMode: 'auto',
        visualMode: 'shinkansen-led',
        shinkansenStyle: 'pause-head',
        activeChannel: 'all',
        scrollSpeed: 24,
        showBadge: true,
        measureText: measure,
      });

    // Slide-in phase
    const initial = stepShinkansen(0.05);
    expect(initial).toHaveLength(1);
    expect(initial[0]?.x).toBe(4);
    expect(initial[0]?.yRatio).toBeGreaterThan(0.52);

    // Finish slide-in (0.3s total) -> now paused at head (x=4, yRatio=0.52)
    for (let i = 0; i < 4; i += 1) stepShinkansen(0.08);
    const paused = stepShinkansen(0.05);
    expect(paused[0]?.x).toBe(4);
    expect(paused[0]?.yRatio).toBeCloseTo(0.52);

    // Finish 1.3s pause -> starts scrolling left (x < 4)
    for (let i = 0; i < 16; i += 1) stepShinkansen(0.1);
    const scrolling = stepShinkansen(0.1);
    expect(scrolling[0]?.x).toBeLessThan(4);
  });

  it('prunes pool, priorityQueue, active spans, and shinkansenState when a source is disabled in ALL MIX', () => {
    const sources = structuredClone(DEFAULT_CONFIG.sources);
    const rssItem = makeItem('r1', 'RSS Item', { source: 'rss' });
    const wikiItem = makeItem('w1', 'Wiki Item', { source: 'wikipedia', priority: 'high' });

    const engine = new TickerLayoutEngine();
    engine.setPool([rssItem, wikiItem], 'all', sources);
    engine.enqueue([wikiItem], 'all', sources);

    const initialSpans = engine.step({
      dtSec: 0.016,
      tickerWidth: 400,
      tickerHeight: 82,
      logicalHeight: 96,
      lanes: 2,
      layoutMode: 'lanes',
      visualMode: 'anobar8-vfd',
      shinkansenStyle: 'scroll',
      activeChannel: 'all',
      scrollSpeed: 70,
      showBadge: true,
      measureText: measure,
    });
    expect(initialSpans.some((s) => s.item.source === 'wikipedia')).toBe(true);

    // Disable wikipedia and sync pool
    sources.wikipedia.enabled = false;
    engine.setPool([rssItem, wikiItem], 'all', sources);

    const afterDisable = engine.step({
      dtSec: 0.016,
      tickerWidth: 400,
      tickerHeight: 82,
      logicalHeight: 96,
      lanes: 2,
      layoutMode: 'lanes',
      visualMode: 'anobar8-vfd',
      shinkansenStyle: 'scroll',
      activeChannel: 'all',
      scrollSpeed: 70,
      showBadge: true,
      measureText: measure,
    });
    expect(afterDisable.some((s) => s.item.source === 'wikipedia')).toBe(false);
    expect(afterDisable.some((s) => s.item.source === 'rss')).toBe(true);

    // Also verify shinkansen-led pause-head clears disabled active item immediately
    const shinkansenEngine = new TickerLayoutEngine();
    const enabledSources = structuredClone(DEFAULT_CONFIG.sources);
    shinkansenEngine.setPool([wikiItem], 'all', enabledSources);
    const shinkansenInitial = shinkansenEngine.step({
      dtSec: 0.05,
      tickerWidth: 96,
      tickerHeight: 21,
      logicalHeight: 24,
      lanes: 1,
      layoutMode: 'auto',
      visualMode: 'shinkansen-led',
      shinkansenStyle: 'pause-head',
      activeChannel: 'all',
      scrollSpeed: 24,
      showBadge: true,
      measureText: measure,
    });
    expect(shinkansenInitial).toHaveLength(1);

    enabledSources.wikipedia.enabled = false;
    shinkansenEngine.setPool([wikiItem], 'all', enabledSources);
    const shinkansenAfter = shinkansenEngine.step({
      dtSec: 0.05,
      tickerWidth: 96,
      tickerHeight: 21,
      logicalHeight: 24,
      lanes: 1,
      layoutMode: 'auto',
      visualMode: 'shinkansen-led',
      shinkansenStyle: 'pause-head',
      activeChannel: 'all',
      scrollSpeed: 24,
      showBadge: true,
      measureText: measure,
    });
    expect(shinkansenAfter).toHaveLength(0);
  });

  it('filters individual disabled RSS feeds via sourceKey and drops disabled items on enqueue', () => {
    const sources = structuredClone(DEFAULT_CONFIG.sources);
    sources.wikipedia.enabled = false;
    sources.rss.feeds = sources.rss.feeds.map((f) =>
      f.id === 'nhk-news' ? { ...f, enabled: false } : f,
    );

    const nhkItem: TickerItem = {
      ...makeItem('nhk1', 'NHK Headline', { source: 'rss' }),
      sourceKey: 'rss:nhk-news',
    };
    const itmediaItem: TickerItem = {
      ...makeItem('it1', 'ITmedia Headline', { source: 'rss' }),
      sourceKey: 'rss:itmedia-news',
    };
    const disabledWiki = makeItem('w-off', 'Disabled Wiki', {
      source: 'wikipedia',
      priority: 'high',
      oneShot: true,
    });
    const pushItem = makeItem('push1', 'Push Notice', {
      source: 'push',
      priority: 'high',
      oneShot: true,
    });

    const engine = new TickerLayoutEngine();
    engine.setPool([nhkItem, itmediaItem], 'all', sources);
    engine.enqueue([disabledWiki, pushItem], 'all', sources);

    const spans = engine.step({
      dtSec: 0.016,
      tickerWidth: 400,
      tickerHeight: 82,
      logicalHeight: 96,
      lanes: 2,
      layoutMode: 'lanes',
      visualMode: 'anobar8-vfd',
      shinkansenStyle: 'scroll',
      activeChannel: 'all',
      scrollSpeed: 70,
      showBadge: true,
      measureText: measure,
    });

    expect(spans.some((s) => s.item.id === 'nhk1')).toBe(false);
    expect(spans.some((s) => s.item.id === 'w-off')).toBe(false);
    expect(spans.some((s) => s.item.id === 'it1')).toBe(true);
    expect(spans.some((s) => s.item.id === 'push1')).toBe(true);
  });

  it('distributes ALL MIX items by Smooth Weighted Round-Robin and excludes weight 0', () => {
    const engine = new TickerLayoutEngine();
    engine.setPool(
      [
        makeItem('r1', 'RSS News', { source: 'rss' }),
        makeItem('w1', 'Wiki Fact', { source: 'wikipedia' }),
        makeItem('m1', 'Mastodon Note', { source: 'mastodon' }),
      ],
      'all',
      undefined,
      { rss: 3, wikipedia: 1, mastodon: 0 },
    );

    const pickedSources: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const spans = engine.step({
        dtSec: 0.016,
        tickerWidth: 50,
        tickerHeight: 82,
        logicalHeight: 96,
        lanes: 1,
        layoutMode: 'lanes',
        visualMode: 'anobar8-vfd',
        shinkansenStyle: 'scroll',
        activeChannel: 'all',
        scrollSpeed: 5000,
        showBadge: true,
        showPixelIcons: true,
        measureText: measure,
      });
      if (spans[0]) {
        pickedSources.push(spans[0].item.source);
        expect(spans[0].iconWidth).toBeGreaterThan(0);
      }
      engine.step({
        dtSec: 0.5,
        tickerWidth: 50,
        tickerHeight: 82,
        logicalHeight: 96,
        lanes: 1,
        layoutMode: 'lanes',
        visualMode: 'anobar8-vfd',
        shinkansenStyle: 'scroll',
        activeChannel: 'all',
        scrollSpeed: 5000,
        showBadge: true,
        showPixelIcons: true,
        measureText: measure,
      });
    }

    expect(pickedSources).not.toContain('mastodon');
    expect(pickedSources.filter((s) => s === 'rss')).toHaveLength(3);
    expect(pickedSources.filter((s) => s === 'wikipedia')).toHaveLength(1);
  });
});

describe('computeEffectiveChannel & resolveItemIcon', () => {
  it('rotates channels deterministically without mutating config', () => {
    const cfg = {
      activeChannel: 'all' as const,
      rotation: {
        enabled: true,
        intervalSec: 30,
        channels: ['rss', 'weather', 'market'] as typeof DEFAULT_CONFIG.rotation.channels,
      },
    };
    expect(computeEffectiveChannel(cfg, 0).channel).toBe('rss');
    expect(computeEffectiveChannel(cfg, 30_000).channel).toBe('weather');
    expect(computeEffectiveChannel(cfg, 60_000).channel).toBe('market');
    expect(computeEffectiveChannel(cfg, 90_000).channel).toBe('rss');
  });

  it('resolves sensible fallback pixel icons by source', () => {
    expect(
      resolveItemIcon({
        id: '1',
        source: 'earthquake',
        badge: '地震',
        text: 'テスト',
        color: '#fff',
        timestamp: 1,
        priority: 'normal',
        oneShot: false,
        breaking: false,
      }),
    ).toBe('quake');
  });
});
