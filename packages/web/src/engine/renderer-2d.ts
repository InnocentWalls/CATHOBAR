import {
  CHANNEL_LABELS,
  type ActivityBucket,
  type ChannelId,
  type DisplaySettings,
  type TickerItem,
} from '@cathobar/shared';
import type { ActiveTickerSpan } from './ticker-layout.js';

const FONT_FAMILY =
  '"Noto Sans JP", "BIZ UDGothic", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';

export class Renderer2D {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private width = 640;
  private height = 96;
  private scale = 1;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create 2D canvas context');
    }
    this.ctx = ctx;
  }

  configure(logicalWidth: number, logicalHeight: number, renderScale: number): void {
    const nextW = Math.max(1, Math.round(logicalWidth * renderScale));
    const nextH = Math.max(1, Math.round(logicalHeight * renderScale));
    if (this.canvas.width !== nextW || this.canvas.height !== nextH) {
      this.canvas.width = nextW;
      this.canvas.height = nextH;
    }
    this.width = logicalWidth;
    this.height = logicalHeight;
    this.scale = renderScale;
  }

  measureText = (text: string, fontSizePx: number, weight = 500): number => {
    this.ctx.font = `${weight} ${fontSizePx}px ${FONT_FAMILY}`;
    return this.ctx.measureText(text).width;
  };

  getClockOverlayWidth(
    tickerHeight: number,
    showClockOverlay: boolean,
    activeChannel: ChannelId,
  ): number {
    if (!showClockOverlay || activeChannel === 'clock') return 0;
    const clockFontSize = Math.max(9, Math.min(20, Math.round(tickerHeight * 0.24)));
    this.ctx.font = `700 ${clockFontSize}px "JetBrains Mono", "Consolas", monospace`;
    const timeWidth = this.ctx.measureText('00:00:00').width;
    return Math.ceil(timeWidth + 16);
  }

  render(params: {
    display: DisplaySettings;
    activeChannel: ChannelId;
    spans: ActiveTickerSpan[];
    activity: ActivityBucket[];
    latestWeathers: TickerItem[];
    now: Date;
  }): void {
    const { display, activeChannel, spans, activity, latestWeathers, now } = params;
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.scale, this.scale);

    ctx.fillStyle = display.visualMode === 'clean' ? '#070b12' : '#000000';
    ctx.fillRect(0, 0, this.width, this.height);

    const graphHeight = display.showActivityGraph
      ? Math.max(8, Math.round(this.height * 0.14))
      : 0;
    const tickerHeight = this.height - graphHeight;
    const overlayWidth = this.getClockOverlayWidth(
      tickerHeight,
      display.showClockOverlay,
      activeChannel,
    );
    const tickerWidth = Math.max(80, this.width - overlayWidth);

    if (activeChannel === 'clock') {
      this.drawClockChannel(ctx, tickerHeight, latestWeathers, now);
    } else {
      this.drawTickerSpans(ctx, display, tickerWidth, tickerHeight, spans);
      if (display.showClockOverlay) {
        this.drawClockOverlay(ctx, activeChannel, tickerHeight, overlayWidth, now);
      }
    }

    if (display.showActivityGraph && graphHeight > 0) {
      this.drawActivityGraph(ctx, graphHeight, activity);
    }

    ctx.restore();
  }

  private drawTickerSpans(
    ctx: CanvasRenderingContext2D,
    display: DisplaySettings,
    tickerWidth: number,
    tickerHeight: number,
    spans: ActiveTickerSpan[],
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, tickerWidth, tickerHeight);
    ctx.clip();
    ctx.textBaseline = 'middle';

    const isMono = display.visualMode === 'anobar8-vfd';

    for (const span of spans) {
      const centerY = span.yRatio * tickerHeight;

      ctx.save();
      ctx.globalAlpha = span.alpha;

      let cursorX = span.x;
      if (display.showSourceBadge && span.badgeWidth > 0) {
        const badgeSize = Math.max(8, span.fontSize * 0.78);
        ctx.font = `700 ${badgeSize}px ${FONT_FAMILY}`;
        ctx.fillStyle = isMono ? '#a8a8a8' : span.item.color;
        ctx.fillText(`[${span.item.badge}]`, cursorX, centerY);
        cursorX += span.badgeWidth;
      }

      ctx.font = `500 ${span.fontSize}px ${FONT_FAMILY}`;
      ctx.fillStyle = isMono
        ? span.item.priority === 'high'
          ? '#ffffff'
          : '#e5e5e5'
        : '#f8fafc';
      ctx.fillText(span.item.text, cursorX, centerY);
      ctx.restore();
    }

    ctx.restore();
  }

  private drawClockOverlay(
    ctx: CanvasRenderingContext2D,
    activeChannel: ChannelId,
    tickerHeight: number,
    overlayWidth: number,
    now: Date,
  ): void {
    const timeStr = formatTime(now);
    const chTag = CHANNEL_LABELS[activeChannel]?.short ?? 'ALL';
    const clockFontSize = Math.max(9, Math.min(20, Math.round(tickerHeight * 0.24)));
    const tagFontSize = Math.max(7, Math.round(clockFontSize * 0.72));

    const boxX = this.width - overlayWidth;
    const boxY = 2;

    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(boxX, 0, overlayWidth, tickerHeight);

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(boxX, 2, 1, tickerHeight - 4);

    ctx.font = `700 ${clockFontSize}px "JetBrains Mono", "Consolas", monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.fillText(timeStr, boxX + 7, boxY + 2);

    ctx.font = `600 ${tagFontSize}px "JetBrains Mono", "Consolas", monospace`;
    ctx.fillStyle = '#9ca3af';
    ctx.fillText(`CH:${chTag}`, boxX + 7, boxY + clockFontSize + 4);
  }

  private drawClockChannel(
    ctx: CanvasRenderingContext2D,
    tickerHeight: number,
    latestWeathers: TickerItem[],
    now: Date,
  ): void {
    const timeStr = formatTime(now);
    const dateStr = formatDate(now);

    const timeSize = Math.max(16, Math.round(tickerHeight * 0.56));
    const dateSize = Math.max(9, Math.round(tickerHeight * 0.2));

    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${timeSize}px "JetBrains Mono", "Consolas", monospace`;
    const timeW = ctx.measureText(timeStr).width;

    ctx.font = `500 ${dateSize}px ${FONT_FAMILY}`;
    const weatherSummary = latestWeathers
      .map((w) => `[${w.badge}] ${w.text}`)
      .join('  /  ');
    const subText = weatherSummary ? `${dateStr}  |  ${weatherSummary}` : dateStr;
    const subW = ctx.measureText(subText).width;

    const totalW = timeW + 18 + subW;
    const startX = Math.max(12, (this.width - totalW) * 0.5);
    const cy = tickerHeight * 0.5;

    ctx.font = `700 ${timeSize}px "JetBrains Mono", "Consolas", monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(timeStr, startX, cy);

    ctx.font = `500 ${dateSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = '#bdbdbd';
    ctx.fillText(subText, startX + timeW + 18, cy);
  }

  private drawActivityGraph(
    ctx: CanvasRenderingContext2D,
    graphHeight: number,
    activity: ActivityBucket[],
  ): void {
    const yBase = this.height;
    const barCount = Math.max(1, activity.length);
    const barSlot = this.width / barCount;
    const barW = Math.max(1, barSlot - 1);
    const maxCount = Math.max(3, ...activity.map((b) => b.count));

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, yBase - graphHeight, this.width, 1);

    for (let i = 0; i < activity.length; i += 1) {
      const bucket = activity[i];
      if (!bucket || bucket.count <= 0) continue;
      const ratio = Math.min(1, bucket.count / maxCount);
      const h = Math.max(1, Math.round(ratio * (graphHeight - 2)));
      const x = Math.floor(i * barSlot);
      ctx.fillStyle = ratio > 0.7 ? '#ffffff' : '#94a3b8';
      ctx.fillRect(x, yBase - h, barW, h);
    }
  }
}

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatDate(d: Date): string {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const w = days[d.getDay()] ?? '';
  return `${y}/${m}/${day} (${w})`;
}
