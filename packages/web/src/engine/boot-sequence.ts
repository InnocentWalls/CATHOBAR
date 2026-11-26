import type {
  BootGlyphStyle,
  BootMessageMode,
  BootSequenceMode,
  DisplaySettings,
  VisualMode,
} from '@cathobar/shared';
import {
  buildBootMessage,
  drawGeometricGlyph,
  isGeometricAscii,
  resolveEffectiveBootMode,
  type EffectiveBootMode,
} from './boot-glyphs.js';

const FONT_FAMILY =
  '"Noto Sans JP", "BIZ UDGothic", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';
const LED_FONT_FAMILY =
  '"DotGothic16", "BIZ UDGothic", "Noto Sans JP", monospace';
const MONO_FONT_FAMILY = '"JetBrains Mono", "Consolas", monospace';
const FLAP_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789アイウエオカキクケコサシスセソタチツテトナニヌネノ';

export interface ActiveBootSequence {
  mode: Exclude<EffectiveBootMode, 'off'>;
  message: string;
  elapsedSec: number;
  durationSec: number;
  decodeScan: boolean;
  startedAt: number;
}

export function createBootSequence(params: {
  modeOverride?: BootSequenceMode;
  glyphStyleOverride?: BootGlyphStyle;
  display: DisplaySettings;
  lanUrls: string[];
  enabledSourceCount: number;
  now: Date;
}): ActiveBootSequence | null {
  const {
    modeOverride,
    glyphStyleOverride,
    display,
    lanUrls,
    enabledSourceCount,
    now,
  } = params;

  const requestedMode = modeOverride ?? display.bootSequenceMode;
  const requestedGlyph = glyphStyleOverride ?? display.bootGlyphStyle;
  const resolved = resolveEffectiveBootMode(
    requestedMode,
    display.visualMode,
    requestedGlyph,
  );
  if (resolved === 'off') {
    return null;
  }

  const message = buildBootMessage({
    messageMode: display.bootMessageMode as BootMessageMode,
    customMessage: display.bootCustomMessage,
    lanUrls,
    enabledSourceCount,
    visualMode: display.visualMode,
    now,
  });

  return {
    mode: resolved,
    message,
    elapsedSec: 0,
    durationSec: Math.max(4, Math.min(20, display.bootDurationSec)),
    decodeScan: display.bootDecodeScan,
    startedAt: now.getTime(),
  };
}

interface BootPalette {
  primary: string;
  secondary: string;
  accent: string;
  dim: string;
  scanLine: string;
  ledGreen: string;
  ledOrange: string;
  ledRed: string;
}

function getBootPalette(visualMode: VisualMode): BootPalette {
  if (visualMode === 'anobar8-vfd') {
    // RendererGL maps grayscale luminance into the selected VFD phosphor palette.
    return {
      primary: '#ffffff',
      secondary: '#cfcfcf',
      accent: '#ffffff',
      dim: 'rgba(255,255,255,0.16)',
      scanLine: '#ffffff',
      ledGreen: '#777777',
      ledOrange: '#bbbbbb',
      ledRed: '#ffffff',
    };
  }
  if (visualMode === 'shinkansen-led') {
    return {
      primary: '#ff9614',
      secondary: '#18ff4d',
      accent: '#ff2a22',
      dim: 'rgba(24,255,77,0.18)',
      scanLine: '#18ff4d',
      ledGreen: '#18ff4d',
      ledOrange: '#ff9614',
      ledRed: '#ff2a22',
    };
  }
  return {
    primary: '#38fad9',
    secondary: '#f8fafc',
    accent: '#facc15',
    dim: 'rgba(56,250,217,0.16)',
    scanLine: '#38fad9',
    ledGreen: '#18ff4d',
    ledOrange: '#ff9614',
    ledRed: '#ff2a22',
  };
}

export function drawBootSequence(params: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  display: DisplaySettings;
  boot: ActiveBootSequence;
  now: Date;
  transparent: boolean;
}): void {
  const { ctx, width, height, display, boot, now, transparent } = params;
  const palette = getBootPalette(display.visualMode);
  const progress = Math.max(0, Math.min(1, boot.elapsedSec / Math.max(0.1, boot.durationSec)));

  ctx.save();
  if (!transparent) {
    ctx.fillStyle = display.visualMode === 'clean' ? '#070b12' : '#000000';
    ctx.fillRect(0, 0, width, height);
  }

  if (boot.mode === 'led-test') {
    drawLedTestBoot(ctx, width, height, display, boot, progress, palette);
    ctx.restore();
    return;
  }

  if (boot.mode === 'flap-cascade') {
    drawFlapCascadeBoot(ctx, width, height, boot, progress, now);
    ctx.restore();
    return;
  }

  const glyphStyle: BootGlyphStyle =
    boot.mode === 'glyph-oscilloscope'
      ? 'oscilloscope'
      : boot.mode === 'glyph-hex'
        ? 'hex'
        : 'circuit';

  drawGlyphBoot(ctx, width, height, display, boot, glyphStyle, progress, palette);
  ctx.restore();
}

function drawGlyphBoot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  display: DisplaySettings,
  boot: ActiveBootSequence,
  style: BootGlyphStyle,
  progress: number,
  palette: BootPalette,
): void {
  const duration = Math.max(1, boot.durationSec);
  const warmupEnd = Math.min(0.95, duration * 0.14);
  const fadeStart = Math.max(warmupEnd + 0.5, duration - 0.65);

  const fadeAlpha =
    boot.elapsedSec >= fadeStart
      ? Math.max(0, 1 - (boot.elapsedSec - fadeStart) / Math.max(0.1, duration - fadeStart))
      : 1;

  // Heater filament background stripes
  const filamentIntensity = Math.min(1, boot.elapsedSec / Math.max(0.1, warmupEnd));
  const filamentRows = height <= 48 ? 2 : height <= 120 ? 3 : 5;
  ctx.save();
  ctx.globalAlpha = fadeAlpha * (0.08 + 0.1 * filamentIntensity);
  ctx.fillStyle = palette.secondary;
  for (let i = 1; i <= filamentRows; i += 1) {
    const fy = Math.round((height / (filamentRows + 1)) * i);
    ctx.fillRect(0, fy, width * filamentIntensity, 1);
  }
  ctx.restore();

  if (boot.elapsedSec < warmupEnd) {
    const wp = boot.elapsedSec / Math.max(0.05, warmupEnd);
    ctx.save();
    ctx.globalAlpha = Math.min(1, wp * 1.4);
    const barW = Math.max(40, width * 0.55);
    const barX = (width - barW) * 0.5;
    const barH = height <= 40 ? 2 : 4;
    const barY = height * 0.5 + (height >= 56 ? 8 : 0);

    ctx.fillStyle = palette.dim;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = palette.primary;
    ctx.fillRect(barX, barY, barW * wp, barH);

    if (height >= 56) {
      const labelSize = Math.max(8, Math.min(14, Math.round(height * 0.14)));
      ctx.font = `700 ${labelSize}px ${MONO_FONT_FAMILY}`;
      ctx.fillStyle = palette.secondary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CATHODE FILAMENT WARMUP...', width * 0.5, height * 0.5 - labelSize * 0.8);
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.globalAlpha = fadeAlpha;

  // Telemetry header/footer on standard & tall panels
  if (height >= 76) {
    const hudSize = Math.max(8, Math.min(12, Math.round(height * 0.11)));
    const padX = Math.max(8, Math.round(width * 0.02));
    ctx.font = `700 ${hudSize}px ${MONO_FONT_FAMILY}`;
    ctx.fillStyle = palette.secondary;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const styleLabel =
      style === 'oscilloscope'
        ? 'VECTOR-SCOPE'
        : style === 'hex'
          ? 'HEX-LATTICE'
          : 'CIRCUIT-16S';
    ctx.fillText(`CATHOBAR BOOT // ${styleLabel}`, padX, 4);

    ctx.textAlign = 'right';
    ctx.fillStyle = boot.decodeScan ? palette.accent : palette.dim;
    ctx.fillText(
      boot.decodeScan ? 'DECODE LENS: ACTIVE' : 'RAW CIPHER STREAM',
      width - padX,
      4,
    );

    // Bottom progress rail
    ctx.fillStyle = palette.dim;
    ctx.fillRect(padX, height - 5, width - padX * 2, 2);
    ctx.fillStyle = palette.primary;
    ctx.fillRect(padX, height - 5, (width - padX * 2) * progress, 2);
  }

  // Left -> Right marquee scroll of boot message
  const chars = Array.from(boot.message);
  const glyphH = Math.max(12, Math.min(58, Math.round(height * 0.48)));
  const glyphW = Math.max(8, Math.round(glyphH * 0.62));
  const cellAdvance = Math.max(10, Math.round(glyphH * 0.82));
  const totalTextW = Math.max(cellAdvance, chars.length * cellAdvance);

  const scrollSpanSec = Math.max(0.5, fadeStart - warmupEnd);
  const scrollT = Math.max(0, Math.min(1, (boot.elapsedSec - warmupEnd) / scrollSpanSec));
  const startX = -totalTextW;
  const endX = width + cellAdvance * 1.5;
  const baseX = startX + (endX - startX) * scrollT;
  const centerY = height * 0.5;
  const glyphTopY = centerY - glyphH * 0.5;

  const scanX = width * 0.52;
  const decodeZoneHalfW = Math.max(10, cellAdvance * 0.48);

  if (boot.decodeScan) {
    // Glowing vertical decode lens
    const beamW = Math.max(8, Math.round(glyphW * 0.9));
    const grad = ctx.createLinearGradient(scanX - beamW, 0, scanX + beamW, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, display.visualMode === 'anobar8-vfd' ? 'rgba(255,255,255,0.22)' : 'rgba(56,250,217,0.2)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(scanX - beamW, 0, beamW * 2, height);

    ctx.fillStyle = palette.scanLine;
    ctx.fillRect(Math.round(scanX), 0, Math.max(1, Math.round(width * 0.0025)), height);
  }

  const asciiFontSize = Math.max(11, Math.round(glyphH * 0.88));
  const fontFam = display.visualMode === 'shinkansen-led' ? LED_FONT_FAMILY : MONO_FONT_FAMILY;

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i]!;
    const cellX = baseX + i * cellAdvance;
    if (cellX + cellAdvance < -16 || cellX > width + 16) continue;

    const charCenterX = cellX + glyphW * 0.5;
    const isAscii = isGeometricAscii(ch);

    if (!boot.decodeScan || charCenterX < scanX - decodeZoneHalfW) {
      if (isAscii) {
        drawGeometricGlyph({
          ctx,
          char: ch,
          style,
          x: cellX,
          y: glyphTopY,
          w: glyphW,
          h: glyphH,
          color: palette.primary,
          dimColor: palette.dim,
          timeSec: boot.elapsedSec,
        });
      } else {
        // Non-ASCII custom character stylized inside cryptic bounding marks
        ctx.save();
        ctx.strokeStyle = palette.dim;
        ctx.lineWidth = 1;
        ctx.strokeRect(cellX, glyphTopY, glyphW, glyphH);
        ctx.font = `700 ${Math.max(10, Math.round(glyphH * 0.72))}px ${FONT_FAMILY}`;
        ctx.fillStyle = palette.primary;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ch, charCenterX, centerY, cellAdvance * 0.95);
        ctx.restore();
      }
    } else if (Math.abs(charCenterX - scanX) <= decodeZoneHalfW) {
      // Flash + micro glitch transition right across the scanline
      const jitterY = Math.sin(boot.elapsedSec * 55 + i * 3) * Math.max(1, glyphH * 0.06);
      ctx.save();
      ctx.fillStyle = palette.accent;
      ctx.font = `700 ${asciiFontSize}px ${isAscii ? fontFam : FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, charCenterX, centerY + jitterY, cellAdvance * 0.96);
      ctx.restore();
    } else {
      // Decoded crisp character to the right of the decode scanline
      ctx.save();
      ctx.fillStyle = palette.secondary;
      ctx.font = `700 ${asciiFontSize}px ${isAscii ? fontFam : FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, charCenterX, centerY, cellAdvance * 0.96);
      ctx.restore();
    }
  }

  ctx.restore();
}

function drawLedTestBoot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  display: DisplaySettings,
  boot: ActiveBootSequence,
  progress: number,
  palette: BootPalette,
): void {
  const fadeAlpha = progress > 0.91 ? Math.max(0, 1 - (progress - 0.91) / 0.09) : 1;
  ctx.save();
  ctx.globalAlpha = fadeAlpha;

  if (progress < 0.46) {
    // Phase 1: 3-color element sweep + checkerboard diagnostic
    if (progress < 0.14) {
      const t = progress / 0.14;
      ctx.fillStyle = palette.ledGreen;
      ctx.fillRect(0, 0, width * t, height);
    } else if (progress < 0.28) {
      const t = (progress - 0.14) / 0.14;
      ctx.fillStyle = palette.ledGreen;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = palette.ledOrange;
      ctx.fillRect(0, 0, width * t, height);
    } else if (progress < 0.4) {
      const t = (progress - 0.28) / 0.12;
      ctx.fillStyle = palette.ledOrange;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = palette.ledRed;
      ctx.fillRect(0, 0, width * t, height);
    } else {
      const step = Math.max(4, Math.round(height / 8));
      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const even = ((Math.floor(x / step) + Math.floor(y / step)) & 1) === 0;
          ctx.fillStyle = even ? palette.ledGreen : palette.ledOrange;
          ctx.fillRect(x, y, step - 1, step - 1);
        }
      }
    }

    if (height >= 40) {
      const boxW = Math.min(width * 0.72, Math.max(120, width * 0.42));
      const boxH = Math.max(16, Math.min(34, height * 0.42));
      const bx = (width - boxW) * 0.5;
      const by = (height - boxH) * 0.5;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(bx, by, boxW, boxH);
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.max(9, Math.round(boxH * 0.55))}px ${MONO_FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('LED MATRIX SELF-TEST', width * 0.5, height * 0.5);
    }

    ctx.restore();
    return;
  }

  // Phase 2: Railway [試運転] diagnostic banner
  const isMono = display.visualMode === 'anobar8-vfd';
  const mainY = height >= 72 ? height * 0.44 : height * 0.52;
  const badgeH = Math.max(14, Math.min(38, Math.round(height * 0.42)));
  const badgeFontSize = Math.max(10, Math.round(badgeH * 0.58));
  const msgFontSize = Math.max(11, Math.round(badgeH * 0.64));

  ctx.font = `700 ${badgeFontSize}px ${LED_FONT_FAMILY}`;
  const badgeLabel = '試運転';
  const badgeW = Math.ceil(ctx.measureText(badgeLabel).width + 14);
  const badgeX = Math.max(6, Math.round(width * 0.03));
  const badgeY = Math.round(mainY - badgeH * 0.5);

  ctx.fillStyle = isMono ? '#ffffff' : palette.ledGreen;
  ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeLabel, badgeX + badgeW * 0.5, mainY);

  // Scroll boot message inside the remaining area on the right
  const textAreaX = badgeX + badgeW + 8;
  const textAreaW = Math.max(20, width - textAreaX - 6);
  ctx.save();
  ctx.beginPath();
  ctx.rect(textAreaX, 0, textAreaW, height);
  ctx.clip();

  ctx.font = `700 ${msgFontSize}px ${LED_FONT_FAMILY}`;
  const msgW = Math.ceil(ctx.measureText(boot.message).width);
  const phaseT = Math.max(0, Math.min(1, (progress - 0.46) / 0.45));
  let textX = textAreaX;
  if (msgW > textAreaW) {
    textX = textAreaX + textAreaW - (textAreaW + msgW) * phaseT;
  } else {
    textX = textAreaX + Math.max(0, (textAreaW - msgW) * 0.5);
  }
  ctx.fillStyle = isMono ? '#e5e5e5' : palette.ledOrange;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(boot.message, textX, mainY);
  ctx.restore();

  if (height >= 72) {
    const subSize = Math.max(8, Math.min(12, Math.round(height * 0.12)));
    ctx.font = `700 ${subSize}px ${MONO_FONT_FAMILY}`;
    ctx.fillStyle = isMono ? '#cfcfcf' : palette.ledGreen;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('LED MATRIX SELF-CHECK OK // SYSTEM READY', badgeX, height - 5);
  }

  ctx.restore();
}

function drawFlapCascadeBoot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  boot: ActiveBootSequence,
  progress: number,
  now: Date,
): void {
  const fadeAlpha = progress > 0.9 ? Math.max(0, 1 - (progress - 0.9) / 0.1) : 1;
  ctx.save();
  ctx.globalAlpha = fadeAlpha;

  const rowCount = height < 64 ? 1 : height < 180 ? 2 : 3;
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  const rowTexts =
    rowCount === 1
      ? [boot.message]
      : rowCount === 2
        ? ['CATHOBAR SYSTEM BOOT', boot.message]
        : ['CATHOBAR SYSTEM BOOT', boot.message, `ONLINE READY ${hh}:${mm}:${ss}`];

  const rowH = height / rowCount;
  const cellH = Math.max(12, Math.floor(rowH * 0.74));
  const cellW = Math.max(11, Math.round(cellH * 0.88));
  const gapX = Math.max(1, Math.round(cellW * 0.12));
  const padX = Math.max(4, Math.round(width * 0.015));
  const usableW = Math.max(16, width - padX * 2);
  const maxCols = Math.max(1, Math.floor(usableW / (cellW + gapX)));
  const fontSize = Math.max(8, Math.round(cellH * 0.62));

  for (let r = 0; r < rowCount; r += 1) {
    const topY = r * rowH;
    const cy = topY + rowH * 0.5;
    const cellTop = Math.round(cy - cellH * 0.5);
    const rawStr = rowTexts[r] ?? '';
    const chars = Array.from(rawStr);

    // Subtle pan on overflowing rows after lock-in
    const overflow = Math.max(0, chars.length - maxCols);
    const panOffset =
      overflow > 0 && progress > 0.52
        ? Math.min(overflow, Math.floor(((progress - 0.52) / 0.36) * (overflow + 1)))
        : 0;

    ctx.fillStyle = '#0e1116';
    ctx.fillRect(0, topY + 1, width, rowH - 2);

    ctx.font = `700 ${fontSize}px ${MONO_FONT_FAMILY}, ${FONT_FAMILY}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    for (let c = 0; c < maxCols; c += 1) {
      const cx = padX + c * (cellW + gapX);
      const targetChar = chars[c + panOffset] ?? ' ';
      const colFrac = c / Math.max(1, maxCols);
      const lockAt = 0.25 + colFrac * 0.35 + r * 0.04;
      const localP = Math.max(0, Math.min(1, progress / Math.max(0.05, lockAt)));
      const isFlipping = localP < 1;

      const shownChar = isFlipping
        ? FLAP_CHARSET[Math.floor(progress * 42 + c * 3 + r * 7) % FLAP_CHARSET.length]!
        : targetChar;

      ctx.fillStyle = '#171b22';
      ctx.fillRect(cx, cellTop, cellW, cellH);
      ctx.fillStyle = '#262d38';
      ctx.fillRect(cx, cellTop, cellW, 1);

      if (shownChar !== ' ') {
        ctx.save();
        if (isFlipping) {
          const scaleY = Math.max(0.22, Math.abs(Math.cos(progress * Math.PI * 16 + c)));
          ctx.translate(cx + cellW * 0.5, cy);
          ctx.scale(1, scaleY);
          ctx.fillStyle = '#fef08a';
          ctx.fillText(shownChar, 0, 0, Math.max(4, cellW - 2));
        } else {
          ctx.fillStyle = r === 0 && rowCount > 1 ? '#38fad9' : '#f8fafc';
          ctx.fillText(shownChar, cx + cellW * 0.5, cy, Math.max(4, cellW - 2));
        }
        ctx.restore();
      }

      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(cx, Math.floor(cy), cellW, 1);
    }
  }

  ctx.restore();
}
