import { describe, expect, it } from 'vitest';
import type { TickerItem } from '@cathobar/shared';
import {
  computeEdgeAlpha,
  computeLogicalSize,
  TickerLayoutEngine,
} from '../src/engine/ticker-layout.js';

describe('computeLogicalSize', () => {
  it('adapts logical width to arbitrary monitor aspect ratios', () => {
    expect(computeLogicalSize(1920, 480, 96)).toEqual({ width: 384, height: 96 });
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
      activeChannel: 'all',
      scrollSpeed: 1000,
      showBadge: true,
      measureText: measure,
    });
    expect(first).toHaveLength(1);
    expect(first[0]?.item.id).toBe('once');

    // Step enough time for the span to exit offscreen
    for (let i = 0; i < 15; i += 1) {
      engine.step({
        dtSec: 0.1,
        tickerWidth: 300,
        tickerHeight: 82,
        logicalHeight: 96,
        lanes: 1,
        layoutMode: 'lanes',
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
      activeChannel: 'mastodon',
      scrollSpeed: 70,
      showBadge: true,
      measureText: measure,
    });

    expect(spans).toHaveLength(3);
    const yRatios = new Set(spans.map((s) => s.yRatio));
    expect(yRatios.size).toBe(3);
  });
});
