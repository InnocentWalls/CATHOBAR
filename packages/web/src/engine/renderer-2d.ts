import {
  CHANNEL_LABELS,
  type ActivityBucket,
  type ChannelId,
  type DisplaySettings,
  type NowPlayingState,
  type TickerItem,
  type VisualMode,
} from '@cathobar/shared';
import { drawPixelIcon, resolveItemIcon } from './pixel-icons.js';
import type { SpectrumSnapshot } from './spectrum-analyzer.js';
import type { ActiveTickerSpan } from './ticker-layout.js';

const FONT_FAMILY =
  '"Noto Sans JP", "BIZ UDGothic", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';
const LED_FONT_FAMILY =
  '"DotGothic16", "BIZ UDGothic", "Noto Sans JP", monospace';

export interface ActiveBreakingAlert {
  item: TickerItem;
  elapsedSec: number;
  durationSec: number;
}

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

  getSpectrumWidth(
    tickerHeight: number,
    display: DisplaySettings,
    activeChannel: ChannelId,
    spectrum: SpectrumSnapshot | null,
  ): number {
    if (!display.showSpectrumAnalyzer || activeChannel === 'clock') return 0;
    if (display.visualMode === 'shinkansen-led' && tickerHeight <= 40) return 0;
    if (!spectrum || (!spectrum.active && display.spectrumAudioInput === 'auto')) return 0;
    return Math.max(44, Math.min(92, Math.round(tickerHeight * 0.95)));
  }

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

  getRightOverlayWidth(
    tickerHeight: number,
    display: DisplaySettings,
    activeChannel: ChannelId,
    spectrum: SpectrumSnapshot | null,
  ): number {
    const clockW = this.getClockOverlayWidth(
      tickerHeight,
      display.showClockOverlay,
      activeChannel,
      display.visualMode,
    );
    const specW = this.getSpectrumWidth(tickerHeight, display, activeChannel, spectrum);
    return clockW + specW;
  }

  render(params: {
    display: DisplaySettings;
    activeChannel: ChannelId;
    isRotating: boolean;
    rotationProgress: number;
    spans: ActiveTickerSpan[];
    activity: ActivityBucket[];
    latestWeathers: TickerItem[];
    nowPlaying: NowPlayingState | null;
    spectrum: SpectrumSnapshot | null;
    breakingAlert: ActiveBreakingAlert | null;
    now: Date;
  }): void {
    const {
      display,
      activeChannel,
      isRotating,
      rotationProgress,
      spans,
      activity,
      latestWeathers,
      nowPlaying,
      spectrum,
      breakingAlert,
      now,
    } = params;
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.scale, this.scale);

    ctx.fillStyle = display.visualMode === 'clean' ? '#070b12' : '#000000';
    ctx.fillRect(0, 0, this.width, this.height);

    if (breakingAlert) {
      this.drawBreakingAlert(ctx, display, breakingAlert);
      ctx.restore();
      return;
    }

    const graphHeight = display.showActivityGraph
      ? this.height <= 40
        ? Math.max(3, Math.round(this.height * 0.14))
        : Math.max(8, Math.round(this.height * 0.14))
      : 0;
    const tickerHeight = this.height - graphHeight;
    const clockW = this.getClockOverlayWidth(
      tickerHeight,
      display.showClockOverlay,
      activeChannel,
      display.visualMode,
    );
    const specW = this.getSpectrumWidth(tickerHeight, display, activeChannel, spectrum);
    const overlayWidth = clockW + specW;
    const tickerWidth = Math.max(40, this.width - overlayWidth);

    if (activeChannel === 'clock') {
      this.drawClockChannel(ctx, display, tickerHeight, latestWeathers, nowPlaying, now);
    } else {
      this.drawTickerSpans(ctx, display, tickerWidth, tickerHeight, spans);
      if (specW > 0 && spectrum) {
        this.drawSpectrumAnalyzer(
          ctx,
          display,
          this.width - clockW - specW,
          specW,
          tickerHeight,
          spectrum,
        );
      }
      if (display.showClockOverlay && clockW > 0) {
        this.drawClockOverlay(
          ctx,
          display,
          activeChannel,
          isRotating,
          rotationProgress,
          tickerHeight,
          clockW,
          now,
        );
      }
    }

    if (display.showActivityGraph && graphHeight > 0) {
      this.drawActivityGraph(ctx, display, graphHeight, activity);
    }

    ctx.restore();
  }

  private drawBreakingAlert(
    ctx: CanvasRenderingContext2D,
    display: DisplaySettings,
    alert: ActiveBreakingAlert,
  ): void {
    const { item, elapsedSec } = alert;
    const isShinkansen = display.visualMode === 'shinkansen-led';
    const isMono = display.visualMode === 'anobar8-vfd';
    const pulse = Math.floor(elapsedSec * 4) % 2 === 0;

    const borderColor = isMono ? (pulse ? '#ffffff' : '#666666') : pulse ? '#ff2a22' : '#ff9614';
    const bgTint = isMono
      ? pulse
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(0,0,0,1)'
      : pulse
        ? 'rgba(180,20,16,0.28)'
        : 'rgba(20,0,0,0.95)';

    ctx.fillStyle = bgTint;
    ctx.fillRect(0, 0, this.width, this.height);

    // Top & bottom hazard bars
    const barH = Math.max(2, Math.round(this.height * 0.08));
    ctx.fillStyle = borderColor;
    ctx.fillRect(0, 0, this.width, barH);
    ctx.fillRect(0, this.height - barH, this.width, barH);

    const contentH = this.height - barH * 2;
    const cy = barH + contentH * 0.52;
    const fontFam = isShinkansen ? LED_FONT_FAMILY : FONT_FAMILY;

    const iconSize = Math.max(12, Math.round(contentH * 0.56));
    const badgeSize = Math.max(10, Math.round(contentH * 0.34));
    const textSize = Math.max(12, Math.round(contentH * 0.44));

    const badgeStr = `[${item.badge}]`;
    ctx.font = `700 ${badgeSize}px ${fontFam}`;
    const badgeW = Math.ceil(ctx.measureText(badgeStr).width) + 8;

    ctx.font = `700 ${textSize}px ${fontFam}`;
    const textW = Math.ceil(ctx.measureText(item.text).width);
    const totalW = iconSize + 8 + badgeW + textW;

    let cursorX = 10;
    if (totalW <= this.width - 20) {
      cursorX = Math.max(10, (this.width - totalW) * 0.5);
    } else {
      const overflow = totalW - (this.width - 24);
      const scrollWindow = Math.max(2, alert.durationSec - 1.5);
      const t = Math.max(0, Math.min(1, (elapsedSec - 0.8) / scrollWindow));
      cursorX = 12 - overflow * t;
    }

    drawPixelIcon(
      ctx,
      resolveItemIcon(item),
      cursorX,
      cy,
      iconSize,
      display.visualMode,
      isShinkansen ? '#ff3b30' : item.color,
      true,
    );
    cursorX += iconSize + 8;

    ctx.textBaseline = 'middle';
    ctx.font = `700 ${badgeSize}px ${fontFam}`;
    ctx.fillStyle = isMono ? '#ffffff' : '#ff3b30';
    ctx.fillText(badgeStr, cursorX, cy);
    cursorX += badgeW;

    ctx.font = `700 ${textSize}px ${fontFam}`;
    ctx.fillStyle = isShinkansen ? '#ff9614' : '#ffffff';
    ctx.fillText(item.text, cursorX, cy);
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
      if (display.showPixelIcons && span.iconWidth > 0) {
        const iconSize = Math.max(10, Math.round(span.fontSize * 0.92));
        drawPixelIcon(
          ctx,
          resolveItemIcon(span.item),
          cursorX,
          centerY,
          iconSize,
          display.visualMode,
          span.item.color,
          span.item.priority === 'high',
        );
        cursorX += span.iconWidth;
      }

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

  private drawSpectrumAnalyzer(
    ctx: CanvasRenderingContext2D,
    display: DisplaySettings,
    boxX: number,
    boxW: number,
    tickerHeight: number,
    spectrum: SpectrumSnapshot,
  ): void {
    const isMono = display.visualMode === 'anobar8-vfd';
    const isShinkansen = display.visualMode === 'shinkansen-led';

    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(boxX, 0, boxW, tickerHeight);
    ctx.fillStyle = isShinkansen ? 'rgba(24,255,77,0.35)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(boxX, 1, 1, tickerHeight - 2);

    const padX = 4;
    const padY = 4;
    const usableW = Math.max(8, boxW - padX * 2);
    const usableH = Math.max(8, tickerHeight - padY * 2);
    const bands = spectrum.bands;
    const peaks = spectrum.peaks;
    const count = Math.max(1, bands.length);
    const colW = usableW / count;
    const barW = Math.max(1, Math.floor(colW - 1));
    const segments = Math.max(5, Math.min(12, Math.floor(usableH / 4)));
    const segStep = usableH / segments;
    const segH = Math.max(1, Math.floor(segStep - 1));
    const baseY = tickerHeight - padY;

    for (let i = 0; i < count; i += 1) {
      const level = bands[i] ?? 0;
      const peak = peaks[i] ?? 0;
      const activeSegs = Math.round(level * segments);
      const x = Math.floor(boxX + padX + i * colW);

      for (let s = 0; s < segments; s += 1) {
        const y = Math.floor(baseY - (s + 1) * segStep);
        const lit = s < activeSegs;
        if (!lit) {
          ctx.fillStyle = isMono ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.1)';
        } else if (isMono) {
          ctx.fillStyle = s >= segments - 2 ? '#ffffff' : '#cfcfcf';
        } else if (isShinkansen) {
          ctx.fillStyle = s >= segments - 2 ? '#ff2a22' : s >= segments - 4 ? '#ff9614' : '#18ff4d';
        } else {
          ctx.fillStyle = s >= segments - 2 ? '#ef4444' : s >= segments - 4 ? '#facc15' : '#38fad9';
        }
        ctx.fillRect(x, y, barW, segH);
      }

      const peakSeg = Math.min(segments - 1, Math.floor(peak * segments));
      if (peak > 0.05) {
        const py = Math.floor(baseY - (peakSeg + 1) * segStep);
        ctx.fillStyle = isShinkansen ? '#ff9614' : '#ffffff';
        ctx.fillRect(x, py, barW, Math.max(1, Math.min(2, segH)));
      }
    }
  }

  private drawClockOverlay(
    ctx: CanvasRenderingContext2D,
    display: DisplaySettings,
    activeChannel: ChannelId,
    isRotating: boolean,
    rotationProgress: number,
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
    const tagLabel = isRotating ? `ROT:${chTag}` : `CH:${chTag}`;
    ctx.fillText(tagLabel, boxX + 7, clockFontSize + 4);

    if (isRotating) {
      const barW = Math.max(10, overlayWidth - 14);
      const barY = Math.min(tickerHeight - 4, clockFontSize + tagFontSize + 7);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(boxX + 7, barY, barW, 2);
      ctx.fillStyle = isShinkansen ? '#18ff4d' : '#38fad9';
      ctx.fillRect(boxX + 7, barY, Math.round(barW * Math.max(0, Math.min(1, rotationProgress))), 2);
    }
  }

  private drawClockChannel(
    ctx: CanvasRenderingContext2D,
    display: DisplaySettings,
    tickerHeight: number,
    latestWeathers: TickerItem[],
    nowPlaying: NowPlayingState | null,
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
    const npSummary =
      nowPlaying?.playing && nowPlaying.title
        ? `♪ ${nowPlaying.title}${nowPlaying.artist ? ` - ${nowPlaying.artist}` : ''}`
        : '';
    const extraParts = [dateStr, weatherSummary, npSummary].filter(Boolean);
    const subText = extraParts.join('  |  ');
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
