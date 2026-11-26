import {
  CHANNEL_LABELS,
  type ActivityBucket,
  type ChannelId,
  type DisplaySettings,
  type NowPlayingState,
  type SensorReading,
  type SourcesConfig,
  type TickerItem,
  type VisualMode,
} from '@cathobar/shared';
import {
  computeScreenRegions,
  drawBoardBody,
  drawBoardHeader,
  drawFullScreenClockShowcase,
  drawTallBreakingAlert,
} from './board-renderer.js';
import { drawBootSequence, type ActiveBootSequence } from './boot-sequence.js';
import { drawPixelIcon, resolveItemIcon } from './pixel-icons.js';
import type { SpectrumSnapshot } from './spectrum-analyzer.js';
import {
  computeStationBadgeWidth,
  type ActiveTickerSpan,
  type EffectiveScreenLayout,
  type SplitFlapRowState,
} from './ticker-layout.js';

const FONT_FAMILY =
  '"Noto Sans JP", "BIZ UDGothic", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';
const LED_FONT_FAMILY =
  '"DotGothic16", "BIZ UDGothic", "Noto Sans JP", monospace';
const FLAP_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789アイウエオカキクケコサシスセソタチツテトナニヌネノ';
const MAX_SPAN_SPRITE_CACHE = 96;

interface SpanSprite {
  canvas: HTMLCanvasElement;
  drawW: number;
  drawH: number;
}

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
  private visualMode: VisualMode = 'anobar8-vfd';
  private activeFontFamily = FONT_FAMILY;
  private readonly spanSprites = new Map<string, SpanSprite>();
  private readonly clockWidthCache = new Map<string, number>();

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create 2D canvas context');
    }
    this.ctx = ctx;

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(() => {
        this.spanSprites.clear();
        this.clockWidthCache.clear();
      });
    }
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
    if (this.scale !== renderScale || this.visualMode !== visualMode) {
      this.spanSprites.clear();
    }
    this.width = logicalWidth;
    this.height = logicalHeight;
    this.scale = renderScale;
    this.visualMode = visualMode;
    this.activeFontFamily =
      visualMode === 'shinkansen-led' || visualMode === 'station-board'
        ? LED_FONT_FAMILY
        : FONT_FAMILY;
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
    const key = `${tickerHeight}|${activeChannel}|${visualMode}`;
    const cached = this.clockWidthCache.get(key);
    if (cached !== undefined) return cached;

    let width: number;
    if (visualMode === 'shinkansen-led' && tickerHeight <= 40) {
      const compactSize = Math.max(8, Math.round(tickerHeight * 0.44));
      this.ctx.font = `700 ${compactSize}px "JetBrains Mono", "Consolas", monospace`;
      width = Math.ceil(this.ctx.measureText('00:00').width + 8);
    } else {
      const clockFontSize = Math.max(9, Math.min(20, Math.round(tickerHeight * 0.24)));
      this.ctx.font = `700 ${clockFontSize}px "JetBrains Mono", "Consolas", monospace`;
      const timeWidth = this.ctx.measureText('00:00:00').width;
      width = Math.ceil(timeWidth + 16);
    }

    if (this.clockWidthCache.size >= 64) {
      const oldest = this.clockWidthCache.keys().next().value;
      if (oldest !== undefined) this.clockWidthCache.delete(oldest);
    }
    this.clockWidthCache.set(key, width);
    return width;
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
    effectiveScreenLayout?: EffectiveScreenLayout;
    activeChannel: ChannelId;
    isRotating: boolean;
    rotationProgress: number;
    spans: ActiveTickerSpan[];
    splitFlapRows?: SplitFlapRowState[];
    allItems?: TickerItem[];
    sources?: SourcesConfig;
    activity: ActivityBucket[];
    latestWeathers: TickerItem[];
    nowPlaying: NowPlayingState | null;
    sensors?: SensorReading[];
    spectrum: SpectrumSnapshot | null;
    breakingAlert: ActiveBreakingAlert | null;
    bootSequence?: ActiveBootSequence | null;
    now: Date;
    transparent?: boolean;
    blackout?: boolean;
    paused?: boolean;
  }): void {
    const {
      display,
      effectiveScreenLayout = 'bar',
      activeChannel,
      isRotating,
      rotationProgress,
      spans,
      splitFlapRows = [],
      allItems = [],
      sources,
      activity,
      latestWeathers,
      nowPlaying,
      sensors = [],
      spectrum,
      breakingAlert,
      bootSequence = null,
      now,
      transparent = false,
      blackout = false,
      paused = false,
    } = params;
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.scale, this.scale);

    if (transparent) {
      ctx.clearRect(0, 0, this.width, this.height);
    } else {
      ctx.fillStyle = display.visualMode === 'clean' ? '#070b12' : '#000000';
      ctx.fillRect(0, 0, this.width, this.height);
    }

    if (blackout && !breakingAlert) {
      ctx.restore();
      return;
    }

    if (breakingAlert) {
      if (this.height >= 160) {
        drawTallBreakingAlert({
          ctx,
          width: this.width,
          height: this.height,
          display,
          item: breakingAlert.item,
          elapsedSec: breakingAlert.elapsedSec,
        });
      } else {
        this.drawBreakingAlert(ctx, display, breakingAlert);
      }
      ctx.restore();
      return;
    }

    if (bootSequence) {
      drawBootSequence({
        ctx,
        width: this.width,
        height: this.height,
        display,
        boot: bootSequence,
        now,
        transparent,
      });
      ctx.restore();
      return;
    }

    if (effectiveScreenLayout !== 'bar') {
      const regions = computeScreenRegions(
        this.width,
        this.height,
        effectiveScreenLayout,
        display,
        activeChannel,
      );

      if (activeChannel === 'clock') {
        drawFullScreenClockShowcase({
          ctx,
          rect: regions.bodyRect,
          display,
          latestWeathers,
          nowPlaying,
          sensors,
          spectrum,
          now,
          transparent,
        });
      } else {
        if (regions.headerRect.w > 0 && regions.headerRect.h > 0) {
          drawBoardHeader({
            ctx,
            rect: regions.headerRect,
            compact: effectiveScreenLayout === 'wall',
            display,
            activeChannel,
            isRotating,
            rotationProgress,
            latestWeathers,
            nowPlaying,
            sensors,
            spectrum,
            now,
            transparent,
            paused,
          });
        }

        if (regions.showMiddleBoard && regions.bodyRect.w > 0 && regions.bodyRect.h > 0 && sources) {
          drawBoardBody({
            ctx,
            rect: regions.bodyRect,
            display,
            activeChannel,
            allItems,
            sources,
            latestWeathers,
            nowPlaying,
            sensors,
            now,
            transparent,
          });
        }

        if (regions.tickerRect.w > 0 && regions.tickerRect.h > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(
            regions.tickerRect.x,
            regions.tickerRect.y,
            regions.tickerRect.w,
            regions.tickerRect.h,
          );
          ctx.clip();
          ctx.translate(regions.tickerRect.x, regions.tickerRect.y);

          if (regions.showMiddleBoard) {
            // Subtle separator above bottom ticker strip
            ctx.fillStyle =
              display.visualMode === 'shinkansen-led'
                ? 'rgba(24,255,77,0.28)'
                : 'rgba(148,163,184,0.22)';
            ctx.fillRect(0, 0, regions.tickerRect.w, 1);
          }

          if (display.visualMode === 'split-flap') {
            this.drawSplitFlap(
              ctx,
              display,
              regions.tickerRect.w,
              regions.tickerRect.h,
              splitFlapRows,
              regions.effectiveTickerLanes,
            );
          } else if (display.visualMode === 'station-board') {
            this.drawStationBoard(
              ctx,
              display,
              regions.tickerRect.w,
              regions.tickerRect.h,
              spans,
              regions.effectiveTickerLanes,
            );
          } else {
            this.drawTickerSpans(
              ctx,
              display,
              regions.tickerRect.w,
              regions.tickerRect.h,
              spans,
            );
          }
          ctx.restore();
        }
      }

      if (display.showActivityGraph && regions.graphRect.h > 0) {
        this.drawActivityGraph(ctx, display, regions.graphRect.h, activity);
      }

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
      this.drawClockChannel(ctx, display, tickerHeight, latestWeathers, nowPlaying, sensors, now);
    } else {
      if (display.visualMode === 'split-flap') {
        this.drawSplitFlap(
          ctx,
          display,
          tickerWidth,
          tickerHeight,
          splitFlapRows,
          Math.max(1, Math.min(3, display.lanes)),
        );
      } else if (display.visualMode === 'station-board') {
        this.drawStationBoard(
          ctx,
          display,
          tickerWidth,
          tickerHeight,
          spans,
          Math.max(1, Math.min(3, display.lanes)),
        );
      } else {
        this.drawTickerSpans(ctx, display, tickerWidth, tickerHeight, spans);
      }

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
          paused,
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

  private drawSplitFlap(
    ctx: CanvasRenderingContext2D,
    display: DisplaySettings,
    tickerWidth: number,
    tickerHeight: number,
    rows: SplitFlapRowState[],
    lanesOverride = Math.min(3, display.lanes),
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, tickerWidth, tickerHeight);
    ctx.clip();

    const rowCount = Math.max(1, rows.length || lanesOverride);
    const rowH = tickerHeight / rowCount;
    const cellH = Math.max(12, Math.floor(rowH * 0.78));
    const cellW = Math.max(12, Math.round(cellH * 0.92));
    const gapX = Math.max(1, Math.round(cellW * 0.12));
    const fontSize = Math.max(8, Math.round(cellH * 0.64));
    const badgeW = display.showSourceBadge
      ? Math.max(58, Math.min(108, Math.round(tickerWidth * 0.22)))
      : 0;

    for (let r = 0; r < rowCount; r += 1) {
      const row = rows[r];
      const topY = r * rowH;
      const cy = topY + rowH * 0.5;
      const cellTop = Math.round(cy - cellH * 0.5);

      // Subtle mechanical track background
      ctx.fillStyle = '#0e1116';
      ctx.fillRect(0, topY + 1, tickerWidth, rowH - 2);

      if (!row) continue;

      if (display.showSourceBadge) {
        ctx.fillStyle = '#181c24';
        ctx.fillRect(3, cellTop, badgeW - 6, cellH);
        ctx.fillStyle = row.item.color;
        ctx.fillRect(3, cellTop, 3, cellH);

        ctx.save();
        ctx.beginPath();
        ctx.rect(7, cellTop, badgeW - 11, cellH);
        ctx.clip();
        ctx.fillStyle = '#f1f5f9';
        drawFittedText(
          ctx,
          row.item.badge,
          8,
          cy,
          Math.max(10, badgeW - 13),
          Math.max(8, Math.round(cellH * 0.48)),
          FONT_FAMILY,
          700,
          'left',
        );
        ctx.restore();
      }

      const startX = badgeW + 4;
      const usableW = Math.max(10, tickerWidth - startX - 4);
      const maxChars = Math.max(1, Math.floor(usableW / (cellW + gapX)));
      const chars = Array.from(row.displayText);

      // Slowly pan if message exceeds mechanical board columns
      const holdT = Math.max(0, row.elapsedSec - 1.5);
      const overflow = Math.max(0, chars.length - maxChars);
      const scrollStep =
        overflow > 0
          ? Math.min(overflow, Math.floor((holdT / Math.max(1.5, row.holdDurationSec - 2.0)) * (overflow + 1)))
          : 0;

      ctx.font = `700 ${fontSize}px "JetBrains Mono", ${FONT_FAMILY}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';

      for (let i = 0; i < maxChars; i += 1) {
        const cx = startX + i * (cellW + gapX);
        const targetChar = chars[i + scrollStep] ?? ' ';
        const charDelay = (i / Math.max(1, maxChars)) * 0.55;
        const localProgress = Math.max(0, Math.min(1, (row.flipProgress - charDelay) / 0.45));
        const isFlipping = localProgress < 1 && targetChar !== ' ';

        const shownChar = isFlipping
          ? FLAP_CHARSET[Math.floor(localProgress * 7 + i) % FLAP_CHARSET.length]!
          : targetChar;

        // Upper & lower flap plates
        ctx.fillStyle = '#171b22';
        ctx.fillRect(cx, cellTop, cellW, cellH);
        ctx.fillStyle = '#262d38';
        ctx.fillRect(cx, cellTop, cellW, 1);

        if (shownChar !== ' ') {
          ctx.save();
          if (isFlipping) {
            const scaleY = Math.max(0.25, Math.abs(Math.cos(localProgress * Math.PI * 2)));
            ctx.translate(cx + cellW * 0.5, cy);
            ctx.scale(1, scaleY);
            ctx.fillStyle = '#fef08a';
            ctx.fillText(shownChar, 0, 0, Math.max(4, cellW - 2));
          } else {
            ctx.fillStyle = row.item.priority === 'high' ? '#fbbf24' : '#f8fafc';
            ctx.fillText(shownChar, cx + cellW * 0.5, cy, Math.max(4, cellW - 2));
          }
          ctx.restore();
        }

        // Center split hinge line
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(cx, Math.floor(cy), cellW, 1);
      }
      ctx.textAlign = 'left';
    }

    ctx.restore();
  }

  private drawStationBoard(
    ctx: CanvasRenderingContext2D,
    display: DisplaySettings,
    tickerWidth: number,
    tickerHeight: number,
    spans: ActiveTickerSpan[],
    lanesOverride = Math.max(1, Math.min(3, display.lanes)),
  ): void {
    const safeLanes = Math.max(1, lanesOverride);
    const laneHeight = tickerHeight / safeLanes;
    const badgeColWidth = computeStationBadgeWidth(tickerWidth);
    const textAreaWidth = Math.max(40, tickerWidth - badgeColWidth);

    // Draw horizontal lane dividers & pick leading span per lane for fixed left column
    for (let lane = 0; lane < safeLanes; lane += 1) {
      const topY = lane * laneHeight;
      if (lane > 0) {
        ctx.fillStyle = 'rgba(148,163,184,0.22)';
        ctx.fillRect(0, Math.floor(topY), tickerWidth, 1);
      }

      const laneSpans = spans.filter((s) => s.lane === lane);
      const lead = laneSpans[0];
      if (lead) {
        const cy = topY + laneHeight * 0.52;
        const padY = Math.max(2, Math.round(laneHeight * 0.14));
        const boxH = Math.max(10, laneHeight - padY * 2);
        const boxY = Math.round(topY + padY);
        const boxW = badgeColWidth - 7;
        const isHigh = lead.item.priority === 'high';

        ctx.fillStyle = isHigh ? '#dc2626' : lead.item.color || '#16a34a';
        ctx.fillRect(3, boxY, boxW, boxH);

        ctx.save();
        ctx.beginPath();
        ctx.rect(5, boxY, Math.max(4, boxW - 4), boxH);
        ctx.clip();
        ctx.fillStyle = '#090d12';
        drawFittedText(
          ctx,
          lead.item.badge,
          3 + boxW * 0.5,
          cy,
          Math.max(10, boxW - 6),
          Math.max(8, Math.round(boxH * 0.52)),
          LED_FONT_FAMILY,
          700,
          'center',
        );
        ctx.restore();
      }
    }

    // Vertical divider between badge column and scrolling text
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(badgeColWidth - 1, 0, 1, tickerHeight);

    ctx.save();
    ctx.beginPath();
    ctx.rect(badgeColWidth, 0, textAreaWidth, tickerHeight);
    ctx.clip();
    ctx.textBaseline = 'middle';

    for (const span of spans) {
      const centerY = span.yRatio * tickerHeight;
      const drawX = badgeColWidth + span.x;
      const sprite = this.getOrCreateSpanSprite(span, display, true);
      if (sprite) {
        if (span.alpha < 0.999) {
          ctx.save();
          ctx.globalAlpha = span.alpha;
          ctx.drawImage(sprite.canvas, drawX - 1, centerY - sprite.drawH * 0.5, sprite.drawW, sprite.drawH);
          ctx.restore();
        } else {
          ctx.drawImage(sprite.canvas, drawX - 1, centerY - sprite.drawH * 0.5, sprite.drawW, sprite.drawH);
        }
        continue;
      }

      ctx.save();
      ctx.globalAlpha = span.alpha;
      let cursorX = drawX;

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

      ctx.font = `500 ${span.fontSize}px ${LED_FONT_FAMILY}`;
      ctx.fillStyle = span.item.priority === 'high' ? '#ff9614' : '#f8fafc';
      ctx.fillText(span.item.text, cursorX, centerY);
      ctx.restore();
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
      const sprite = this.getOrCreateSpanSprite(span, display, false);
      if (sprite) {
        if (span.alpha < 0.999) {
          ctx.save();
          ctx.globalAlpha = span.alpha;
          ctx.drawImage(sprite.canvas, span.x - 1, centerY - sprite.drawH * 0.5, sprite.drawW, sprite.drawH);
          ctx.restore();
        } else {
          ctx.drawImage(sprite.canvas, span.x - 1, centerY - sprite.drawH * 0.5, sprite.drawW, sprite.drawH);
        }
        continue;
      }

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

  private getOrCreateSpanSprite(
    span: ActiveTickerSpan,
    display: DisplaySettings,
    isStationBoard: boolean,
  ): SpanSprite | null {
    if (typeof document === 'undefined') return null;
    const showBadge = !isStationBoard && display.showSourceBadge && span.badgeWidth > 0;
    const showIcons = display.showPixelIcons && span.iconWidth > 0;
    const key = `${span.item.id}|${span.item.badge}|${span.item.text}|${span.item.color}|${span.item.priority}|${span.item.icon ?? ''}|${display.visualMode}|${this.scale}|${showBadge ? 1 : 0}|${showIcons ? 1 : 0}|${Math.round(span.fontSize * 10)}|${isStationBoard ? 1 : 0}`;

    const cached = this.spanSprites.get(key);
    if (cached) {
      this.spanSprites.delete(key);
      this.spanSprites.set(key, cached);
      return cached;
    }

    const logicalH = Math.max(12, Math.ceil(span.fontSize * 1.45));
    const logicalW = Math.max(8, Math.ceil(span.width) + 4);
    const physW = Math.max(1, Math.ceil(logicalW * this.scale));
    const physH = Math.max(1, Math.ceil(logicalH * this.scale));
    if (physW > 4096 || physH > 1024) {
      return null;
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = physW;
    offscreen.height = physH;
    const sctx = offscreen.getContext('2d');
    if (!sctx) return null;

    sctx.scale(this.scale, this.scale);
    sctx.textBaseline = 'middle';

    const isMono = display.visualMode === 'anobar8-vfd';
    const isShinkansen = display.visualMode === 'shinkansen-led';
    const fontFam = isStationBoard || isShinkansen ? LED_FONT_FAMILY : FONT_FAMILY;
    const centerY = logicalH * 0.5;
    let cursorX = 1;

    if (showIcons) {
      const iconSize = Math.max(10, Math.round(span.fontSize * 0.92));
      drawPixelIcon(
        sctx,
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

    if (showBadge) {
      const badgeSize = Math.max(8, span.fontSize * 0.84);
      sctx.font = `700 ${badgeSize}px ${fontFam}`;
      if (isShinkansen) {
        sctx.fillStyle = span.item.priority === 'high' ? '#ff2a22' : '#18ff4d';
      } else if (isMono) {
        sctx.fillStyle = '#a8a8a8';
      } else {
        sctx.fillStyle = span.item.color;
      }
      sctx.fillText(`[${span.item.badge}]`, cursorX, centerY);
      cursorX += span.badgeWidth;
    }

    sctx.font = `500 ${span.fontSize}px ${fontFam}`;
    if (isStationBoard) {
      sctx.fillStyle = span.item.priority === 'high' ? '#ff9614' : '#f8fafc';
    } else if (isShinkansen) {
      sctx.fillStyle = span.item.priority === 'high' ? '#ff3b30' : '#ff9614';
    } else if (isMono) {
      sctx.fillStyle = span.item.priority === 'high' ? '#ffffff' : '#e5e5e5';
    } else {
      sctx.fillStyle = '#f8fafc';
    }
    sctx.fillText(span.item.text, cursorX, centerY);

    const sprite: SpanSprite = {
      canvas: offscreen,
      drawW: physW / this.scale,
      drawH: physH / this.scale,
    };

    if (this.spanSprites.size >= MAX_SPAN_SPRITE_CACHE) {
      const oldestKey = this.spanSprites.keys().next().value;
      if (oldestKey !== undefined) {
        this.spanSprites.delete(oldestKey);
      }
    }
    this.spanSprites.set(key, sprite);
    return sprite;
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
    paused = false,
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
    ctx.fillStyle = paused ? '#f59e0b' : isShinkansen ? '#18ff4d' : '#9ca3af';
    const tagLabel = paused ? 'PAUSED' : isRotating ? `ROT:${chTag}` : `CH:${chTag}`;
    ctx.fillText(tagLabel, boxX + 7, clockFontSize + 4);

    if (isRotating && !paused) {
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
    sensors: SensorReading[],
    now: Date,
  ): void {
    const isShinkansen = display.visualMode === 'shinkansen-led';
    const fontFam = isShinkansen ? LED_FONT_FAMILY : FONT_FAMILY;
    const timeStr = formatTime(now);
    const dateStr = formatDate(now);

    const activeWeather =
      latestWeathers.length > 0
        ? latestWeathers[Math.floor(now.getTime() / 8000) % latestWeathers.length]
        : undefined;

    const sensorSummary =
      sensors.length > 0
        ? sensors
            .slice(0, 2)
            .map((s) => {
              const segs: string[] = [];
              if (typeof s.temperature === 'number') segs.push(`${s.temperature.toFixed(1)}℃`);
              if (typeof s.humidity === 'number') segs.push(`${Math.round(s.humidity)}%`);
              if (typeof s.co2 === 'number') segs.push(`CO2:${Math.round(s.co2)}`);
              return `[${s.name}] ${segs.join(' ')}`;
            })
            .join('  ')
        : '';

    const npSummary =
      nowPlaying?.playing && nowPlaying.title
        ? `♪ ${nowPlaying.title}${nowPlaying.artist ? ` - ${nowPlaying.artist}` : ''}`
        : '';

    if (tickerHeight >= 60) {
      // Two-row rich clock layout
      const timeSize = Math.max(16, Math.round(tickerHeight * 0.38));
      const infoSize = Math.max(9, Math.round(tickerHeight * 0.21));
      const row1Y = tickerHeight * 0.34;
      const row2Y = tickerHeight * 0.74;

      ctx.textBaseline = 'middle';
      ctx.font = `700 ${timeSize}px "JetBrains Mono", "Consolas", monospace`;
      const timeW = ctx.measureText(timeStr).width;

      ctx.font = `600 ${infoSize}px ${fontFam}`;
      const dateW = ctx.measureText(dateStr).width;

      const weatherStr = activeWeather ? `${activeWeather.badge} ${activeWeather.text}` : '';
      const row1Right = weatherStr ? `${dateStr}   ${weatherStr}` : dateStr;
      const row1RightW = ctx.measureText(row1Right).width;
      const row1TotalW = timeW + 14 + row1RightW;

      const startX = Math.max(8, (this.width - Math.min(this.width - 16, row1TotalW)) * 0.5);
      ctx.font = `700 ${timeSize}px "JetBrains Mono", "Consolas", monospace`;
      ctx.fillStyle = isShinkansen ? '#ff9614' : '#ffffff';
      ctx.fillText(timeStr, startX, row1Y);

      const infoX = startX + timeW + 14;
      const availInfoW = Math.max(40, this.width - infoX - 8);
      ctx.save();
      ctx.beginPath();
      ctx.rect(infoX, 0, availInfoW, tickerHeight * 0.56);
      ctx.clip();
      ctx.font = `500 ${infoSize}px ${fontFam}`;
      ctx.fillStyle = isShinkansen ? '#18ff4d' : '#cbd5e1';
      if (row1RightW <= availInfoW) {
        ctx.fillText(row1Right, infoX, row1Y);
      } else {
        const overflow = row1RightW - availInfoW + 16;
        const shift = ((now.getTime() / 40) % (overflow + 40)) - 20;
        const clampedShift = Math.max(0, Math.min(overflow, shift));
        ctx.fillText(row1Right, infoX - clampedShift, row1Y);
      }
      ctx.restore();

      // Row 2: weather icon / nowPlaying / indoor sensors
      const row2Parts = [npSummary, sensorSummary].filter(Boolean);
      const row2Text = row2Parts.join('   |   ') || (dateW > 0 && activeWeather ? '' : 'STANDBY');
      if (row2Text) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(8, tickerHeight * 0.54, this.width - 16, tickerHeight * 0.44);
        ctx.clip();
        ctx.font = `500 ${infoSize}px ${fontFam}`;
        const r2W = ctx.measureText(row2Text).width;
        const maxR2W = this.width - 16;
        ctx.fillStyle = npSummary ? '#f472b6' : isShinkansen ? '#ff9614' : '#94a3b8';
        if (r2W <= maxR2W) {
          ctx.fillText(row2Text, Math.max(8, (this.width - r2W) * 0.5), row2Y);
        } else {
          const overflow = r2W - maxR2W + 20;
          const shift = ((now.getTime() / 35) % (overflow + 40)) - 20;
          const clamped = Math.max(0, Math.min(overflow, shift));
          ctx.fillText(row2Text, 8 - clamped, row2Y);
        }
        ctx.restore();
      }
      return;
    }

    // Compact single-row clock for low-height LED bars
    const timeSize = Math.max(11, Math.round(tickerHeight * 0.58));
    const dateSize = Math.max(8, Math.round(tickerHeight * 0.34));

    ctx.textBaseline = 'middle';
    ctx.font = `700 ${timeSize}px "JetBrains Mono", "Consolas", monospace`;
    const timeW = ctx.measureText(timeStr).width;

    ctx.font = `500 ${dateSize}px ${fontFam}`;
    const weatherSummary = activeWeather ? `[${activeWeather.badge}] ${activeWeather.text}` : '';
    const extraParts = [dateStr, weatherSummary, npSummary, sensorSummary].filter(Boolean);
    const subText = extraParts.join('  |  ');
    const subW = ctx.measureText(subText).width;

    const totalW = timeW + 12 + subW;
    const startX = Math.max(6, (this.width - Math.min(this.width - 12, totalW)) * 0.5);
    const cy = tickerHeight * 0.52;

    ctx.font = `700 ${timeSize}px "JetBrains Mono", "Consolas", monospace`;
    ctx.fillStyle = isShinkansen ? '#ff9614' : '#ffffff';
    ctx.fillText(timeStr, startX, cy);

    const subX = startX + timeW + 12;
    const availW = Math.max(30, this.width - subX - 6);
    ctx.save();
    ctx.beginPath();
    ctx.rect(subX, 0, availW, tickerHeight);
    ctx.clip();
    ctx.font = `500 ${dateSize}px ${fontFam}`;
    ctx.fillStyle = isShinkansen ? '#18ff4d' : '#bdbdbd';
    if (subW <= availW) {
      ctx.fillText(subText, subX, cy);
    } else {
      const overflow = subW - availW + 16;
      const shift = ((now.getTime() / 35) % (overflow + 40)) - 20;
      const clamped = Math.max(0, Math.min(overflow, shift));
      ctx.fillText(subText, subX - clamped, cy);
    }
    ctx.restore();
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
    let maxCount = 3;
    for (let i = 0; i < activity.length; i += 1) {
      const c = activity[i]?.count ?? 0;
      if (c > maxCount) maxCount = c;
    }

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

function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  cy: number,
  maxWidth: number,
  baseFontSize: number,
  fontFamily: string,
  weight: number,
  align: CanvasTextAlign = 'left',
): void {
  const minFont = Math.max(7, Math.floor(baseFontSize * 0.58));
  let size = baseFontSize;
  ctx.font = `${weight} ${size}px ${fontFamily}`;
  while (size > minFont && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${fontFamily}`;
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  ctx.fillText(text, x, cy, maxWidth);
  ctx.textAlign = 'left';
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
