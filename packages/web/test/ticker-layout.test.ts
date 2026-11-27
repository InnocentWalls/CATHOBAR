import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, evaluateNightMode, type TickerItem } from '@cathobar/shared';
import {
  computeScreenRegions,
  fitBarBreakingAlert,
  fitBreakingAlertText,
  wrapTextLines,
} from '../src/engine/board-renderer.js';
import { resolveItemIcon } from '../src/engine/pixel-icons.js';
import { generateQrMatrix, renderQrSvg } from '../src/engine/qrcode.js';
import { computeBloomDimensions, computePersistenceDecay } from '../src/engine/renderer-gl.js';
import { SpectrumAnalyzer } from '../src/engine/spectrum-analyzer.js';
import {
  computeEffectiveChannel,
  computeEdgeAlpha,
  computeLogicalSize,
  computeRenderScale,
  computeScreenLogicalSize,
  computeStationBadgeWidth,
  resolveEffectiveScreenLayout,
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
    expect(
      resolveItemIcon({
        id: '2',
        source: 'sysmon',
        badge: 'SYSMON',
        text: 'CPU 10%',
        color: '#fff',
        timestamp: 1,
        priority: 'normal',
        oneShot: false,
        breaking: false,
      }),
    ).toBe('cpu');
  });
});

describe('Night mode, split-flap, station-board, pause nudge & QR code', () => {
  const measure = (text: string, size: number, weight = 500) =>
    text.length * size * (weight >= 700 ? 0.68 : 0.6);

  it('evaluates overnight and daytime night-mode schedules', () => {
    const cfg = {
      enabled: true,
      startTime: '23:00',
      endTime: '07:00',
      behavior: 'dim' as const,
      brightness: 0.3,
      forceAmberVfd: true,
    };
    const lateNight = new Date(2026, 10, 25, 23, 30);
    const earlyMorning = new Date(2026, 10, 26, 3, 15);
    const afternoon = new Date(2026, 10, 25, 14, 0);

    expect(evaluateNightMode(cfg, lateNight)).toMatchObject({
      active: true,
      brightnessOverride: 0.3,
      paletteOverride: 'amber',
    });
    expect(evaluateNightMode(cfg, earlyMorning).active).toBe(true);
    expect(evaluateNightMode(cfg, afternoon).active).toBe(false);
    expect(
      evaluateNightMode({ ...cfg, behavior: 'blackout', forceAmberVfd: false }, lateNight),
    ).toMatchObject({ active: true, blackout: true, paletteOverride: null });
  });

  it('supports split-flap rows, station-board layout, and pause nudgeScroll', () => {
    const item: TickerItem = {
      id: 'sf1',
      source: 'rss',
      badge: 'NHK',
      text: 'パタパタ表示テスト',
      color: '#38bdf8',
      timestamp: 1000,
      priority: 'normal',
      oneShot: false,
      breaking: false,
    };

    const sfEngine = new TickerLayoutEngine();
    sfEngine.setPool([item], 'all');
    const sfSpans = sfEngine.step({
      dtSec: 0.5,
      tickerWidth: 300,
      tickerHeight: 80,
      logicalHeight: 96,
      lanes: 2,
      layoutMode: 'lanes',
      visualMode: 'split-flap',
      shinkansenStyle: 'scroll',
      activeChannel: 'all',
      scrollSpeed: 72,
      showBadge: true,
      measureText: measure,
    });
    expect(sfSpans).toEqual([]);
    expect(sfEngine.getSplitFlapRows()).toHaveLength(2);
    expect(sfEngine.getSplitFlapRows()[0]?.displayText).toBe('パタパタ表示テスト');

    const sbEngine = new TickerLayoutEngine();
    sbEngine.setPool([item], 'all');
    const spans1 = sbEngine.step({
      dtSec: 0.016,
      tickerWidth: 320,
      tickerHeight: 80,
      logicalHeight: 96,
      lanes: 1,
      layoutMode: 'lanes',
      visualMode: 'station-board',
      shinkansenStyle: 'scroll',
      activeChannel: 'all',
      scrollSpeed: 72,
      showBadge: true,
      measureText: measure,
    });
    expect(spans1).toHaveLength(1);
    expect(spans1[0]?.badgeWidth).toBe(0);
    const xBefore = spans1[0]!.x;

    // While paused, step freezes position and nudgeScroll shifts manually
    sbEngine.step({
      dtSec: 0.5,
      tickerWidth: 320,
      tickerHeight: 80,
      logicalHeight: 96,
      lanes: 1,
      layoutMode: 'lanes',
      visualMode: 'station-board',
      shinkansenStyle: 'scroll',
      activeChannel: 'all',
      scrollSpeed: 72,
      showBadge: true,
      paused: true,
      measureText: measure,
    });
    expect(spans1[0]!.x).toBe(xBefore);

    sbEngine.nudgeScroll(-30);
    expect(spans1[0]!.x).toBe(xBefore - 30);
  });

  it('generates valid QR matrix and crisp SVG for LAN URLs', () => {
    const matrix = generateQrMatrix('http://192.168.1.50:3000/admin');
    expect(matrix.length).toBeGreaterThanOrEqual(25);
    expect(matrix.length).toBe(matrix[0]?.length);
    // Top-left 7x7 finder outer border check
    expect(matrix[0]?.slice(0, 7).every(Boolean)).toBe(true);

    const svg = renderQrSvg('http://192.168.1.50:3000/admin', 160);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="160"');
    expect(svg).toContain(`viewBox="0 0 ${matrix.length + 8} ${matrix.length + 8}"`);
    expect(computeStationBadgeWidth(320)).toBeGreaterThanOrEqual(60);
  });
});

describe('Standard 16:9 / 4K full-screen layout support', () => {
  const measure = (text: string, size: number, weight = 500) =>
    text.length * size * (weight >= 700 ? 0.68 : 0.6);

  it('resolves effective screen layout automatically by aspect ratio and honors explicit overrides', () => {
    expect(resolveEffectiveScreenLayout('auto', 1920, 1080)).toBe('board');
    expect(resolveEffectiveScreenLayout('auto', 3840, 2160)).toBe('board');
    expect(resolveEffectiveScreenLayout('auto', 1920, 1200)).toBe('board');
    expect(resolveEffectiveScreenLayout('auto', 1920, 480)).toBe('bar');
    expect(resolveEffectiveScreenLayout('auto', 1280, 400)).toBe('bar');
    expect(resolveEffectiveScreenLayout('wall', 1920, 1080)).toBe('wall');
    expect(resolveEffectiveScreenLayout('bar', 1920, 1080)).toBe('bar');
    expect(resolveEffectiveScreenLayout('board', 1920, 480)).toBe('board');
  });

  it('computes balanced aspect-preserving logical grids for FHD, 4K, Shinkansen LED, and portrait', () => {
    expect(
      computeScreenLogicalSize(1920, 1080, 'board', {
        visualMode: 'anobar8-vfd',
        logicalHeight: 96,
        ledRows: 24,
        boardLogicalWidth: 640,
      }),
    ).toEqual({ width: 640, height: 360 });

    expect(
      computeScreenLogicalSize(3840, 2160, 'wall', {
        visualMode: 'clean',
        logicalHeight: 96,
        ledRows: 24,
        boardLogicalWidth: 640,
      }),
    ).toEqual({ width: 640, height: 360 });

    expect(
      computeScreenLogicalSize(1920, 1080, 'board', {
        visualMode: 'shinkansen-led',
        logicalHeight: 96,
        ledRows: 24,
        boardLogicalWidth: 640,
      }),
    ).toEqual({ width: 240, height: 135 });

    // Portrait 1080x1920 clamps height safely without distortion
    const portrait = computeScreenLogicalSize(1080, 1920, 'board', {
      visualMode: 'anobar8-vfd',
      logicalHeight: 96,
      ledRows: 24,
      boardLogicalWidth: 640,
    });
    expect(portrait.height).toBeLessThanOrEqual(960);
    expect(portrait.width / portrait.height).toBeCloseTo(1080 / 1920, 1);

    // Classic ultrawide 'bar' mode matches legacy computeLogicalSize
    expect(
      computeScreenLogicalSize(1920, 480, 'bar', {
        visualMode: 'anobar8-vfd',
        logicalHeight: 96,
        ledRows: 24,
        boardLogicalWidth: 640,
      }),
    ).toEqual({ width: 384, height: 96 });
  });

  it('computes non-overlapping regions for board, wall, split-flap, and clock modes', () => {
    const boardRegions = computeScreenRegions(640, 360, 'board', DEFAULT_CONFIG.display, 'all');
    expect(boardRegions.showMiddleBoard).toBe(true);
    expect(
      boardRegions.headerRect.h +
        boardRegions.bodyRect.h +
        boardRegions.tickerRect.h +
        boardRegions.graphRect.h,
    ).toBe(360);

    const wallRegions = computeScreenRegions(640, 360, 'wall', DEFAULT_CONFIG.display, 'all');
    expect(wallRegions.showMiddleBoard).toBe(false);
    expect(wallRegions.effectiveTickerLanes).toBe(6);
    expect(
      wallRegions.headerRect.h + wallRegions.tickerRect.h + wallRegions.graphRect.h,
    ).toBe(360);

    const flapBoardRegions = computeScreenRegions(
      640,
      360,
      'board',
      { ...DEFAULT_CONFIG.display, visualMode: 'split-flap' },
      'all',
    );
    expect(flapBoardRegions.showMiddleBoard).toBe(false);
    expect(flapBoardRegions.effectiveTickerMaxRows).toBeGreaterThanOrEqual(4);

    const clockRegions = computeScreenRegions(640, 360, 'board', DEFAULT_CONFIG.display, 'clock');
    expect(clockRegions.tickerRect.h).toBe(0);
    expect(clockRegions.bodyRect.h).toBeGreaterThan(300);
  });

  it('supports multi-row split-flap, station-board, shinkansen-led, and tall danmaku walls', () => {
    const sampleItems: TickerItem[] = Array.from({ length: 10 }, (_, idx) => ({
      id: `item-${idx}`,
      source: 'rss',
      badge: 'NEWS',
      text: `マルチ行テストニュース項目 ${idx + 1}`,
      color: '#38bdf8',
      timestamp: 1000 + idx,
      priority: 'normal',
      oneShot: false,
      breaking: false,
    }));

    // 6-row split-flap wall
    const flapEngine = new TickerLayoutEngine();
    flapEngine.setPool(sampleItems, 'all');
    flapEngine.step({
      dtSec: 0.2,
      tickerWidth: 640,
      tickerHeight: 280,
      logicalHeight: 360,
      lanes: 6,
      maxRows: 6,
      layoutMode: 'lanes',
      visualMode: 'split-flap',
      shinkansenStyle: 'scroll',
      activeChannel: 'all',
      scrollSpeed: 72,
      showBadge: true,
      measureText: measure,
    });
    expect(flapEngine.getSplitFlapRows()).toHaveLength(6);

    // 6-row station-board wall
    const stationEngine = new TickerLayoutEngine();
    stationEngine.setPool(sampleItems, 'all');
    const stationSpans = stationEngine.step({
      dtSec: 0.016,
      tickerWidth: 640,
      tickerHeight: 280,
      logicalHeight: 360,
      lanes: 6,
      maxRows: 6,
      layoutMode: 'lanes',
      visualMode: 'station-board',
      shinkansenStyle: 'scroll',
      activeChannel: 'all',
      scrollSpeed: 72,
      showBadge: true,
      measureText: measure,
    });
    expect(stationSpans).toHaveLength(6);
    expect(new Set(stationSpans.map((s) => s.lane)).size).toBe(6);

    // 3-lane Shinkansen LED wall
    const ledEngine = new TickerLayoutEngine();
    ledEngine.setPool(sampleItems, 'all');
    const ledSpans = ledEngine.step({
      dtSec: 0.016,
      tickerWidth: 240,
      tickerHeight: 110,
      logicalHeight: 135,
      lanes: 3,
      maxRows: 3,
      layoutMode: 'lanes',
      visualMode: 'shinkansen-led',
      shinkansenStyle: 'scroll',
      activeChannel: 'all',
      scrollSpeed: 72,
      showBadge: true,
      measureText: measure,
    });
    expect(ledSpans).toHaveLength(3);

    // Tall danmaku fills >8 vertical slots
    const danmakuEngine = new TickerLayoutEngine();
    danmakuEngine.setPool(sampleItems, 'all');
    for (let i = 0; i < 4; i += 1) {
      danmakuEngine.step({
        dtSec: 0.4,
        tickerWidth: 640,
        tickerHeight: 280,
        logicalHeight: 360,
        lanes: 6,
        layoutMode: 'danmaku',
        visualMode: 'anobar8-vfd',
        shinkansenStyle: 'scroll',
        activeChannel: 'all',
        scrollSpeed: 120,
        showBadge: true,
        measureText: measure,
      });
    }
    const tallDanmaku = danmakuEngine.step({
      dtSec: 0.1,
      tickerWidth: 640,
      tickerHeight: 280,
      logicalHeight: 360,
      lanes: 6,
      layoutMode: 'danmaku',
      visualMode: 'anobar8-vfd',
      shinkansenStyle: 'scroll',
      activeChannel: 'all',
      scrollSpeed: 120,
      showBadge: true,
      measureText: measure,
    });
    expect(new Set(tallDanmaku.map((s) => s.lane)).size).toBeGreaterThan(8);
  });

  it('wraps Japanese and ASCII alert text into bounded lines', () => {
    const lines = wrapTextLines(
      '緊急地震速報テスト：東京23区・関東南部で強い揺れに警戒してください。身の安全を確保してください。',
      180,
      (s) => s.length * 12,
      4,
    );
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThanOrEqual(4);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(16);
    }
  });

  it('caps clean and split-flap backing dimensions at Full HD on 4K while preserving supersampling', () => {
    // 4K 16:9 board/wall (640x360) -> scale 3 (1920x1080)
    const cleanWallScale = computeRenderScale(2160, 640, 360, 'clean', 'wall');
    expect(cleanWallScale).toBe(3);
    expect(640 * cleanWallScale).toBeLessThanOrEqual(1920);
    expect(360 * cleanWallScale).toBeLessThanOrEqual(1080);

    // 4K 16:9 bar (171x96) -> scale 4 (684x384), preventing giant 4K glyph tessellation
    const cleanBarScale = computeRenderScale(2160, 171, 96, 'clean', 'bar');
    expect(cleanBarScale).toBe(4);
    expect(171 * cleanBarScale).toBeLessThanOrEqual(1920);
    expect(96 * cleanBarScale).toBeLessThanOrEqual(1080);

    // Wide logical width (960x540) -> scale 2 (1920x1080)
    expect(computeRenderScale(2160, 960, 540, 'split-flap', 'board')).toBe(2);

    // Shinkansen LED and bar VFD/FED remain 1x logical grid
    expect(computeRenderScale(2160, 240, 135, 'shinkansen-led', 'wall')).toBe(1);
    expect(computeRenderScale(480, 384, 96, 'anobar8-vfd', 'bar')).toBe(1);
    expect(computeRenderScale(2160, 640, 360, 'anobar8-vfd', 'wall')).toBe(2);
  });
});

describe('High-refresh-rate & performance optimizations', () => {
  const measure = (text: string, size: number, weight = 500) =>
    text.length * size * (weight >= 700 ? 0.68 : 0.6);

  it('invalidates cached weighted pool on setPool and enqueue', () => {
    const engine = new TickerLayoutEngine();
    const rssItem: TickerItem = {
      id: 'r1',
      source: 'rss',
      badge: 'NEWS',
      text: 'Initial RSS',
      color: '#38bdf8',
      timestamp: 1000,
      priority: 'normal',
      oneShot: false,
      breaking: false,
    };
    const weatherItem: TickerItem = {
      id: 'w1',
      source: 'weather',
      badge: '天気',
      text: '晴れ',
      color: '#facc15',
      timestamp: 1001,
      priority: 'normal',
      oneShot: false,
      breaking: false,
    };

    engine.setPool([rssItem], 'all', undefined, { rss: 2, weather: 2 });
    const s1 = engine.step({
      dtSec: 0.016,
      tickerWidth: 80,
      tickerHeight: 82,
      logicalHeight: 96,
      lanes: 1,
      layoutMode: 'lanes',
      visualMode: 'anobar8-vfd',
      shinkansenStyle: 'scroll',
      activeChannel: 'all',
      scrollSpeed: 5000,
      showBadge: true,
      measureText: measure,
    });
    expect(s1[0]?.item.source).toBe('rss');

    // Enqueue a persistent weather item and ensure it enters the weighted pool cache
    engine.enqueue([weatherItem], 'all');
    const seenSources = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      engine.step({
        dtSec: 0.5,
        tickerWidth: 80,
        tickerHeight: 82,
        logicalHeight: 96,
        lanes: 1,
        layoutMode: 'lanes',
        visualMode: 'anobar8-vfd',
        shinkansenStyle: 'scroll',
        activeChannel: 'all',
        scrollSpeed: 5000,
        showBadge: true,
        measureText: measure,
      });
      const stepSpans = engine.step({
        dtSec: 0.016,
        tickerWidth: 80,
        tickerHeight: 82,
        logicalHeight: 96,
        lanes: 1,
        layoutMode: 'lanes',
        visualMode: 'anobar8-vfd',
        shinkansenStyle: 'scroll',
        activeChannel: 'all',
        scrollSpeed: 5000,
        showBadge: true,
        measureText: measure,
      });
      for (const sp of stepSpans) seenSources.add(sp.item.source);
    }
    expect(seenSources.has('weather')).toBe(true);
  });

  it('normalizes WebGL persistence decay identically over 1 second at 60Hz, 144Hz, and 240Hz', () => {
    const base = 0.7 * 0.72;
    const oneSecAt60 = Math.pow(computePersistenceDecay(base, 1 / 60), 60);
    const oneSecAt144 = Math.pow(computePersistenceDecay(base, 1 / 144), 144);
    const oneSecAt240 = Math.pow(computePersistenceDecay(base, 1 / 240), 240);

    expect(oneSecAt144).toBeCloseTo(oneSecAt60, 5);
    expect(oneSecAt240).toBeCloseTo(oneSecAt60, 5);
    expect(computePersistenceDecay(0, 1 / 144)).toBe(0);
  });

  it('computes compact bloom FBO dimensions bounded at <= 640px while respecting source bounds', () => {
    // Classic bar (640x96)
    expect(computeBloomDimensions(640, 96, 640, 96)).toEqual({ width: 320, height: 48 });
    // Shinkansen LED bar (240x24)
    expect(computeBloomDimensions(240, 24, 240, 24)).toEqual({ width: 120, height: 24 });
    // 16:9 board at 2x render scale (640x360 logical, 1280x720 source)
    expect(computeBloomDimensions(640, 360, 1280, 720)).toEqual({ width: 320, height: 180 });
    // Large logical board (1280x720) caps bloom max dimension at 640
    const large = computeBloomDimensions(1280, 720, 1920, 1080);
    expect(large.width).toBeLessThanOrEqual(640);
    expect(large.height).toBeLessThanOrEqual(360);
  });

  it('keeps SpectrumAnalyzer attack envelope frame-rate independent and reuses typed buffers', () => {
    const analyzer60 = new SpectrumAnalyzer();
    const analyzer240 = new SpectrumAnalyzer();
    const nowPlaying = {
      playing: true,
      title: 'Test Track',
      artist: 'Tester',
      album: 'Test Album',
      sourceApp: 'test',
      updatedAt: 1000,
      levels: [1, 1, 1, 1],
    };

    let snap60 = analyzer60.step(1 / 60, 'auto', nowPlaying, true);
    const firstBandsRef = snap60.bands;
    for (let i = 1; i < 6; i += 1) {
      snap60 = analyzer60.step(1 / 60, 'auto', nowPlaying, true);
    }
    expect(snap60.bands).toBe(firstBandsRef);

    let snap240 = analyzer240.step(1 / 240, 'auto', nowPlaying, true);
    for (let i = 1; i < 24; i += 1) {
      snap240 = analyzer240.step(1 / 240, 'auto', nowPlaying, true);
    }

    // After 0.1s at 60Hz vs 240Hz, band levels match closely
    expect(snap240.bands[0]).toBeCloseTo(snap60.bands[0]!, 4);
  });

  it('auto-fits tall breaking alert text up to 80% of body height for short messages and shrinks gracefully for long messages', () => {
    const measureBold = (s: string, size: number) => s.length * size * 0.95;

    // 640x360 board metrics matching drawTallBreakingAlert
    const contentH360 = 360 - 14 * 2 - Math.round(360 * 0.08); // ~303
    const availBodyH360 = contentH360 - Math.round(contentH360 * 0.14) - Math.round(contentH360 * 0.04); // ~249
    const short360 = fitBreakingAlertText({
      text: '緊急地震速報：東京23区',
      maxTextW: 640 - Math.round(640 * 0.04) * 2,
      availBodyH: availBodyH360,
      minFontSize: Math.max(14, Math.round(contentH360 * 0.10)),
      maxFontSize: Math.round(availBodyH360 * 0.80),
      maxLines: 5,
      lineHeightRatio: 1.24,
      measureWidth: measureBold,
    });
    expect(short360.textSize).toBeGreaterThan(45);
    expect(short360.truncated).toBe(false);
    expect(short360.lines.length).toBeLessThanOrEqual(5);
    expect(short360.lines.length * short360.lineH).toBeLessThanOrEqual(availBodyH360);

    // 1280x720 board scales dynamically past 150px for very short alerts
    const contentH720 = 720 - 29 * 2 - Math.round(720 * 0.08); // ~604
    const availBodyH720 = contentH720 - Math.round(contentH720 * 0.14) - Math.round(contentH720 * 0.04); // ~495
    const short720 = fitBreakingAlertText({
      text: '津波警報発表',
      maxTextW: 1280 - Math.round(1280 * 0.04) * 2,
      availBodyH: availBodyH720,
      minFontSize: Math.max(14, Math.round(contentH720 * 0.10)),
      maxFontSize: Math.round(availBodyH720 * 0.80),
      maxLines: 5,
      lineHeightRatio: 1.24,
      measureWidth: measureBold,
    });
    expect(short720.textSize).toBeGreaterThan(150);
    expect(short720.lines.length * short720.lineH).toBeLessThanOrEqual(availBodyH720);

    // Long message shrinks to fit within maxLines without truncation while staying readable
    const longText =
      '緊急地震速報テスト：関東南部で強い揺れが発生しました。強い揺れに警戒し、落ち着いて身の安全を確保してください。';
    const long360 = fitBreakingAlertText({
      text: longText,
      maxTextW: 640 - Math.round(640 * 0.04) * 2,
      availBodyH: availBodyH360,
      minFontSize: Math.max(14, Math.round(contentH360 * 0.10)),
      maxFontSize: Math.round(availBodyH360 * 0.80),
      maxLines: 5,
      lineHeightRatio: 1.24,
      measureWidth: measureBold,
    });
    expect(long360.lines.length).toBeLessThanOrEqual(5);
    expect(long360.lines.length * long360.lineH).toBeLessThanOrEqual(availBodyH360);
    expect(long360.truncated).toBe(false);
    expect(long360.lines.join('')).not.toContain('…');
    expect(long360.textSize).toBeGreaterThanOrEqual(Math.round(contentH360 * 0.10));

    // Extremely long message falls back to minFontSize and truncates cleanly within 5 lines
    const extremeText = longText.repeat(4);
    const extreme360 = fitBreakingAlertText({
      text: extremeText,
      maxTextW: 640 - Math.round(640 * 0.04) * 2,
      availBodyH: availBodyH360,
      minFontSize: 30,
      maxFontSize: 199,
      maxLines: 5,
      lineHeightRatio: 1.24,
      measureWidth: measureBold,
    });
    expect(extreme360.textSize).toBe(30);
    expect(extreme360.truncated).toBe(true);
    expect(extreme360.lines).toHaveLength(5);
    expect(extreme360.lines[4]).toContain('…');
  });

  it('stacks source badge on row 1 and fits row 2 body to max width (or scrolls if too long) on bar alerts', () => {
    const measureBold = (s: string, size: number) => s.length * size * 0.95;

    // 1) Short message on ultrawide bar -> stacked-static with row 2 near full row2H
    const shortBar = fitBarBreakingAlert({
      width: 960,
      height: 96,
      badgeStr: '[NHK速報]',
      text: '震度5弱 東京23区',
      isShinkansen: false,
      measureBadgeWidth: measureBold,
      measureTextWidth: measureBold,
    });
    expect(shortBar.mode).toBe('stacked-static');
    expect(shortBar.textSize).toBeGreaterThanOrEqual(44);
    expect(shortBar.row2Cy).toBeGreaterThan(shortBar.row1Cy);

    // 2) Medium message on 960x96 and 1920x200 bars -> stacked-static fitted cleanly to full bar width
    const med96 = fitBarBreakingAlert({
      width: 960,
      height: 96,
      badgeStr: '[NHK速報]',
      text: '【テスト速報】NHKニュース速報アラート割り込みテスト',
      isShinkansen: false,
      measureBadgeWidth: measureBold,
      measureTextWidth: measureBold,
    });
    expect(med96.mode).toBe('stacked-static');
    expect(med96.textSize).toBeGreaterThanOrEqual(35);
    expect(med96.textW).toBeLessThanOrEqual(med96.usableW);

    const med200 = fitBarBreakingAlert({
      width: 1920,
      height: 200,
      badgeStr: '[NHK速報]',
      text: '【テスト速報】NHKニュース速報アラート割り込みテスト',
      isShinkansen: false,
      measureBadgeWidth: measureBold,
      measureTextWidth: measureBold,
    });
    expect(med200.mode).toBe('stacked-static');
    expect(med200.textSize).toBeGreaterThanOrEqual(70);
    expect(med200.textW).toBeLessThanOrEqual(med200.usableW);

    // 3) Very long message that would become too small statically -> stacked-scroll at large row 2 size
    const longBar = fitBarBreakingAlert({
      width: 640,
      height: 96,
      badgeStr: '[地震]',
      text: 'これは非常に長い緊急速報テストメッセージであり、横幅いっぱいに縮小すると小さくなりすぎるため自動的に2段目の大文字横スクロールに切り替わります。',
      isShinkansen: false,
      measureBadgeWidth: measureBold,
      measureTextWidth: measureBold,
    });
    expect(longBar.mode).toBe('stacked-scroll');
    expect(longBar.textSize).toBeGreaterThanOrEqual(40);
    expect(longBar.textW).toBeGreaterThan(longBar.usableW);

    // 4) Thin Shinkansen LED bar (240x24) stays single-row inline
    const ledShort = fitBarBreakingAlert({
      width: 240,
      height: 24,
      badgeStr: '[速報]',
      text: '震度4',
      isShinkansen: true,
      measureBadgeWidth: measureBold,
      measureTextWidth: measureBold,
    });
    expect(ledShort.mode).toBe('inline-static');

    const ledLong = fitBarBreakingAlert({
      width: 240,
      height: 24,
      badgeStr: '[速報]',
      text: '東北新幹線はやぶさ号 運行情報テストメッセージ',
      isShinkansen: true,
      measureBadgeWidth: measureBold,
      measureTextWidth: measureBold,
    });
    expect(ledLong.mode).toBe('inline-scroll');
    expect(ledLong.textSize).toBeGreaterThanOrEqual(16);
  });
});
