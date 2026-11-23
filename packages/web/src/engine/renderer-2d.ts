import {
  CHANNEL_LABELS,
  type ActivityBucket,
  type ChannelId,
  type DisplaySettings,
  type TickerItem,
  type VisualMode,
} from '@cathobar/shared';
import type { ActiveTickerSpan } from './ticker-layout.js';

const FONT_FAMILY =
  '"Noto Sans JP", "BIZ UDGothic", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';
const LED_FONT_FAMILY =
  '"DotGothic16", "BIZ UDGothic", "Noto Sans JP", monospace';

export class Renderer2D {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private width = 640;
  private height = 96;
  private scale = 1;
  private activeFontFamily = FONT_FAMILY;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create 2D canvas context');
    }
    this.ctx = ctx;
  }

  configure(
    logicalWidth: number,
    logicalHeight: number,
    renderScale: number,
    visualMode: VisualMode,
  ): void {
    const nextW = Math.max(1, Math.round(logicalWidth * renderScale));
    const nextH = Math.max(1, Math.round(logicalHeight * renderScale));
    if (this.canvas.width !== nextW || this.canvas.height !== nextH) {
      this.canvas.width = nextW;
      this.canvas.height = nextH;
    }
    this.width = logicalWidth;
    this.height = logicalHeight;
    this.scale = renderScale;
    this.activeFontFamily = visualMode === 'shinkansen-led' ? LED_FONT_FAMILY : FONT_FAMILY;
  }

  measureText = (text: string, fontSizePx: number, weight = 500): number => {
    this.ctx.font = `${weight} ${fontSizePx}px ${this.activeFontFamily}`;
    return this.ctx.measureText(text).width;
  };

  getClockOverlayWidth(
    tickerHeight: number,
    showClockOverlay: boolean,
    activeChannel: ChannelId,
    visualMode: VisualMode,
  ): number {
    if (!showClockOverlay || activeChannel === 'clock') return 0;
    if (visualMode === 'shinkansen-led' && tickerHeight <= 40) {
      const compactSize = Math.max(8, Math.round(tickerHeight * 0.44));
      this.ctx.font = `700 ${compactSize}px "JetBrains Mono", "Consolas", monospace`;
      return Math.ceil(this.ctx.measureText('00:00').width + 8);
    }
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
      ? this.height <= 40
        ? Math.max(3, Math.round(this.height * 0.14))
        : Math.max(8, Math.round(this.height * 0.14))
      : 0;
    const tickerHeight = this.height - graphHeight;
    const overlayWidth = this.getClockOverlayWidth(
      tickerHeight,
      display.showClockOverlay,
      activeChannel,
      display.visualMode,
    );
    const tickerWidth = Math.max(40, this.width - overlayWidth);

    if (activeChannel === 'clock') {
      this.drawClockChannel(ctx, display, tickerHeight, latestWeathers, now);
    } else {
      this.drawTickerSpans(ctx, display, tickerWidth, tickerHeight, spans);
      if (display.showClockOverlay) {
        this.drawClockOverlay(ctx, display, activeChannel, tickerHeight, overlayWidth, now);
      }
    }

    if (display.showActivityGraph && graphHeight > 0) {
      this.drawActivityGraph(ctx, display, graphHeight, activity);
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
    const isShinkansen = display.visualMode === 'shinkansen-led';
    const fontFam = isShinkansen ? LED_FONT_FAMILY : FONT_FAMILY;

    for (const span of spans) {
      const centerY = span.yRatio * tickerHeight;

      ctx.save();
      ctx.globalAlpha = span.alpha;

      let cursorX = span.x;
      if (display.showSourceBadge && span.badgeWidth > 0) {
        const badgeSize = Math.max(8, span.fontSize * 0.84);
        ctx.font = `700 ${badgeSize}px ${fontFam}`;
        if (isShinkansen) {
          ctx.fillStyle = span.item.priority === 'high' ? '#ff2a22' : '#18ff4d';
        } else if (isMono) {
          ctx.fillStyle = '#a8a8a8';
        } else {
          ctx.fillStyle = span.item.color;
        }
        ctx.fillText(`[${span.item.badge}]`, cursorX, centerY);
        cursorX += span.badgeWidth;
      }

      ctx.font = `500 ${span.fontSize}px ${fontFam}`;
      if (isShinkansen) {
        ctx.fillStyle = span.item.priority === 'high' ? '#ff3b30' : '#ff9614';
      } else if (isMono) {
        ctx.fillStyle = span.item.priority === 'high' ? '#ffffff' : '#e5e5e5';
      } else {
        ctx.fillStyle = '#f8fafc';
      }
      ctx.fillText(span.item.text, cursorX, centerY);
      ctx.restore();
    }

    ctx.restore();
  }

  private drawClockOverlay(
    ctx: CanvasRenderingContext2D,
    display: DisplaySettings,
    activeChannel: ChannelId,
    tickerHeight: number,
    overlayWidth: number,
    now: Date,
  ): void {
    const isShinkansen = display.visualMode === 'shinkansen-led';
    const boxX = this.width - overlayWidth;

    ctx.fillStyle = 'rgba(0,0,0,0.94)';
    ctx.fillRect(boxX, 0, overlayWidth, tickerHeight);

    ctx.fillStyle = isShinkansen ? 'rgba(24,255,77,0.35)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(boxX, 1, 1, tickerHeight - 2);

    if (isShinkansen && tickerHeight <= 40) {
      const compactTime = formatTime(now).slice(0, 5);
      const compactSize = Math.max(8, Math.round(tickerHeight * 0.44));
      ctx.font = `700 ${compactSize}px "JetBrains Mono", "Consolas", monospace`;
      ctx.fillStyle = '#ff9614';
      ctx.textBaseline = 'middle';
      ctx.fillText(compactTime, boxX + 4, tickerHeight * 0.52);
      return;
    }

    const timeStr = formatTime(now);
    const chTag = CHANNEL_LABELS[activeChannel]?.short ?? 'ALL';
    const clockFontSize = Math.max(9, Math.min(20, Math.round(tickerHeight * 0.24)));
    const tagFontSize = Math.max(7, Math.round(clockFontSize * 0.72));

    ctx.font = `700 ${clockFontSize}px "JetBrains Mono", "Consolas", monospace`;
    ctx.fillStyle = isShinkansen ? '#ff9614' : '#ffffff';
    ctx.textBaseline = 'top';
    ctx.fillText(timeStr, boxX + 7, 2);

    ctx.font = `600 ${tagFontSize}px "JetBrains Mono", "Consolas", monospace`;
    ctx.fillStyle = isShinkansen ? '#18ff4d' : '#9ca3af';
    ctx.fillText(`CH:${chTag}`, boxX + 7, clockFontSize + 4);
  }

  private drawClockChannel(
    ctx: CanvasRenderingContext2D,
    display: DisplaySettings,
    tickerHeight: number,
    latestWeathers: TickerItem[],
    now: Date,
  ): void {
    const isShinkansen = display.visualMode === 'shinkansen-led';
    const fontFam = isShinkansen ? LED_FONT_FAMILY : FONT_FAMILY;
    const timeStr = formatTime(now);
    const dateStr = formatDate(now);

    const timeSize = Math.max(11, Math.round(tickerHeight * 0.58));
    const dateSize = Math.max(8, Math.round(tickerHeight * 0.34));

    ctx.textBaseline = 'middle';
    ctx.font = `700 ${timeSize}px "JetBrains Mono", "Consolas", monospace`;
    const timeW = ctx.measureText(timeStr).width;

    ctx.font = `500 ${dateSize}px ${fontFam}`;
    const weatherSummary = latestWeathers
      .map((w) => `[${w.badge}] ${w.text}`)
      .join('  /  ');
    const subText = weatherSummary ? `${dateStr}  |  ${weatherSummary}` : dateStr;
    const subW = ctx.measureText(subText).width;

    const totalW = timeW + 12 + subW;
    const startX = Math.max(6, (this.width - totalW) * 0.5);
    const cy = tickerHeight * 0.52;

    ctx.font = `700 ${timeSize}px "JetBrains Mono", "Consolas", monospace`;
    ctx.fillStyle = isShinkansen ? '#ff9614' : '#ffffff';
    ctx.fillText(timeStr, startX, cy);

    ctx.font = `500 ${dateSize}px ${fontFam}`;
    ctx.fillStyle = isShinkansen ? '#18ff4d' : '#bdbdbd';
    ctx.fillText(subText, startX + timeW + 12, cy);
  }

  private drawActivityGraph(
    ctx: CanvasRenderingContext2D,
    display: DisplaySettings,
    graphHeight: number,
    activity: ActivityBucket[],
  ): void {
    const isShinkansen = display.visualMode === 'shinkansen-led';
    const yBase = this.height;
    const barCount = Math.max(1, activity.length);
    const barSlot = this.width / barCount;
    const barW = Math.max(1, barSlot - 1);
    const maxCount = Math.max(3, ...activity.map((b) => b.count));

    ctx.fillStyle = isShinkansen ? 'rgba(24,255,77,0.22)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, yBase - graphHeight, this.width, 1);

    for (let i = 0; i < activity.length; i += 1) {
      const bucket = activity[i];
      if (!bucket || bucket.count <= 0) continue;
      const ratio = Math.min(1, bucket.count / maxCount);
      const h = Math.max(1, Math.round(ratio * Math.max(1, graphHeight - 1)));
      const x = Math.floor(i * barSlot);
      if (isShinkansen) {
        ctx.fillStyle = ratio > 0.75 ? '#ff2a22' : ratio > 0.4 ? '#ff9614' : '#18ff4d';
      } else {
        ctx.fillStyle = ratio > 0.7 ? '#ffffff' : '#94a3b8';
      }
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
