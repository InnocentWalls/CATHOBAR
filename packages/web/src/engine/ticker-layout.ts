import type { ChannelId, LayoutMode, TickerItem } from '@cathobar/shared';

export interface ActiveTickerSpan {
  uid: string;
  item: TickerItem;
  lane: number;
  yRatio: number;
  fontSize: number;
  speedScale: number;
  x: number;
  width: number;
  badgeWidth: number;
  alpha: number;
}

export interface LogicalSize {
  width: number;
  height: number;
}

export type MeasureTextFn = (text: string, fontSizePx: number, weight?: number) => number;

/**
 * Computes logical dot dimensions preserving aspect ratio for any monitor resolution.
 */
export function computeLogicalSize(
  viewportWidth: number,
  viewportHeight: number,
  logicalHeight: number,
): LogicalSize {
  const safeH = Math.max(1, viewportHeight);
  const safeW = Math.max(1, viewportWidth);
  const aspect = safeW / safeH;
  const height = Math.max(48, Math.round(logicalHeight));
  const width = Math.max(160, Math.round(height * aspect));
  return { width, height };
}

/**
 * Computes smooth edge fade-in / fade-out alpha for ANOBAR8's floating VFD aesthetic.
 */
export function computeEdgeAlpha(
  x: number,
  spanWidth: number,
  canvasWidth: number,
  fadeMargin: number,
): number {
  if (fadeMargin <= 0) return 1;
  const enterProgress = (canvasWidth - x) / fadeMargin;
  const exitProgress = (x + spanWidth) / fadeMargin;
  const alpha = Math.min(1, enterProgress, exitProgress);
  return Math.max(0, Math.min(1, alpha));
}

export interface StepParams {
  dtSec: number;
  tickerWidth: number;
  tickerHeight: number;
  logicalHeight: number;
  lanes: number;
  layoutMode: LayoutMode;
  activeChannel: ChannelId;
  scrollSpeed: number;
  showBadge: boolean;
  measureText: MeasureTextFn;
}

export class TickerLayoutEngine {
  private spans: ActiveTickerSpan[] = [];
  private priorityQueue: TickerItem[] = [];
  private pool: TickerItem[] = [];
  private poolCursor = 0;
  private uidCounter = 0;
  private danmakuSlotCursor = 0;

  setPool(items: TickerItem[], activeChannel: ChannelId): void {
    const filtered = filterByChannel(items, activeChannel).filter((item) => !item.oneShot);
    this.pool = filtered;
    if (this.poolCursor >= this.pool.length) {
      this.poolCursor = 0;
    }
  }

  enqueue(items: TickerItem[], activeChannel: ChannelId): void {
    const filtered = filterByChannel(items, activeChannel);
    for (const item of filtered) {
      if (item.priority === 'high' || item.oneShot) {
        this.priorityQueue.unshift(item);
      } else {
        this.priorityQueue.push(item);
      }
      if (!item.oneShot && !this.pool.some((p) => p.id === item.id)) {
        this.pool.push(item);
      }
    }
    if (this.pool.length > 150) {
      this.pool.splice(0, this.pool.length - 150);
    }
    if (this.priorityQueue.length > 80) {
      this.priorityQueue.length = 80;
    }
  }

  clearActive(): void {
    this.spans = [];
    this.priorityQueue = [];
  }

  step(params: StepParams): ActiveTickerSpan[] {
    const {
      dtSec,
      tickerWidth,
      tickerHeight,
      logicalHeight,
      lanes,
      layoutMode,
      activeChannel,
      scrollSpeed,
      showBadge,
      measureText,
    } = params;

    const clampedDt = Math.min(0.1, Math.max(0, dtSec));
    const fadeMargin = Math.max(12, Math.round(tickerWidth * 0.04));

    const effectiveMode: 'lanes' | 'danmaku' =
      layoutMode === 'auto'
        ? activeChannel === 'mastodon' || this.priorityQueue.length >= 6
          ? 'danmaku'
          : 'lanes'
        : layoutMode;

    for (const span of this.spans) {
      span.x -= scrollSpeed * span.speedScale * clampedDt;
      span.alpha = computeEdgeAlpha(span.x, span.width, tickerWidth, fadeMargin);
    }

    this.spans = this.spans.filter((s) => s.x + s.width > -6);

    if (effectiveMode === 'danmaku') {
      this.stepDanmaku(tickerWidth, tickerHeight, logicalHeight, showBadge, fadeMargin, measureText);
    } else {
      this.stepLanes(
        tickerWidth,
        tickerHeight,
        logicalHeight,
        Math.max(1, lanes),
        showBadge,
        fadeMargin,
        measureText,
      );
    }

    return this.spans;
  }

  private stepLanes(
    tickerWidth: number,
    tickerHeight: number,
    logicalHeight: number,
    lanes: number,
    showBadge: boolean,
    fadeMargin: number,
    measureText: MeasureTextFn,
  ): void {
    const laneHeight = tickerHeight / lanes;
    const fontSize = Math.max(10, Math.min(laneHeight * 0.68, logicalHeight * 0.48));
    const gap = Math.max(24, Math.round(fontSize * 1.4));

    for (let lane = 0; lane < lanes; lane += 1) {
      let rightmost = -Infinity;
      for (const s of this.spans) {
        if (s.lane === lane) {
          rightmost = Math.max(rightmost, s.x + s.width);
        }
      }

      if (rightmost <= tickerWidth - gap) {
        const nextItem = this.pickNextItem();
        if (!nextItem) continue;
        const { badgeWidth, totalWidth } = measureSpanWidth(
          nextItem,
          fontSize,
          showBadge,
          measureText,
        );
        const startX = tickerWidth + 4;
        this.uidCounter += 1;
        this.spans.push({
          uid: `span-${this.uidCounter}`,
          item: nextItem,
          lane,
          yRatio: (lane + 0.52) / lanes,
          fontSize,
          speedScale: 1,
          x: startX,
          width: totalWidth,
          badgeWidth,
          alpha: computeEdgeAlpha(startX, totalWidth, tickerWidth, fadeMargin),
        });
      }
    }
  }

  private stepDanmaku(
    tickerWidth: number,
    tickerHeight: number,
    logicalHeight: number,
    showBadge: boolean,
    fadeMargin: number,
    measureText: MeasureTextFn,
  ): void {
    const slotCount = Math.max(3, Math.min(8, Math.floor(tickerHeight / 15)));
    const slotHeight = tickerHeight / slotCount;
    const fontSize = Math.max(10, Math.min(slotHeight * 0.82, logicalHeight * 0.32));
    const gap = Math.max(14, Math.round(fontSize * 0.9));

    // Spawn up to 3 items per frame when traffic is bursting, preferring least-occupied vertical slots
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidateItem = this.peekNextItem();
      if (!candidateItem) break;

      let bestSlot = -1;
      let bestRightmost = Infinity;

      for (let slot = 0; slot < slotCount; slot += 1) {
        let slotRightmost = -Infinity;
        for (const s of this.spans) {
          if (s.lane === slot) {
            slotRightmost = Math.max(slotRightmost, s.x + s.width);
          }
        }
        if (slotRightmost <= tickerWidth - gap) {
          bestSlot = slot;
          bestRightmost = slotRightmost;
          break;
        }
        if (slotRightmost < bestRightmost) {
          bestRightmost = slotRightmost;
        }
      }

      // Under heavy burst from priority queue, allow organic overlap on rotating slot
      const allowBurstOverlap = bestSlot === -1 && this.priorityQueue.length > 0 && attempt === 0;
      if (bestSlot === -1 && !allowBurstOverlap) {
        break;
      }

      const chosenSlot =
        bestSlot !== -1 ? bestSlot : (this.danmakuSlotCursor++) % slotCount;
      const nextItem = this.pickNextItem();
      if (!nextItem) break;

      const { badgeWidth, totalWidth } = measureSpanWidth(
        nextItem,
        fontSize,
        showBadge,
        measureText,
      );
      const startX = tickerWidth + 4;
      const jitter = ((this.uidCounter % 3) - 1) * 0.015;
      const speedScale = 0.92 + Math.min(0.36, nextItem.text.length / 220);

      this.uidCounter += 1;
      this.spans.push({
        uid: `span-${this.uidCounter}`,
        item: nextItem,
        lane: chosenSlot,
        yRatio: Math.max(0.1, Math.min(0.9, (chosenSlot + 0.5) / slotCount + jitter)),
        fontSize,
        speedScale,
        x: startX,
        width: totalWidth,
        badgeWidth,
        alpha: computeEdgeAlpha(startX, totalWidth, tickerWidth, fadeMargin),
      });
    }
  }

  private peekNextItem(): TickerItem | null {
    if (this.priorityQueue.length > 0) {
      return this.priorityQueue[0] ?? null;
    }
    if (this.pool.length === 0) {
      return null;
    }
    return this.pool[this.poolCursor % this.pool.length] ?? null;
  }

  private pickNextItem(): TickerItem | null {
    if (this.priorityQueue.length > 0) {
      return this.priorityQueue.shift() ?? null;
    }
    if (this.pool.length === 0) {
      return null;
    }
    const item = this.pool[this.poolCursor % this.pool.length] ?? null;
    this.poolCursor = (this.poolCursor + 1) % this.pool.length;
    return item;
  }
}

function measureSpanWidth(
  item: TickerItem,
  fontSize: number,
  showBadge: boolean,
  measureText: MeasureTextFn,
): { badgeWidth: number; totalWidth: number } {
  const badgeSize = Math.max(8, fontSize * 0.78);
  const badgeWidth = showBadge ? Math.ceil(measureText(`[${item.badge}]`, badgeSize, 700)) + 6 : 0;
  const textWidth = Math.ceil(measureText(item.text, fontSize, 500));
  return {
    badgeWidth,
    totalWidth: badgeWidth + textWidth + 8,
  };
}

export function filterByChannel(items: TickerItem[], activeChannel: ChannelId): TickerItem[] {
  if (activeChannel === 'clock') return [];
  if (activeChannel === 'all') return items;
  return items.filter((item) => item.source === activeChannel || item.source === 'push');
}
