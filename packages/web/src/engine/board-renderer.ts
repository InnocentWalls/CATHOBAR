import {
  CHANNEL_LABELS,
  type ChannelId,
  type DisplaySettings,
  type NowPlayingState,
  type SensorReading,
  type SourcesConfig,
  type TickerItem,
  type VisualMode,
} from '@cathobar/shared';
import { drawPixelIcon, resolveItemIcon } from './pixel-icons.js';
import type { SpectrumSnapshot } from './spectrum-analyzer.js';
import { filterByChannel, type EffectiveScreenLayout } from './ticker-layout.js';

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardLayoutMetrics {
  headerRect: ScreenRect;
  bodyRect: ScreenRect;
  tickerRect: ScreenRect;
  graphRect: ScreenRect;
  effectiveTickerLanes: number;
  effectiveTickerMaxRows: number;
  effectiveTickerMaxFontSize: number;
  showMiddleBoard: boolean;
  isDanmakuFullBody: boolean;
}

const FONT_SANS =
  '"Noto Sans JP", "BIZ UDGothic", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';
const FONT_LED = '"DotGothic16", "BIZ UDGothic", "Noto Sans JP", monospace';
const FONT_MONO = '"JetBrains Mono", "Consolas", monospace';

export function computeScreenRegions(
  width: number,
  height: number,
  effectiveScreenLayout: EffectiveScreenLayout,
  display: Pick<
    DisplaySettings,
    | 'visualMode'
    | 'layoutMode'
    | 'lanes'
    | 'wallLanes'
    | 'showActivityGraph'
    | 'showClockOverlay'
  >,
  activeChannel: ChannelId,
): BoardLayoutMetrics {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  const graphH = display.showActivityGraph ? Math.max(6, Math.round(safeH * 0.055)) : 0;

  if (effectiveScreenLayout === 'bar') {
    const tickerH = Math.max(16, safeH - graphH);
    return {
      headerRect: { x: 0, y: 0, w: 0, h: 0 },
      bodyRect: { x: 0, y: 0, w: 0, h: 0 },
      tickerRect: { x: 0, y: 0, w: safeW, h: tickerH },
      graphRect: { x: 0, y: tickerH, w: safeW, h: graphH },
      effectiveTickerLanes: display.lanes,
      effectiveTickerMaxRows: display.visualMode === 'shinkansen-led' ? 1 : 3,
      effectiveTickerMaxFontSize: 46,
      showMiddleBoard: false,
      isDanmakuFullBody: false,
    };
  }

  if (activeChannel === 'clock') {
    const bodyH = Math.max(40, safeH - graphH);
    return {
      headerRect: { x: 0, y: 0, w: 0, h: 0 },
      bodyRect: { x: 0, y: 0, w: safeW, h: bodyH },
      tickerRect: { x: 0, y: 0, w: 0, h: 0 },
      graphRect: { x: 0, y: bodyH, w: safeW, h: graphH },
      effectiveTickerLanes: 1,
      effectiveTickerMaxRows: 1,
      effectiveTickerMaxFontSize: 28,
      showMiddleBoard: true,
      isDanmakuFullBody: false,
    };
  }

  const isDanmaku =
    display.layoutMode === 'danmaku' ||
    (display.layoutMode === 'auto' && activeChannel === 'mastodon');

  if (effectiveScreenLayout === 'wall') {
    const headerH = display.showClockOverlay ? Math.max(22, Math.round(safeH * 0.115)) : 0;
    const tickerH = Math.max(40, safeH - headerH - graphH);
    const wallMax = Math.max(2, Math.min(10, display.wallLanes));
    const ledLanes = Math.max(2, Math.min(5, Math.ceil(wallMax / 1.5)));
    return {
      headerRect: { x: 0, y: 0, w: safeW, h: headerH },
      bodyRect: { x: 0, y: 0, w: 0, h: 0 },
      tickerRect: { x: 0, y: headerH, w: safeW, h: tickerH },
      graphRect: { x: 0, y: headerH + tickerH, w: safeW, h: graphH },
      effectiveTickerLanes: display.visualMode === 'shinkansen-led' ? ledLanes : wallMax,
      effectiveTickerMaxRows: wallMax,
      effectiveTickerMaxFontSize: display.visualMode === 'shinkansen-led' ? 26 : 36,
      showMiddleBoard: false,
      isDanmakuFullBody: isDanmaku,
    };
  }

  // 'board' mode (16:9 unified information board + bottom ticker)
  const headerH = Math.max(26, Math.round(safeH * 0.21));
  const fullBodyTicker =
    display.visualMode === 'split-flap' ||
    display.visualMode === 'station-board' ||
    isDanmaku;

  if (fullBodyTicker) {
    const availH = Math.max(40, safeH - headerH - graphH);
    const rowTarget = display.visualMode === 'shinkansen-led' ? 22 : 40;
    const fullRows = Math.max(4, Math.min(8, Math.floor(availH / rowTarget)));
    return {
      headerRect: { x: 0, y: 0, w: safeW, h: headerH },
      bodyRect: { x: 0, y: 0, w: 0, h: 0 },
      tickerRect: { x: 0, y: headerH, w: safeW, h: availH },
      graphRect: { x: 0, y: headerH + availH, w: safeW, h: graphH },
      effectiveTickerLanes: fullRows,
      effectiveTickerMaxRows: fullRows,
      effectiveTickerMaxFontSize: display.visualMode === 'shinkansen-led' ? 24 : 32,
      showMiddleBoard: false,
      isDanmakuFullBody: isDanmaku,
    };
  }

  const tickerH = Math.max(24, Math.round(safeH * 0.17));
  const bodyH = Math.max(40, safeH - headerH - tickerH - graphH);
  const tickerLanes = display.visualMode === 'shinkansen-led' ? 1 : Math.min(2, display.lanes);
  return {
    headerRect: { x: 0, y: 0, w: safeW, h: headerH },
    bodyRect: { x: 0, y: headerH, w: safeW, h: bodyH },
    tickerRect: { x: 0, y: headerH + bodyH, w: safeW, h: tickerH },
    graphRect: { x: 0, y: headerH + bodyH + tickerH, w: safeW, h: graphH },
    effectiveTickerLanes: tickerLanes,
    effectiveTickerMaxRows: tickerLanes,
    effectiveTickerMaxFontSize: display.visualMode === 'shinkansen-led' ? 22 : 28,
    showMiddleBoard: true,
    isDanmakuFullBody: false,
  };
}

/**
 * Wraps text into lines that fit within `maxWidth` using Canvas 2D measureText,
 * supporting both space-delimited words and Japanese CJK character breaks.
 */
export function wrapTextLines(
  text: string,
  maxWidth: number,
  measureWidth: (s: string) => number,
  maxLines = 4,
): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (maxWidth <= 20) return [cleaned];

  const lines: string[] = [];
  let current = '';
  const chars = Array.from(cleaned);

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!;
    const candidate = current + ch;
    if (measureWidth(candidate) <= maxWidth || current.length === 0) {
      current = candidate;
      continue;
    }

    // Prefer breaking at last ASCII space if reasonably near the end
    const lastSpace = current.lastIndexOf(' ');
    if (lastSpace > Math.floor(current.length * 0.55)) {
      const head = current.slice(0, lastSpace).trimEnd();
      const tail = current.slice(lastSpace + 1);
      lines.push(head);
      current = (tail + ch).trimStart();
    } else {
      lines.push(current);
      current = ch === ' ' ? '' : ch;
    }

    if (lines.length >= maxLines) {
      const last = lines[maxLines - 1] ?? '';
      lines[maxLines - 1] = truncateWithEllipsis(last, maxWidth, measureWidth);
      return lines;
    }
  }

  if (current) {
    if (lines.length >= maxLines) {
      lines[maxLines - 1] = truncateWithEllipsis(lines[maxLines - 1]!, maxWidth, measureWidth);
    } else {
      lines.push(current);
    }
  }

  return lines;
}

function truncateWithEllipsis(
  text: string,
  maxWidth: number,
  measureWidth: (s: string) => number,
): string {
  if (measureWidth(text) <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 1 && measureWidth(`${chars.join('')}…`) > maxWidth) {
    chars.pop();
  }
  return `${chars.join('')}…`;
}

interface ModePalette {
  fontFamily: string;
  isMono: boolean;
  isShinkansen: boolean;
  panelBg: string;
  panelBorder: string;
  divider: string;
  primaryText: string;
  secondaryText: string;
  mutedText: string;
  accentText: string;
  highText: string;
  badgeTextFallback: string;
}

function getModePalette(visualMode: VisualMode, transparent: boolean): ModePalette {
  const isMono = visualMode === 'anobar8-vfd';
  const isShinkansen = visualMode === 'shinkansen-led';
  const fontFamily = isShinkansen || visualMode === 'station-board' ? FONT_LED : FONT_SANS;

  if (isMono) {
    return {
      fontFamily,
      isMono,
      isShinkansen,
      panelBg: transparent ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.035)',
      panelBorder: 'rgba(255,255,255,0.16)',
      divider: 'rgba(255,255,255,0.14)',
      primaryText: '#f0f0f0',
      secondaryText: '#c8c8c8',
      mutedText: '#8f8f8f',
      accentText: '#ffffff',
      highText: '#ffffff',
      badgeTextFallback: '#d4d4d4',
    };
  }
  if (isShinkansen) {
    return {
      fontFamily,
      isMono,
      isShinkansen,
      panelBg: transparent ? 'rgba(0,0,0,0.55)' : 'rgba(10,16,12,0.88)',
      panelBorder: 'rgba(24,255,77,0.28)',
      divider: 'rgba(24,255,77,0.25)',
      primaryText: '#ff9614',
      secondaryText: '#18ff4d',
      mutedText: '#18c440',
      accentText: '#18ff4d',
      highText: '#ff3b30',
      badgeTextFallback: '#18ff4d',
    };
  }
  return {
    fontFamily,
    isMono,
    isShinkansen,
    panelBg: transparent ? 'rgba(7,11,18,0.52)' : 'rgba(255,255,255,0.04)',
    panelBorder: 'rgba(148,163,184,0.2)',
    divider: 'rgba(148,163,184,0.18)',
    primaryText: '#f8fafc',
    secondaryText: '#cbd5e1',
    mutedText: '#94a3b8',
    accentText: '#38fad9',
    highText: '#ff5252',
    badgeTextFallback: '#38bdf8',
  };
}

export function drawBoardHeader(params: {
  ctx: CanvasRenderingContext2D;
  rect: ScreenRect;
  compact: boolean;
  display: DisplaySettings;
  activeChannel: ChannelId;
  isRotating: boolean;
  rotationProgress: number;
  latestWeathers: TickerItem[];
  nowPlaying: NowPlayingState | null;
  sensors: SensorReading[];
  spectrum: SpectrumSnapshot | null;
  now: Date;
  transparent: boolean;
  paused: boolean;
}): void {
  const {
    ctx,
    rect,
    compact,
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
  } = params;

  if (rect.w <= 0 || rect.h <= 0) return;

  const pal = getModePalette(display.visualMode, transparent);
  const padX = Math.max(6, Math.round(rect.w * 0.015));

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  if (!transparent) {
    ctx.fillStyle = pal.isShinkansen ? 'rgba(6,12,8,0.92)' : 'rgba(255,255,255,0.025)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.fillStyle = pal.divider;
  ctx.fillRect(rect.x, rect.y + rect.h - 1, rect.w, 1);

  const timeStr = formatTime(now);
  const dateStr = formatDate(now);
  const chTag = CHANNEL_LABELS[activeChannel]?.short ?? 'ALL';
  const activeWeather =
    latestWeathers.length > 0
      ? latestWeathers[Math.floor(now.getTime() / 8000) % latestWeathers.length]
      : undefined;

  const specW =
    spectrum && display.showSpectrumAnalyzer && (spectrum.active || display.spectrumAudioInput !== 'auto')
      ? Math.max(48, Math.min(compact ? 96 : 136, Math.round(rect.h * (compact ? 2.1 : 1.7))))
      : 0;

  if (compact) {
    // Compact single-row header for 'wall' mode
    const cy = rect.y + rect.h * 0.52;
    const timeSize = Math.max(10, Math.min(24, Math.round(rect.h * 0.56)));
    const infoSize = Math.max(8, Math.min(16, Math.round(rect.h * 0.42)));

    let cursorX = rect.x + padX;
    if (display.showClockOverlay) {
      ctx.font = `700 ${timeSize}px ${FONT_MONO}`;
      ctx.fillStyle = pal.isShinkansen ? '#ff9614' : '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(timeStr, cursorX, cy);
      cursorX += Math.ceil(ctx.measureText(timeStr).width) + 8;

      ctx.font = `600 ${infoSize}px ${pal.fontFamily}`;
      ctx.fillStyle = pal.secondaryText;
      ctx.fillText(dateStr, cursorX, cy);
      cursorX += Math.ceil(ctx.measureText(dateStr).width) + 10;
    }

    const chLabel = paused ? 'PAUSED' : isRotating ? `ROT:${chTag}` : `CH:${chTag}`;
    ctx.font = `700 ${Math.max(8, Math.round(infoSize * 0.9))}px ${FONT_MONO}`;
    const chW = Math.ceil(ctx.measureText(chLabel).width) + 10;
    const badgeH = Math.max(12, Math.round(rect.h * 0.62));
    ctx.fillStyle = paused
      ? '#f59e0b'
      : pal.isMono
        ? 'rgba(255,255,255,0.16)'
        : pal.isShinkansen
          ? 'rgba(24,255,77,0.2)'
          : 'rgba(56,250,217,0.16)';
    ctx.fillRect(cursorX, Math.round(cy - badgeH * 0.5), chW, badgeH);
    ctx.fillStyle = paused ? '#090d12' : pal.accentText;
    ctx.textBaseline = 'middle';
    ctx.fillText(chLabel, cursorX + 5, cy);
    cursorX += chW + 10;

    if (isRotating && !paused) {
      ctx.fillStyle = pal.accentText;
      ctx.fillRect(
        rect.x,
        rect.y + rect.h - 2,
        Math.round(rect.w * Math.max(0, Math.min(1, rotationProgress))),
        1,
      );
    }

    const rightLimit = rect.x + rect.w - (specW > 0 ? specW + padX : padX);
    const availMid = rightLimit - cursorX;
    if (availMid > 60) {
      const npSummary =
        nowPlaying?.playing && nowPlaying.title
          ? `♪ ${nowPlaying.title}${nowPlaying.artist ? ` - ${nowPlaying.artist}` : ''}`
          : '';
      const weatherSummary = activeWeather ? `${activeWeather.badge}: ${activeWeather.text}` : '';
      const midText = [weatherSummary, npSummary].filter(Boolean).join('   |   ');
      if (midText) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cursorX, rect.y, availMid, rect.h);
        ctx.clip();
        ctx.font = `500 ${infoSize}px ${pal.fontFamily}`;
        ctx.fillStyle = npSummary && !weatherSummary ? '#f472b6' : pal.secondaryText;
        ctx.textBaseline = 'middle';
        ctx.fillText(truncateWithEllipsis(midText, availMid, (s) => ctx.measureText(s).width), cursorX, cy);
        ctx.restore();
      }
    }

    if (specW > 0 && spectrum) {
      drawSpectrumBars(
        ctx,
        display,
        rect.x + rect.w - specW - padX * 0.5,
        rect.y + 2,
        specW,
        rect.h - 4,
        spectrum,
        false,
      );
    }

    ctx.restore();
    return;
  }

  // Full 16:9 'board' header
  const timeSize = Math.max(14, Math.min(44, Math.round(rect.h * 0.44)));
  const subSize = Math.max(8, Math.min(18, Math.round(rect.h * 0.2)));
  const leftZoneW = Math.max(96, Math.round(rect.w * 0.29));

  if (display.showClockOverlay) {
    ctx.textBaseline = 'top';
    ctx.font = `700 ${timeSize}px ${FONT_MONO}`;
    ctx.fillStyle = pal.isShinkansen ? '#ff9614' : '#ffffff';
    ctx.fillText(timeStr, rect.x + padX, rect.y + Math.round(rect.h * 0.1));

    const metaY = rect.y + Math.round(rect.h * 0.62);
    ctx.font = `600 ${subSize}px ${pal.fontFamily}`;
    ctx.fillStyle = pal.secondaryText;
    ctx.fillText(dateStr, rect.x + padX, metaY);

    const dateW = ctx.measureText(dateStr).width;
    const chLabel = paused ? 'PAUSED' : isRotating ? `ROT:${chTag}` : `CH:${chTag}`;
    const tagX = rect.x + padX + Math.ceil(dateW) + 8;
    if (tagX + 40 < rect.x + leftZoneW) {
      ctx.font = `700 ${Math.max(8, Math.round(subSize * 0.9))}px ${FONT_MONO}`;
      ctx.fillStyle = paused ? '#f59e0b' : pal.accentText;
      ctx.fillText(chLabel, tagX, metaY + 1);
    }

    if (isRotating && !paused) {
      const barY = rect.y + rect.h - 4;
      const barW = Math.max(24, leftZoneW - padX * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(rect.x + padX, barY, barW, 2);
      ctx.fillStyle = pal.accentText;
      ctx.fillRect(
        rect.x + padX,
        barY,
        Math.round(barW * Math.max(0, Math.min(1, rotationProgress))),
        2,
      );
    }
  }

  // Vertical separator after clock zone
  const midStartX = rect.x + leftZoneW;
  ctx.fillStyle = pal.divider;
  ctx.fillRect(midStartX, rect.y + 4, 1, rect.h - 8);

  const specBoxX = rect.x + rect.w - specW;
  const midAvailW = Math.max(20, specBoxX - midStartX - padX);

  // Middle info strip: Weather + NowPlaying + Sensors
  const line1Y = rect.y + rect.h * 0.31;
  const line2Y = rect.y + rect.h * 0.7;
  const lineFont = Math.max(8, Math.min(18, Math.round(rect.h * 0.21)));

  ctx.save();
  ctx.beginPath();
  ctx.rect(midStartX + padX, rect.y + 2, midAvailW - padX, rect.h - 4);
  ctx.clip();
  ctx.textBaseline = 'middle';

  let row1X = midStartX + padX;
  if (activeWeather) {
    const iconSize = Math.max(10, Math.round(lineFont * 1.15));
    if (display.showPixelIcons) {
      drawPixelIcon(
        ctx,
        resolveItemIcon(activeWeather),
        row1X,
        line1Y,
        iconSize,
        display.visualMode,
        activeWeather.color,
        activeWeather.priority === 'high',
      );
      row1X += iconSize + 6;
    }
    ctx.font = `600 ${lineFont}px ${pal.fontFamily}`;
    ctx.fillStyle = pal.primaryText;
    const wText = `${activeWeather.badge}  ${activeWeather.text}`;
    ctx.fillText(
      truncateWithEllipsis(wText, Math.max(20, specBoxX - row1X - padX), (s) =>
        ctx.measureText(s).width,
      ),
      row1X,
      line1Y,
    );
  } else {
    ctx.font = `600 ${lineFont}px ${pal.fontFamily}`;
    ctx.fillStyle = pal.mutedText;
    ctx.fillText(`CATHOBAR  [${CHANNEL_LABELS[activeChannel]?.label ?? activeChannel}]`, row1X, line1Y);
  }

  // Row 2: NowPlaying and/or Sensor summary
  const npSummary =
    nowPlaying?.playing && nowPlaying.title
      ? `♪ ${nowPlaying.title}${nowPlaying.artist ? ` - ${nowPlaying.artist}` : ''}`
      : '';
  const sensorSummary =
    sensors.length > 0
      ? sensors
          .slice(0, 2)
          .map((s) => {
            const parts: string[] = [];
            if (typeof s.temperature === 'number') parts.push(`${s.temperature.toFixed(1)}℃`);
            if (typeof s.humidity === 'number') parts.push(`${Math.round(s.humidity)}%`);
            if (typeof s.co2 === 'number') parts.push(`CO2:${Math.round(s.co2)}`);
            return `${s.name} ${parts.join(' ')}`;
          })
          .join(' / ')
      : '';

  const row2Text = [npSummary, sensorSummary].filter(Boolean).join('   |   ');
  ctx.font = `500 ${Math.max(8, Math.round(lineFont * 0.92))}px ${pal.fontFamily}`;
  if (row2Text) {
    ctx.fillStyle = npSummary
      ? pal.isMono
        ? '#e5e5e5'
        : pal.isShinkansen
          ? '#18ff4d'
          : '#f472b6'
      : pal.secondaryText;
    ctx.fillText(
      truncateWithEllipsis(row2Text, Math.max(20, midAvailW - padX), (s) =>
        ctx.measureText(s).width,
      ),
      midStartX + padX,
      line2Y,
    );
  } else {
    ctx.fillStyle = pal.mutedText;
    ctx.fillText(
      `MODE: ${display.visualMode.toUpperCase()}  |  ${CHANNEL_LABELS[activeChannel]?.short ?? 'ALL'}`,
      midStartX + padX,
      line2Y,
    );
  }
  ctx.restore();

  if (specW > 0 && spectrum) {
    drawSpectrumBars(
      ctx,
      display,
      specBoxX,
      rect.y + 2,
      specW - 2,
      rect.h - 4,
      spectrum,
      true,
    );
  }

  ctx.restore();
}

export function drawBoardBody(params: {
  ctx: CanvasRenderingContext2D;
  rect: ScreenRect;
  display: DisplaySettings;
  activeChannel: ChannelId;
  allItems: TickerItem[];
  sources: SourcesConfig;
  latestWeathers: TickerItem[];
  nowPlaying: NowPlayingState | null;
  sensors: SensorReading[];
  now: Date;
  transparent: boolean;
}): void {
  const {
    ctx,
    rect,
    display,
    activeChannel,
    allItems,
    sources,
    latestWeathers,
    nowPlaying,
    sensors,
    now,
    transparent,
  } = params;

  if (rect.w <= 0 || rect.h <= 0) return;

  const pal = getModePalette(display.visualMode, transparent);
  const filtered = filterByChannel(allItems, activeChannel, sources).filter((i) => !i.oneShot);
  const sorted = [...filtered].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
    return b.timestamp - a.timestamp;
  });

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  const pad = Math.max(6, Math.round(rect.w * 0.015));

  // Narrow width (e.g., Shinkansen LED 240x135) -> single-column LED board
  if (rect.w < 420) {
    const titleH = Math.max(12, Math.round(rect.h * 0.16));
    ctx.font = `700 ${Math.max(8, Math.round(titleH * 0.68))}px ${FONT_MONO}`;
    ctx.fillStyle = pal.accentText;
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `LIVE ${CHANNEL_LABELS[activeChannel]?.short ?? 'ALL'} (${sorted.length})`,
      rect.x + pad,
      rect.y + titleH * 0.5,
    );

    const listTop = rect.y + titleH;
    const listH = Math.max(20, rect.h - titleH);
    const maxRows = Math.max(3, Math.min(5, Math.floor(listH / 16)));
    const rowH = listH / maxRows;
    const rowFont = Math.max(9, Math.min(14, Math.round(rowH * 0.62)));

    for (let i = 0; i < Math.min(maxRows, sorted.length); i += 1) {
      const item = sorted[i]!;
      const cy = listTop + (i + 0.5) * rowH;
      let cx = rect.x + pad;

      ctx.font = `700 ${Math.max(8, Math.round(rowFont * 0.85))}px ${pal.fontFamily}`;
      ctx.fillStyle =
        item.priority === 'high'
          ? pal.highText
          : pal.isShinkansen
            ? '#18ff4d'
            : pal.isMono
              ? '#b4b4b4'
              : item.color || pal.badgeTextFallback;
      const badge = `[${item.badge}]`;
      ctx.fillText(badge, cx, cy);
      cx += Math.ceil(ctx.measureText(badge).width) + 5;

      const maxTextW = Math.max(20, rect.x + rect.w - cx - pad);
      ctx.font = `500 ${rowFont}px ${pal.fontFamily}`;
      ctx.fillStyle = item.priority === 'high' ? pal.highText : pal.primaryText;
      ctx.fillText(
        truncateWithEllipsis(item.text, maxTextW, (s) => ctx.measureText(s).width),
        cx,
        cy,
      );
    }

    ctx.restore();
    return;
  }

  // Standard 2-column 16:9 Information Board
  const leftW = Math.round(rect.w * 0.63);
  const rightX = rect.x + leftW;
  const rightW = rect.w - leftW;

  // Vertical divider between feed and telemetry sidebar
  ctx.fillStyle = pal.divider;
  ctx.fillRect(rightX, rect.y + 4, 1, rect.h - 8);

  // Left Column: Structured Live Feed
  const sectionHdrH = Math.max(14, Math.round(rect.h * 0.11));
  const hdrFont = Math.max(8, Math.min(13, Math.round(sectionHdrH * 0.56)));
  ctx.font = `700 ${hdrFont}px ${FONT_MONO}`;
  ctx.fillStyle = pal.accentText;
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `LIVE FEED  //  ${CHANNEL_LABELS[activeChannel]?.label ?? activeChannel}`,
    rect.x + pad,
    rect.y + sectionHdrH * 0.52,
  );
  ctx.fillStyle = pal.mutedText;
  const countLabel = `${sorted.length} ITEMS`;
  const countW = ctx.measureText(countLabel).width;
  ctx.fillText(countLabel, rightX - pad - countW, rect.y + sectionHdrH * 0.52);

  const feedTop = rect.y + sectionHdrH;
  const feedH = Math.max(24, rect.h - sectionHdrH - 4);
  const maxFeedRows = Math.max(4, Math.min(7, Math.floor(feedH / 24)));
  const rowH = feedH / maxFeedRows;
  const rowFont = Math.max(9, Math.min(17, Math.round(rowH * 0.48)));
  const badgeFont = Math.max(8, Math.round(rowFont * 0.78));

  if (sorted.length === 0) {
    ctx.font = `500 ${rowFont}px ${pal.fontFamily}`;
    ctx.fillStyle = pal.mutedText;
    ctx.fillText('データ取得待機中...', rect.x + pad, feedTop + rowH * 0.6);
  } else {
    for (let i = 0; i < Math.min(maxFeedRows, sorted.length); i += 1) {
      const item = sorted[i]!;
      const topY = feedTop + i * rowH;
      const cy = topY + rowH * 0.52;

      if (i > 0) {
        ctx.fillStyle = pal.isMono ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.1)';
        ctx.fillRect(rect.x + pad, Math.floor(topY), leftW - pad * 2, 1);
      }

      let cx = rect.x + pad;
      if (display.showPixelIcons) {
        const iconSize = Math.max(10, Math.round(rowFont * 0.96));
        drawPixelIcon(
          ctx,
          resolveItemIcon(item),
          cx,
          cy,
          iconSize,
          display.visualMode,
          item.color,
          item.priority === 'high',
        );
        cx += iconSize + 5;
      }

      if (display.showSourceBadge) {
        ctx.font = `700 ${badgeFont}px ${pal.fontFamily}`;
        const badgeText = `[${item.badge}]`;
        const bW = Math.ceil(ctx.measureText(badgeText).width) + 5;
        ctx.fillStyle =
          item.priority === 'high'
            ? pal.highText
            : pal.isMono
              ? '#b8b8b8'
              : pal.isShinkansen
                ? '#18ff4d'
                : item.color || pal.badgeTextFallback;
        ctx.fillText(badgeText, cx, cy);
        cx += bW;
      }

      const timeTag = formatShortTime(item.timestamp);
      ctx.font = `500 ${Math.max(7, Math.round(badgeFont * 0.9))}px ${FONT_MONO}`;
      const timeTagW = Math.ceil(ctx.measureText(timeTag).width) + 6;
      const timeX = rightX - pad - timeTagW + 4;
      ctx.fillStyle = pal.mutedText;
      ctx.fillText(timeTag, timeX, cy);

      const textAvailW = Math.max(24, timeX - cx - 6);
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, topY, textAvailW, rowH);
      ctx.clip();
      ctx.font = `500 ${rowFont}px ${pal.fontFamily}`;
      ctx.fillStyle = item.priority === 'high' ? pal.highText : pal.primaryText;
      const measuredW = ctx.measureText(item.text).width;
      if (i === 0 && measuredW > textAvailW) {
        // Gentle periodic pan for top headline
        const overflow = measuredW - textAvailW + 12;
        const shift = ((now.getTime() / 42) % (overflow + 45)) - 22;
        const clamped = Math.max(0, Math.min(overflow, shift));
        ctx.fillText(item.text, cx - clamped, cy);
      } else {
        ctx.fillText(
          truncateWithEllipsis(item.text, textAvailW, (s) => ctx.measureText(s).width),
          cx,
          cy,
        );
      }
      ctx.restore();
    }
  }

  // Right Column: Live Telemetry Sidebar (3 stacked cards)
  const cardGap = Math.max(4, Math.round(rect.h * 0.03));
  const cardPad = Math.max(6, Math.round(rightW * 0.04));
  const boxX = rightX + pad * 0.7;
  const boxW = Math.max(40, rightW - pad * 1.7);
  const availSideH = Math.max(40, rect.h - cardGap * 2);
  const cardH = Math.floor((availSideH - cardGap * 2) / 3);

  const marketItems = allItems.filter((i) => i.source === 'market' && !i.oneShot).slice(0, 3);
  const safetyItems = allItems
    .filter((i) => (i.source === 'earthquake' || i.source === 'transit') && !i.oneShot)
    .slice(0, 2);
  const sysItems = allItems
    .filter(
      (i) => (i.source === 'sysmon' || i.source === 'countdown' || i.source === 'calendar') && !i.oneShot,
    )
    .slice(0, 2);

  // Card 1: Market / Alerts / Safe Status
  const c1Y = rect.y + cardGap;
  drawSidebarCard(ctx, boxX, c1Y, boxW, cardH, pal, transparent);
  const card1Title = safetyItems.length > 0 && safetyItems.some((s) => s.priority === 'high')
    ? 'DISASTER / TRANSIT'
    : marketItems.length > 0
      ? 'MARKET & QUOTES'
      : 'SAFETY / TRANSIT';
  const card1Lines =
    safetyItems.length > 0 && safetyItems.some((s) => s.priority === 'high')
      ? safetyItems.map((i) => `[${i.badge}] ${i.text}`)
      : marketItems.length > 0
        ? marketItems.map((i) => `${i.badge}: ${i.text}`)
        : safetyItems.length > 0
          ? safetyItems.map((i) => `[${i.badge}] ${i.text}`)
          : ['防災・市況データ待機中'];
  drawCardLines(ctx, boxX + cardPad, c1Y, boxW - cardPad * 2, cardH, card1Title, card1Lines, pal);

  // Card 2: Weather / Sensors / System
  const c2Y = c1Y + cardH + cardGap;
  drawSidebarCard(ctx, boxX, c2Y, boxW, cardH, pal, transparent);
  const weatherLines = latestWeathers.slice(0, 2).map((w) => `${w.badge}: ${w.text}`);
  const sensorLines = sensors.slice(0, 2).map((s) => {
    const segs: string[] = [];
    if (typeof s.temperature === 'number') segs.push(`${s.temperature.toFixed(1)}℃`);
    if (typeof s.humidity === 'number') segs.push(`${Math.round(s.humidity)}%`);
    if (typeof s.co2 === 'number') segs.push(`CO2 ${Math.round(s.co2)}ppm`);
    return `${s.name}: ${segs.join(' / ')}`;
  });
  const sysLines = sysItems.map((i) => `[${i.badge}] ${i.text}`);
  const card2Lines = [...weatherLines, ...sensorLines, ...sysLines].slice(0, 3);
  drawCardLines(
    ctx,
    boxX + cardPad,
    c2Y,
    boxW - cardPad * 2,
    cardH,
    'ENV / WEATHER / SYS',
    card2Lines.length > 0 ? card2Lines : ['環境・天気情報待機中'],
    pal,
  );

  // Card 3: Now Playing or Top Spotlight (multi-line wrapped)
  const c3Y = c2Y + cardH + cardGap;
  const c3H = Math.max(cardH, rect.y + rect.h - cardGap - c3Y);
  drawSidebarCard(ctx, boxX, c3Y, boxW, c3H, pal, transparent);
  if (nowPlaying?.playing && nowPlaying.title) {
    const npLines = [
      `♪ ${nowPlaying.title}`,
      nowPlaying.artist ? `Artist: ${nowPlaying.artist}` : '',
      nowPlaying.sourceApp ? `Source: ${nowPlaying.sourceApp}` : '',
    ].filter(Boolean);
    drawCardLines(ctx, boxX + cardPad, c3Y, boxW - cardPad * 2, c3H, 'NOW PLAYING', npLines, pal, true);
  } else {
    const spotlight = sorted[0];
    const spotFont = Math.max(8, Math.min(13, Math.round(c3H * 0.19)));
    ctx.font = `500 ${spotFont}px ${pal.fontFamily}`;
    const wrapped = spotlight
      ? wrapTextLines(`[${spotlight.badge}] ${spotlight.text}`, boxW - cardPad * 2, (s) =>
          ctx.measureText(s).width,
        2)
      : ['最新トピック待機中'];
    drawCardLines(ctx, boxX + cardPad, c3Y, boxW - cardPad * 2, c3H, 'HEADLINE SPOTLIGHT', wrapped, pal);
  }

  ctx.restore();
}

export function drawFullScreenClockShowcase(params: {
  ctx: CanvasRenderingContext2D;
  rect: ScreenRect;
  display: DisplaySettings;
  latestWeathers: TickerItem[];
  nowPlaying: NowPlayingState | null;
  sensors: SensorReading[];
  spectrum: SpectrumSnapshot | null;
  now: Date;
  transparent: boolean;
}): void {
  const { ctx, rect, display, latestWeathers, nowPlaying, sensors, spectrum, now, transparent } = params;
  if (rect.w <= 0 || rect.h <= 0) return;

  const pal = getModePalette(display.visualMode, transparent);
  const pad = Math.max(10, Math.round(rect.w * 0.03));
  const timeStr = formatTime(now);
  const dateStr = formatDate(now);

  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  const timeSize = Math.max(24, Math.min(110, Math.round(rect.h * 0.28)));
  const dateSize = Math.max(10, Math.min(28, Math.round(rect.h * 0.075)));
  const infoSize = Math.max(9, Math.min(20, Math.round(rect.h * 0.056)));

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const centerX = rect.x + rect.w * 0.5;
  const clockY = rect.y + rect.h * 0.27;
  ctx.font = `700 ${timeSize}px ${FONT_MONO}`;
  ctx.fillStyle = pal.isShinkansen ? '#ff9614' : '#ffffff';
  ctx.fillText(timeStr, centerX, clockY);

  ctx.font = `600 ${dateSize}px ${pal.fontFamily}`;
  ctx.fillStyle = pal.accentText;
  ctx.fillText(dateStr, centerX, rect.y + rect.h * 0.46);

  // Weather + Sensors + NowPlaying strip
  const activeWeather =
    latestWeathers.length > 0
      ? latestWeathers[Math.floor(now.getTime() / 8000) % latestWeathers.length]
      : undefined;
  const weatherLine = activeWeather ? `${activeWeather.badge}  ${activeWeather.text}` : '';
  const sensorLine = sensors
    .slice(0, 3)
    .map((s) => {
      const segs: string[] = [];
      if (typeof s.temperature === 'number') segs.push(`${s.temperature.toFixed(1)}℃`);
      if (typeof s.humidity === 'number') segs.push(`${Math.round(s.humidity)}%`);
      if (typeof s.co2 === 'number') segs.push(`CO2:${Math.round(s.co2)}`);
      return `[${s.name}] ${segs.join(' ')}`;
    })
    .join('   ');
  const npLine =
    nowPlaying?.playing && nowPlaying.title
      ? `♪ ${nowPlaying.title}${nowPlaying.artist ? ` - ${nowPlaying.artist}` : ''}`
      : '';

  ctx.font = `500 ${infoSize}px ${pal.fontFamily}`;
  if (weatherLine) {
    ctx.fillStyle = pal.primaryText;
    ctx.fillText(
      truncateWithEllipsis(weatherLine, rect.w - pad * 2, (s) => ctx.measureText(s).width),
      centerX,
      rect.y + rect.h * 0.59,
    );
  }
  const subLine = [npLine, sensorLine].filter(Boolean).join('   |   ') || 'STANDBY';
  ctx.fillStyle = npLine ? (pal.isMono ? '#e5e5e5' : '#f472b6') : pal.secondaryText;
  ctx.fillText(
    truncateWithEllipsis(subLine, rect.w - pad * 2, (s) => ctx.measureText(s).width),
    centerX,
    rect.y + rect.h * 0.69,
  );
  ctx.textAlign = 'left';

  if (
    spectrum &&
    display.showSpectrumAnalyzer &&
    (spectrum.active || display.spectrumAudioInput !== 'auto')
  ) {
    const specW = Math.min(Math.round(rect.w * 0.62), 380);
    const specH = Math.max(18, Math.round(rect.h * 0.16));
    drawSpectrumBars(
      ctx,
      display,
      centerX - specW * 0.5,
      rect.y + rect.h - specH - Math.max(8, Math.round(rect.h * 0.04)),
      specW,
      specH,
      spectrum,
      false,
    );
  }

  ctx.restore();
}

export function drawTallBreakingAlert(params: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  display: DisplaySettings;
  item: TickerItem;
  elapsedSec: number;
}): void {
  const { ctx, width, height, display, item, elapsedSec } = params;
  const isShinkansen = display.visualMode === 'shinkansen-led';
  const isMono = display.visualMode === 'anobar8-vfd';
  const pulse = Math.floor(elapsedSec * 4) % 2 === 0;
  const fontFam = isShinkansen ? FONT_LED : FONT_SANS;

  const borderColor = isMono ? (pulse ? '#ffffff' : '#666666') : pulse ? '#ff2a22' : '#ff9614';
  const bgTint = isMono
    ? pulse
      ? 'rgba(255,255,255,0.08)'
      : 'rgba(0,0,0,1)'
    : pulse
      ? 'rgba(180,20,16,0.28)'
      : 'rgba(20,0,0,0.95)';

  ctx.fillStyle = bgTint;
  ctx.fillRect(0, 0, width, height);

  const barH = Math.max(4, Math.round(height * 0.055));
  ctx.fillStyle = borderColor;
  ctx.fillRect(0, 0, width, barH);
  ctx.fillRect(0, height - barH, width, barH);

  const contentTop = barH + Math.round(height * 0.08);
  const contentH = height - barH * 2 - Math.round(height * 0.16);
  const padX = Math.max(16, Math.round(width * 0.06));
  const maxTextW = Math.max(60, width - padX * 2);

  const iconSize = Math.max(18, Math.round(contentH * 0.18));
  const badgeSize = Math.max(14, Math.round(contentH * 0.12));
  const textSize = Math.max(14, Math.min(36, Math.round(contentH * 0.13)));

  // Header line: Pixel icon + [BADGE]
  const badgeStr = `[${item.badge}]`;
  ctx.font = `700 ${badgeSize}px ${fontFam}`;
  const badgeW = Math.ceil(ctx.measureText(badgeStr).width);
  const headerTotalW = iconSize + 10 + badgeW;
  const headerStartX = Math.max(padX, (width - headerTotalW) * 0.5);
  const headerCy = contentTop + iconSize * 0.5;

  drawPixelIcon(
    ctx,
    resolveItemIcon(item),
    headerStartX,
    headerCy,
    iconSize,
    display.visualMode,
    isShinkansen ? '#ff3b30' : item.color,
    true,
  );

  ctx.textBaseline = 'middle';
  ctx.fillStyle = isMono ? '#ffffff' : '#ff3b30';
  ctx.fillText(badgeStr, headerStartX + iconSize + 10, headerCy);

  // Wrapped multi-line alert body
  ctx.font = `700 ${textSize}px ${fontFam}`;
  const lines = wrapTextLines(item.text, maxTextW, (s) => ctx.measureText(s).width, 4);
  const lineH = Math.round(textSize * 1.38);
  const blockStartY =
    contentTop + iconSize + Math.max(14, (contentH - iconSize - lines.length * lineH) * 0.4);

  ctx.textAlign = 'center';
  ctx.fillStyle = isShinkansen ? '#ff9614' : '#ffffff';
  for (let i = 0; i < lines.length; i += 1) {
    ctx.fillText(lines[i]!, width * 0.5, blockStartY + i * lineH);
  }
  ctx.textAlign = 'left';
}

export function drawSpectrumBars(
  ctx: CanvasRenderingContext2D,
  display: DisplaySettings,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  spectrum: SpectrumSnapshot,
  drawLeftDivider: boolean,
): void {
  const isMono = display.visualMode === 'anobar8-vfd';
  const isShinkansen = display.visualMode === 'shinkansen-led';

  if (drawLeftDivider) {
    ctx.fillStyle = isShinkansen ? 'rgba(24,255,77,0.35)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(boxX, boxY + 1, 1, Math.max(1, boxH - 2));
  }

  const padX = 4;
  const padY = 3;
  const usableW = Math.max(8, boxW - padX * 2);
  const usableH = Math.max(8, boxH - padY * 2);
  const bands = spectrum.bands;
  const peaks = spectrum.peaks;
  const count = Math.max(1, bands.length);
  const colW = usableW / count;
  const barW = Math.max(1, Math.floor(colW - 1));
  const segments = Math.max(5, Math.min(12, Math.floor(usableH / 4)));
  const segStep = usableH / segments;
  const segH = Math.max(1, Math.floor(segStep - 1));
  const baseY = boxY + boxH - padY;

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

function drawSidebarCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  pal: ModePalette,
  transparent: boolean,
): void {
  ctx.fillStyle = pal.panelBg;
  ctx.fillRect(x, y, w, h);
  if (!transparent) {
    ctx.strokeStyle = pal.panelBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, w - 1), Math.max(1, h - 1));
  }
}

function drawCardLines(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  maxWidth: number,
  h: number,
  title: string,
  lines: string[],
  pal: ModePalette,
  highlightFirst = false,
): void {
  if (h < 22) return;
  const titleFont = Math.max(7, Math.min(11, Math.round(h * 0.17)));
  const bodyFont = Math.max(8, Math.min(13, Math.round(h * 0.2)));

  ctx.textBaseline = 'top';
  ctx.font = `700 ${titleFont}px ${FONT_MONO}`;
  ctx.fillStyle = pal.accentText;
  ctx.fillText(title, x, y + Math.max(3, Math.round(h * 0.08)));

  const bodyTop = y + Math.max(12, Math.round(h * 0.3));
  const availH = Math.max(10, y + h - bodyTop - 3);
  const maxLines = Math.max(1, Math.min(3, lines.length));
  const lineStep = availH / maxLines;

  ctx.font = `500 ${bodyFont}px ${pal.fontFamily}`;
  for (let i = 0; i < maxLines; i += 1) {
    const line = lines[i]!;
    ctx.fillStyle =
      i === 0 && highlightFirst
        ? pal.isMono
          ? '#ffffff'
          : '#f472b6'
        : i === 0
          ? pal.primaryText
          : pal.secondaryText;
    ctx.fillText(
      truncateWithEllipsis(line, maxWidth, (s) => ctx.measureText(s).width),
      x,
      bodyTop + i * lineStep,
    );
  }
}

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatShortTime(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDate(d: Date): string {
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const w = days[d.getDay()] ?? '';
  return `${y}/${m}/${day} (${w})`;
}
