import {
  isItemEnabledBySources,
  sourceMatchesChannel,
  type AppConfig,
  type ChannelId,
  type LayoutMode,
  type ShinkansenScrollStyle,
  type SourceWeights,
  type SourcesConfig,
  type TickerItem,
  type TickerSourceId,
  type VisualMode,
} from '@cathobar/shared';

export interface ActiveTickerSpan {
  uid: string;
  item: TickerItem;
  lane: number;
  yRatio: number;
  fontSize: number;
  speedScale: number;
  x: number;
  width: number;
  iconWidth: number;
  badgeWidth: number;
  alpha: number;
}

export interface SplitFlapRowState {
  lane: number;
  item: TickerItem;
  displayText: string;
  elapsedSec: number;
  holdDurationSec: number;
  flipProgress: number; // [0..1] during mechanical cascade
}

export interface LogicalSize {
  width: number;
  height: number;
}

export type MeasureTextFn = (text: string, fontSizePx: number, weight?: number) => number;

export function computeStationBadgeWidth(tickerWidth: number): number {
  return Math.max(60, Math.min(112, Math.round(tickerWidth * 0.24)));
}

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
  const height = Math.max(16, Math.round(logicalHeight));
  const minWidth = Math.max(48, Math.round(height * 1.6667));
  const width = Math.max(minWidth, Math.round(height * aspect));
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

/**
 * Computes the effective channel for client-side time-sliced rotation without mutating server config.
 */
export function computeEffectiveChannel(
  config: Pick<AppConfig, 'activeChannel' | 'rotation'>,
  nowMs: number,
): { channel: ChannelId; progress: number; rotating: boolean } {
  const rot = config.rotation;
  if (!rot || !rot.enabled || rot.channels.length === 0) {
    return { channel: config.activeChannel, progress: 0, rotating: false };
  }
  const intervalMs = Math.max(5_000, rot.intervalSec * 1000);
  const totalSlots = rot.channels.length;
  const slotFloat = nowMs / intervalMs;
  const idx = Math.floor(slotFloat) % totalSlots;
  const progress = slotFloat - Math.floor(slotFloat);
  return {
    channel: rot.channels[idx] ?? config.activeChannel,
    progress,
    rotating: true,
  };
}

export interface StepParams {
  dtSec: number;
  tickerWidth: number;
  tickerHeight: number;
  logicalHeight: number;
  lanes: number;
  layoutMode: LayoutMode;
  visualMode: VisualMode;
  shinkansenStyle: ShinkansenScrollStyle;
  activeChannel: ChannelId;
  scrollSpeed: number;
  showBadge: boolean;
  showPixelIcons?: boolean;
  paused?: boolean;
  measureText: MeasureTextFn;
}

interface ShinkansenState {
  span: ActiveTickerSpan;
  phase: 'slide-in' | 'pause' | 'scroll' | 'slide-out';
  timerSec: number;
}

function getSourceWeight(source: TickerSourceId, weights?: Partial<SourceWeights>): number {
  if (!weights) return 1;
  switch (source) {
    case 'rss':
    case 'nhk-breaking':
      return weights.rss ?? 3;
    case 'weather':
      return weights.weather ?? 2;
    case 'mastodon':
      return weights.mastodon ?? 2;
    case 'wikipedia':
      return weights.wikipedia ?? 1;
    case 'earthquake':
      return weights.earthquake ?? 2;
    case 'transit':
      return weights.transit ?? 2;
    case 'market':
      return weights.market ?? 2;
    case 'nowplaying':
      return weights.nowplaying ?? 2;
    case 'countdown':
      return weights.countdown ?? 1;
    case 'sysmon':
      return weights.sysmon ?? 1;
    case 'calendar':
      return weights.calendar ?? 2;
    case 'sensors':
      return weights.sensors ?? 2;
    case 'webhook':
      return weights.webhook ?? 2;
    case 'push':
      return 2;
    case 'clock':
      return 0;
  }
}

export class TickerLayoutEngine {
  private spans: ActiveTickerSpan[] = [];
  private splitFlapRows: SplitFlapRowState[] = [];
  private priorityQueue: TickerItem[] = [];
  private pool: TickerItem[] = [];
  private poolCursor = 0;
  private activeChannel: ChannelId = 'all';
  private weights: Partial<SourceWeights> | undefined = undefined;
  private readonly sourceCursors = new Map<TickerSourceId, number>();
  private readonly swrrCurrent = new Map<TickerSourceId, number>();
  private uidCounter = 0;
  private danmakuSlotCursor = 0;
  private shinkansenState: ShinkansenState | null = null;
  private lastTickerWidth = 320;

  setPool(
    items: TickerItem[],
    activeChannel: ChannelId,
    sources?: SourcesConfig,
    weights?: Partial<SourceWeights>,
  ): void {
    this.activeChannel = activeChannel;
    if (weights !== undefined) {
      this.weights = weights;
    }
    const filtered = filterByChannel(items, activeChannel, sources).filter((item) => !item.oneShot);
    this.pool = filtered;
    if (this.poolCursor >= this.pool.length) {
      this.poolCursor = 0;
    }
    this.priorityQueue = this.priorityQueue.filter((item) =>
      isItemVisible(item, activeChannel, sources),
    );
    this.spans = this.spans.filter((span) => isItemVisible(span.item, activeChannel, sources));
    this.splitFlapRows = this.splitFlapRows.filter((row) =>
      isItemVisible(row.item, activeChannel, sources),
    );
    if (
      this.shinkansenState &&
      !isItemVisible(this.shinkansenState.span.item, activeChannel, sources)
    ) {
      this.shinkansenState = null;
    }
  }

  enqueue(items: TickerItem[], activeChannel: ChannelId, sources?: SourcesConfig): void {
    this.activeChannel = activeChannel;
    const filtered = filterByChannel(items, activeChannel, sources);
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
    this.splitFlapRows = [];
    this.priorityQueue = [];
    this.shinkansenState = null;
  }

  getSplitFlapRows(): SplitFlapRowState[] {
    return this.splitFlapRows;
  }

  /**
   * Shifts active spans horizontally by deltaPx (for manual scrub while paused).
   */
  nudgeScroll(deltaPx: number): void {
    const fadeMargin = Math.max(12, Math.round(this.lastTickerWidth * 0.04));
    for (const span of this.spans) {
      span.x += deltaPx;
      span.alpha = computeEdgeAlpha(span.x, span.width, this.lastTickerWidth, fadeMargin);
    }
    if (this.shinkansenState) {
      this.shinkansenState.span.x += deltaPx;
    }
  }

  step(params: StepParams): ActiveTickerSpan[] {
    const {
      dtSec,
      tickerWidth,
      tickerHeight,
      logicalHeight,
      lanes,
      layoutMode,
      visualMode,
      shinkansenStyle,
      activeChannel,
      scrollSpeed,
      showBadge,
      showPixelIcons = false,
      paused = false,
      measureText,
    } = params;

    this.activeChannel = activeChannel;
    this.lastTickerWidth = tickerWidth;
    const clampedDt = paused ? 0 : Math.min(0.1, Math.max(0, dtSec));

    if (visualMode === 'split-flap') {
      this.spans = [];
      this.shinkansenState = null;
      this.stepSplitFlap(clampedDt, Math.max(1, Math.min(3, lanes)));
      return [];
    }

    this.splitFlapRows = [];

    if (visualMode === 'shinkansen-led') {
      if (shinkansenStyle === 'pause-head') {
        this.spans = [];
        return this.stepShinkansenPauseHead(
          clampedDt,
          tickerWidth,
          tickerHeight,
          scrollSpeed,
          showBadge,
          showPixelIcons,
          measureText,
        );
      }
      this.shinkansenState = null;
      const ledFontSize = Math.max(11, Math.round(tickerHeight * 0.78));
      const fadeMargin = Math.max(4, Math.round(tickerWidth * 0.03));
      for (const span of this.spans) {
        span.x -= scrollSpeed * clampedDt;
        span.alpha = computeEdgeAlpha(span.x, span.width, tickerWidth, fadeMargin);
      }
      this.spans = this.spans.filter((s) => s.x + s.width > -4);
      if (!paused) {
        this.stepLanesWithFont(
          tickerWidth,
          1,
          ledFontSize,
          showBadge,
          showPixelIcons,
          fadeMargin,
          measureText,
        );
      }
      return this.spans;
    }

    if (visualMode === 'station-board') {
      this.shinkansenState = null;
      const safeLanes = Math.max(1, Math.min(3, lanes));
      const laneHeight = tickerHeight / safeLanes;
      const fontSize = Math.max(10, Math.min(laneHeight * 0.64, logicalHeight * 0.44));
      const badgeColWidth = computeStationBadgeWidth(tickerWidth);
      const textAreaWidth = Math.max(40, tickerWidth - badgeColWidth);
      const fadeMargin = Math.max(8, Math.round(textAreaWidth * 0.03));

      for (const span of this.spans) {
        span.x -= scrollSpeed * span.speedScale * clampedDt;
        span.alpha = computeEdgeAlpha(span.x, span.width, textAreaWidth, fadeMargin);
      }
      this.spans = this.spans.filter((s) => s.x + s.width > -6);
      if (!paused) {
        this.stepLanesWithFont(
          textAreaWidth,
          safeLanes,
          fontSize,
          false, // badge drawn in fixed left column
          showPixelIcons,
          fadeMargin,
          measureText,
        );
      }
      return this.spans;
    }

    this.shinkansenState = null;
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

    if (!paused) {
      if (effectiveMode === 'danmaku') {
        this.stepDanmaku(
          tickerWidth,
          tickerHeight,
          logicalHeight,
          showBadge,
          showPixelIcons,
          fadeMargin,
          measureText,
        );
      } else {
        const safeLanes = Math.max(1, lanes);
        const laneHeight = tickerHeight / safeLanes;
        const fontSize = Math.max(10, Math.min(laneHeight * 0.68, logicalHeight * 0.48));
        this.stepLanesWithFont(
          tickerWidth,
          safeLanes,
          fontSize,
          showBadge,
          showPixelIcons,
          fadeMargin,
          measureText,
        );
      }
    }

    return this.spans;
  }

  private stepSplitFlap(dtSec: number, rowCount: number): void {
    const holdDurationSec = 6.0;
    const flipAnimSec = 0.75;

    while (this.splitFlapRows.length < rowCount) {
      const next = this.pickNextItem();
      if (!next) break;
      this.splitFlapRows.push({
        lane: this.splitFlapRows.length,
        item: next,
        displayText: next.text,
        elapsedSec: 0,
        holdDurationSec,
        flipProgress: 0,
      });
    }
    if (this.splitFlapRows.length > rowCount) {
      this.splitFlapRows.length = rowCount;
    }

    for (let i = 0; i < this.splitFlapRows.length; i += 1) {
      const row = this.splitFlapRows[i]!;
      row.lane = i;
      row.elapsedSec += dtSec;
      row.flipProgress = Math.min(1, row.elapsedSec / flipAnimSec);

      if (row.elapsedSec >= row.holdDurationSec) {
        const next = this.pickNextItem();
        if (next) {
          row.item = next;
          row.displayText = next.text;
          row.elapsedSec = 0;
          row.flipProgress = 0;
        } else {
          row.elapsedSec = 0;
        }
      }
    }
  }

  private stepShinkansenPauseHead(
    dtSec: number,
    tickerWidth: number,
    tickerHeight: number,
    scrollSpeed: number,
    showBadge: boolean,
    showPixelIcons: boolean,
    measureText: MeasureTextFn,
  ): ActiveTickerSpan[] {
    const fontSize = Math.max(11, Math.round(tickerHeight * 0.78));

    if (!this.shinkansenState) {
      const nextItem = this.pickNextItem();
      if (!nextItem) return [];
      const { iconWidth, badgeWidth, totalWidth } = measureSpanWidth(
        nextItem,
        fontSize,
        showBadge,
        showPixelIcons,
        measureText,
      );
      this.uidCounter += 1;
      this.shinkansenState = {
        phase: 'slide-in',
        timerSec: 0,
        span: {
          uid: `span-${this.uidCounter}`,
          item: nextItem,
          lane: 0,
          yRatio: 1.35,
          fontSize,
          speedScale: 1,
          x: 4,
          width: totalWidth,
          iconWidth,
          badgeWidth,
          alpha: 0,
        },
      };
    }

    const st = this.shinkansenState;
    st.timerSec += dtSec;

    if (Math.abs(st.span.fontSize - fontSize) > 0.5) {
      const { iconWidth, badgeWidth, totalWidth } = measureSpanWidth(
        st.span.item,
        fontSize,
        showBadge,
        showPixelIcons,
        measureText,
      );
      st.span.fontSize = fontSize;
      st.span.iconWidth = iconWidth;
      st.span.badgeWidth = badgeWidth;
      st.span.width = totalWidth;
    }

    const needsScroll = st.span.width > tickerWidth - 8;

    if (st.phase === 'slide-in') {
      const duration = 0.26;
      const t = Math.min(1, st.timerSec / duration);
      const eased = 1 - (1 - t) * (1 - t) * (1 - t);
      st.span.yRatio = 1.35 - 0.83 * eased;
      st.span.alpha = t;
      if (t >= 1) {
        st.phase = 'pause';
        st.timerSec = 0;
        st.span.yRatio = 0.52;
        st.span.alpha = 1;
      }
    } else if (st.phase === 'pause') {
      st.span.x = 4;
      st.span.yRatio = 0.52;
      st.span.alpha = 1;
      const holdDuration = needsScroll ? 1.3 : 2.5;
      if (st.timerSec >= holdDuration) {
        st.phase = needsScroll ? 'scroll' : 'slide-out';
        st.timerSec = 0;
      }
    } else if (st.phase === 'scroll') {
      st.span.x -= scrollSpeed * dtSec;
      st.span.yRatio = 0.52;
      st.span.alpha = 1;
      if (st.span.x + st.span.width <= -4) {
        this.shinkansenState = null;
        return [];
      }
    } else if (st.phase === 'slide-out') {
      const duration = 0.22;
      const t = Math.min(1, st.timerSec / duration);
      st.span.yRatio = 0.52 - 0.9 * t;
      st.span.alpha = 1 - t;
      if (t >= 1) {
        this.shinkansenState = null;
        return [];
      }
    }

    return [st.span];
  }

  private stepLanesWithFont(
    tickerWidth: number,
    lanes: number,
    fontSize: number,
    showBadge: boolean,
    showPixelIcons: boolean,
    fadeMargin: number,
    measureText: MeasureTextFn,
  ): void {
    const gap = Math.max(16, Math.round(fontSize * 1.4));

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
        const { iconWidth, badgeWidth, totalWidth } = measureSpanWidth(
          nextItem,
          fontSize,
          showBadge,
          showPixelIcons,
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
          iconWidth,
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
    showPixelIcons: boolean,
    fadeMargin: number,
    measureText: MeasureTextFn,
  ): void {
    const slotCount = Math.max(3, Math.min(8, Math.floor(tickerHeight / 15)));
    const slotHeight = tickerHeight / slotCount;
    const fontSize = Math.max(10, Math.min(slotHeight * 0.82, logicalHeight * 0.32));
    const gap = Math.max(14, Math.round(fontSize * 0.9));

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

      const allowBurstOverlap = bestSlot === -1 && this.priorityQueue.length > 0 && attempt === 0;
      if (bestSlot === -1 && !allowBurstOverlap) {
        break;
      }

      const chosenSlot =
        bestSlot !== -1 ? bestSlot : (this.danmakuSlotCursor++) % slotCount;
      const nextItem = this.pickNextItem();
      if (!nextItem) break;

      const { iconWidth, badgeWidth, totalWidth } = measureSpanWidth(
        nextItem,
        fontSize,
        showBadge,
        showPixelIcons,
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
        iconWidth,
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
    if (this.activeChannel === 'all' && this.weights) {
      const grouped = this.groupWeightedPool();
      if (grouped.totalWeight > 0) {
        let bestSrc: TickerSourceId | null = null;
        let bestScore = -Infinity;
        for (const [src, entry] of grouped.buckets) {
          const cur = (this.swrrCurrent.get(src) ?? 0) + entry.weight;
          if (cur > bestScore) {
            bestScore = cur;
            bestSrc = src;
          }
        }
        if (bestSrc) {
          const bucket = grouped.buckets.get(bestSrc);
          if (bucket && bucket.items.length > 0) {
            const c = this.sourceCursors.get(bestSrc) ?? 0;
            return bucket.items[c % bucket.items.length] ?? null;
          }
        }
      }
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

    if (this.activeChannel === 'all' && this.weights) {
      const grouped = this.groupWeightedPool();
      if (grouped.totalWeight <= 0) {
        return null;
      }

      // Smooth Weighted Round-Robin across active sources
      let chosenSrc: TickerSourceId | null = null;
      let maxCurrent = -Infinity;
      for (const [src, entry] of grouped.buckets) {
        const nextCurrent = (this.swrrCurrent.get(src) ?? 0) + entry.weight;
        this.swrrCurrent.set(src, nextCurrent);
        if (nextCurrent > maxCurrent) {
          maxCurrent = nextCurrent;
          chosenSrc = src;
        }
      }
      if (!chosenSrc) return null;

      this.swrrCurrent.set(chosenSrc, maxCurrent - grouped.totalWeight);
      const bucket = grouped.buckets.get(chosenSrc);
      if (!bucket || bucket.items.length === 0) return null;

      const cur = this.sourceCursors.get(chosenSrc) ?? 0;
      const item = bucket.items[cur % bucket.items.length] ?? null;
      this.sourceCursors.set(chosenSrc, (cur + 1) % bucket.items.length);
      return item;
    }

    const item = this.pool[this.poolCursor % this.pool.length] ?? null;
    this.poolCursor = (this.poolCursor + 1) % this.pool.length;
    return item;
  }

  private groupWeightedPool(): {
    buckets: Map<TickerSourceId, { weight: number; items: TickerItem[] }>;
    totalWeight: number;
  } {
    const buckets = new Map<TickerSourceId, { weight: number; items: TickerItem[] }>();
    for (const item of this.pool) {
      const weight = getSourceWeight(item.source, this.weights);
      if (weight <= 0) continue;
      let bucket = buckets.get(item.source);
      if (!bucket) {
        bucket = { weight, items: [] };
        buckets.set(item.source, bucket);
      }
      bucket.items.push(item);
    }
    let totalWeight = 0;
    for (const entry of buckets.values()) {
      totalWeight += entry.weight;
    }
    return { buckets, totalWeight };
  }
}

function measureSpanWidth(
  item: TickerItem,
  fontSize: number,
  showBadge: boolean,
  showPixelIcons: boolean,
  measureText: MeasureTextFn,
): { iconWidth: number; badgeWidth: number; totalWidth: number } {
  const iconSize = Math.max(10, Math.round(fontSize * 0.92));
  const iconWidth = showPixelIcons ? iconSize + 4 : 0;
  const badgeSize = Math.max(8, fontSize * 0.84);
  const badgeWidth = showBadge ? Math.ceil(measureText(`[${item.badge}]`, badgeSize, 700)) + 4 : 0;
  const textWidth = Math.ceil(measureText(item.text, fontSize, 500));
  return {
    iconWidth,
    badgeWidth,
    totalWidth: iconWidth + badgeWidth + textWidth + 6,
  };
}

export function isItemVisible(
  item: TickerItem,
  activeChannel: ChannelId,
  sources?: SourcesConfig,
): boolean {
  if (item.breaking) return true;
  if (activeChannel === 'clock') return false;
  if (sources && !isItemEnabledBySources(item, sources)) return false;
  return sourceMatchesChannel(item.source, activeChannel);
}

export function filterByChannel(
  items: TickerItem[],
  activeChannel: ChannelId,
  sources?: SourcesConfig,
): TickerItem[] {
  if (activeChannel === 'clock') return [];
  return items.filter((item) => isItemVisible(item, activeChannel, sources));
}
