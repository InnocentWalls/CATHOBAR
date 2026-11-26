import type {
  BootGlyphStyle,
  BootMessageMode,
  BootSequenceMode,
  VisualMode,
} from '@cathobar/shared';

export type EffectiveBootMode =
  | 'glyph-circuit'
  | 'glyph-oscilloscope'
  | 'glyph-hex'
  | 'led-test'
  | 'flap-cascade'
  | 'off';

export type Pt = [number, number];

export interface GlyphStroke {
  points: Pt[];
}

export interface GlyphDefinition {
  strokes: GlyphStroke[];
  dots?: Pt[];
}

export function resolveEffectiveBootMode(
  bootSequenceMode: BootSequenceMode,
  visualMode: VisualMode,
  bootGlyphStyle: BootGlyphStyle,
): EffectiveBootMode {
  if (bootSequenceMode !== 'auto') {
    return bootSequenceMode;
  }
  switch (visualMode) {
    case 'shinkansen-led':
    case 'station-board':
      return 'led-test';
    case 'split-flap':
      return 'flap-cascade';
    case 'anobar8-vfd':
    case 'anobar-fed':
    case 'clean':
    default:
      if (bootGlyphStyle === 'oscilloscope') return 'glyph-oscilloscope';
      if (bootGlyphStyle === 'hex') return 'glyph-hex';
      return 'glyph-circuit';
  }
}

export function buildBootMessage(params: {
  messageMode: BootMessageMode;
  customMessage: string;
  lanUrls: string[];
  enabledSourceCount: number;
  visualMode: VisualMode;
  now: Date;
}): string {
  const trimmedCustom = params.customMessage.trim();
  if (params.messageMode === 'custom' && trimmedCustom.length > 0) {
    return trimmedCustom;
  }

  let hostLabel = 'LOCAL';
  const firstUrl = params.lanUrls[0];
  if (firstUrl) {
    try {
      const parsed = new URL(firstUrl);
      hostLabel = parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
    } catch {
      hostLabel = firstUrl.replace(/^https?:\/\//, '').slice(0, 28);
    }
  }

  const hh = String(params.now.getHours()).padStart(2, '0');
  const mm = String(params.now.getMinutes()).padStart(2, '0');
  const ss = String(params.now.getSeconds()).padStart(2, '0');
  const modeTag = params.visualMode.toUpperCase();

  return `CATHOBAR // CATHODE EMISSION ONLINE // ${hostLabel} // ${params.enabledSourceCount} SRC READY // ${modeTag} // ${hh}:${mm}:${ss}`;
}

export function isGeometricAscii(char: string): boolean {
  if (char === ' ') return true;
  const upper = char.toUpperCase();
  return Boolean(CIRCUIT_GLYPHS[upper] || OSCILLOSCOPE_GLYPHS[upper] || HEX_GLYPHS[upper]);
}

function s(...points: Pt[]): GlyphStroke {
  return { points };
}

// ============================================================================
// Style 1: Circuit / 16-segment PCB trace alphabet (orthogonal + 45deg + pads)
// ============================================================================
const CIRCUIT_GLYPHS: Record<string, GlyphDefinition> = {
  ' ': { strokes: [] },
  A: {
    strokes: [
      s([0.16, 0.9], [0.16, 0.3], [0.36, 0.1], [0.64, 0.1], [0.84, 0.3], [0.84, 0.9]),
      s([0.16, 0.54], [0.84, 0.54]),
    ],
    dots: [
      [0.16, 0.9],
      [0.84, 0.9],
      [0.5, 0.1],
    ],
  },
  B: {
    strokes: [
      s([0.18, 0.9], [0.18, 0.1], [0.68, 0.1], [0.82, 0.24], [0.82, 0.38], [0.68, 0.5], [0.18, 0.5]),
      s([0.68, 0.5], [0.84, 0.62], [0.84, 0.78], [0.68, 0.9], [0.18, 0.9]),
    ],
    dots: [
      [0.18, 0.1],
      [0.18, 0.9],
      [0.68, 0.5],
    ],
  },
  C: {
    strokes: [
      s([0.84, 0.24], [0.7, 0.1], [0.34, 0.1], [0.18, 0.26], [0.18, 0.74], [0.34, 0.9], [0.7, 0.9], [0.84, 0.76]),
    ],
    dots: [
      [0.84, 0.24],
      [0.84, 0.76],
    ],
  },
  D: {
    strokes: [
      s([0.18, 0.1], [0.18, 0.9], [0.62, 0.9], [0.84, 0.68], [0.84, 0.32], [0.62, 0.1], [0.18, 0.1]),
      s([0.38, 0.3], [0.38, 0.7]),
    ],
    dots: [
      [0.38, 0.3],
      [0.38, 0.7],
    ],
  },
  E: {
    strokes: [
      s([0.82, 0.1], [0.2, 0.1], [0.2, 0.9], [0.82, 0.9]),
      s([0.2, 0.5], [0.68, 0.5]),
    ],
    dots: [
      [0.82, 0.1],
      [0.68, 0.5],
      [0.82, 0.9],
    ],
  },
  F: {
    strokes: [
      s([0.82, 0.1], [0.2, 0.1], [0.2, 0.9]),
      s([0.2, 0.5], [0.68, 0.5]),
    ],
    dots: [
      [0.82, 0.1],
      [0.68, 0.5],
      [0.2, 0.9],
    ],
  },
  G: {
    strokes: [
      s([0.82, 0.22], [0.68, 0.1], [0.32, 0.1], [0.18, 0.26], [0.18, 0.74], [0.32, 0.9], [0.72, 0.9], [0.84, 0.76], [0.84, 0.52], [0.54, 0.52]),
    ],
    dots: [
      [0.82, 0.22],
      [0.54, 0.52],
    ],
  },
  H: {
    strokes: [
      s([0.18, 0.1], [0.18, 0.9]),
      s([0.82, 0.1], [0.82, 0.9]),
      s([0.18, 0.5], [0.82, 0.5]),
    ],
    dots: [
      [0.18, 0.1],
      [0.82, 0.1],
      [0.18, 0.9],
      [0.82, 0.9],
    ],
  },
  I: {
    strokes: [
      s([0.28, 0.1], [0.72, 0.1]),
      s([0.5, 0.1], [0.5, 0.9]),
      s([0.28, 0.9], [0.72, 0.9]),
    ],
    dots: [
      [0.28, 0.1],
      [0.72, 0.1],
      [0.28, 0.9],
      [0.72, 0.9],
    ],
  },
  J: {
    strokes: [
      s([0.3, 0.1], [0.8, 0.1], [0.8, 0.72], [0.62, 0.9], [0.34, 0.9], [0.18, 0.74], [0.18, 0.6]),
    ],
    dots: [
      [0.3, 0.1],
      [0.18, 0.6],
    ],
  },
  K: {
    strokes: [
      s([0.2, 0.1], [0.2, 0.9]),
      s([0.82, 0.1], [0.46, 0.46], [0.2, 0.46]),
      s([0.46, 0.46], [0.84, 0.9]),
    ],
    dots: [
      [0.2, 0.1],
      [0.82, 0.1],
      [0.2, 0.9],
      [0.84, 0.9],
    ],
  },
  L: {
    strokes: [s([0.2, 0.1], [0.2, 0.9], [0.84, 0.9])],
    dots: [
      [0.2, 0.1],
      [0.84, 0.9],
    ],
  },
  M: {
    strokes: [
      s([0.14, 0.9], [0.14, 0.1], [0.34, 0.1], [0.5, 0.46], [0.66, 0.1], [0.86, 0.1], [0.86, 0.9]),
    ],
    dots: [
      [0.14, 0.9],
      [0.5, 0.46],
      [0.86, 0.9],
    ],
  },
  N: {
    strokes: [
      s([0.18, 0.9], [0.18, 0.1], [0.32, 0.1], [0.68, 0.9], [0.82, 0.9], [0.82, 0.1]),
    ],
    dots: [
      [0.18, 0.9],
      [0.82, 0.1],
    ],
  },
  O: {
    strokes: [
      s([0.34, 0.1], [0.66, 0.1], [0.84, 0.28], [0.84, 0.72], [0.66, 0.9], [0.34, 0.9], [0.16, 0.72], [0.16, 0.28], [0.34, 0.1]),
    ],
    dots: [
      [0.5, 0.1],
      [0.5, 0.9],
    ],
  },
  P: {
    strokes: [
      s([0.2, 0.9], [0.2, 0.1], [0.7, 0.1], [0.84, 0.24], [0.84, 0.4], [0.7, 0.54], [0.2, 0.54]),
    ],
    dots: [
      [0.2, 0.9],
      [0.7, 0.54],
    ],
  },
  Q: {
    strokes: [
      s([0.34, 0.1], [0.66, 0.1], [0.84, 0.28], [0.84, 0.72], [0.66, 0.9], [0.34, 0.9], [0.16, 0.72], [0.16, 0.28], [0.34, 0.1]),
      s([0.56, 0.64], [0.86, 0.94]),
    ],
    dots: [[0.86, 0.94]],
  },
  R: {
    strokes: [
      s([0.2, 0.9], [0.2, 0.1], [0.7, 0.1], [0.84, 0.24], [0.84, 0.4], [0.7, 0.52], [0.2, 0.52]),
      s([0.52, 0.52], [0.84, 0.9]),
    ],
    dots: [
      [0.2, 0.9],
      [0.84, 0.9],
    ],
  },
  S: {
    strokes: [
      s([0.82, 0.22], [0.7, 0.1], [0.32, 0.1], [0.18, 0.24], [0.18, 0.38], [0.32, 0.5], [0.68, 0.5], [0.82, 0.62], [0.82, 0.76], [0.68, 0.9], [0.3, 0.9], [0.18, 0.78]),
    ],
    dots: [
      [0.82, 0.22],
      [0.18, 0.78],
    ],
  },
  T: {
    strokes: [
      s([0.14, 0.1], [0.86, 0.1]),
      s([0.5, 0.1], [0.5, 0.9]),
    ],
    dots: [
      [0.14, 0.1],
      [0.86, 0.1],
      [0.5, 0.9],
    ],
  },
  U: {
    strokes: [
      s([0.18, 0.1], [0.18, 0.74], [0.34, 0.9], [0.66, 0.9], [0.82, 0.74], [0.82, 0.1]),
    ],
    dots: [
      [0.18, 0.1],
      [0.82, 0.1],
    ],
  },
  V: {
    strokes: [s([0.16, 0.1], [0.16, 0.42], [0.5, 0.9], [0.84, 0.42], [0.84, 0.1])],
    dots: [
      [0.16, 0.1],
      [0.84, 0.1],
      [0.5, 0.9],
    ],
  },
  W: {
    strokes: [
      s([0.12, 0.1], [0.24, 0.9], [0.38, 0.9], [0.5, 0.52], [0.62, 0.9], [0.76, 0.9], [0.88, 0.1]),
    ],
    dots: [
      [0.12, 0.1],
      [0.5, 0.52],
      [0.88, 0.1],
    ],
  },
  X: {
    strokes: [
      s([0.18, 0.1], [0.82, 0.9]),
      s([0.82, 0.1], [0.18, 0.9]),
    ],
    dots: [
      [0.18, 0.1],
      [0.82, 0.1],
      [0.18, 0.9],
      [0.82, 0.9],
      [0.5, 0.5],
    ],
  },
  Y: {
    strokes: [
      s([0.16, 0.1], [0.5, 0.5], [0.84, 0.1]),
      s([0.5, 0.5], [0.5, 0.9]),
    ],
    dots: [
      [0.16, 0.1],
      [0.84, 0.1],
      [0.5, 0.9],
    ],
  },
  Z: {
    strokes: [s([0.18, 0.1], [0.82, 0.1], [0.82, 0.24], [0.18, 0.76], [0.18, 0.9], [0.82, 0.9])],
    dots: [
      [0.18, 0.1],
      [0.82, 0.9],
    ],
  },
  '0': {
    strokes: [
      s([0.34, 0.1], [0.66, 0.1], [0.82, 0.26], [0.82, 0.74], [0.66, 0.9], [0.34, 0.9], [0.18, 0.74], [0.18, 0.26], [0.34, 0.1]),
      s([0.24, 0.76], [0.76, 0.24]),
    ],
    dots: [[0.5, 0.5]],
  },
  '1': {
    strokes: [
      s([0.3, 0.28], [0.52, 0.1], [0.52, 0.9]),
      s([0.26, 0.9], [0.78, 0.9]),
    ],
    dots: [
      [0.3, 0.28],
      [0.26, 0.9],
      [0.78, 0.9],
    ],
  },
  '2': {
    strokes: [
      s([0.2, 0.26], [0.34, 0.1], [0.68, 0.1], [0.82, 0.24], [0.82, 0.42], [0.2, 0.84], [0.2, 0.9], [0.84, 0.9]),
    ],
    dots: [
      [0.2, 0.26],
      [0.84, 0.9],
    ],
  },
  '3': {
    strokes: [
      s([0.2, 0.2], [0.32, 0.1], [0.7, 0.1], [0.82, 0.24], [0.82, 0.38], [0.68, 0.5], [0.42, 0.5]),
      s([0.68, 0.5], [0.82, 0.62], [0.82, 0.78], [0.7, 0.9], [0.32, 0.9], [0.2, 0.8]),
    ],
    dots: [
      [0.42, 0.5],
      [0.2, 0.2],
      [0.2, 0.8],
    ],
  },
  '4': {
    strokes: [
      s([0.7, 0.9], [0.7, 0.1], [0.56, 0.1], [0.16, 0.58], [0.86, 0.58]),
    ],
    dots: [
      [0.7, 0.9],
      [0.86, 0.58],
    ],
  },
  '5': {
    strokes: [
      s([0.82, 0.1], [0.22, 0.1], [0.22, 0.46], [0.68, 0.46], [0.82, 0.6], [0.82, 0.76], [0.68, 0.9], [0.32, 0.9], [0.18, 0.78]),
    ],
    dots: [
      [0.82, 0.1],
      [0.18, 0.78],
    ],
  },
  '6': {
    strokes: [
      s([0.74, 0.1], [0.36, 0.1], [0.18, 0.28], [0.18, 0.76], [0.32, 0.9], [0.68, 0.9], [0.82, 0.76], [0.82, 0.6], [0.68, 0.48], [0.18, 0.48]),
    ],
    dots: [[0.74, 0.1]],
  },
  '7': {
    strokes: [s([0.18, 0.1], [0.82, 0.1], [0.82, 0.26], [0.44, 0.9])],
    dots: [
      [0.18, 0.1],
      [0.44, 0.9],
    ],
  },
  '8': {
    strokes: [
      s([0.32, 0.1], [0.68, 0.1], [0.82, 0.22], [0.82, 0.38], [0.68, 0.5], [0.32, 0.5], [0.18, 0.38], [0.18, 0.22], [0.32, 0.1]),
      s([0.32, 0.5], [0.18, 0.62], [0.18, 0.78], [0.32, 0.9], [0.68, 0.9], [0.82, 0.78], [0.82, 0.62], [0.68, 0.5]),
    ],
    dots: [
      [0.32, 0.5],
      [0.68, 0.5],
    ],
  },
  '9': {
    strokes: [
      s([0.82, 0.5], [0.32, 0.5], [0.18, 0.38], [0.18, 0.22], [0.32, 0.1], [0.68, 0.1], [0.82, 0.22], [0.82, 0.74], [0.66, 0.9], [0.28, 0.9]),
    ],
    dots: [[0.28, 0.9]],
  },
  '.': { strokes: [s([0.46, 0.84], [0.54, 0.84])], dots: [[0.5, 0.84]] },
  ',': { strokes: [s([0.54, 0.78], [0.44, 0.94])], dots: [[0.54, 0.78]] },
  ':': { strokes: [], dots: [[0.5, 0.34], [0.5, 0.74]] },
  '/': { strokes: [s([0.24, 0.9], [0.76, 0.1])], dots: [[0.24, 0.9], [0.76, 0.1]] },
  '-': { strokes: [s([0.22, 0.5], [0.78, 0.5])], dots: [[0.22, 0.5], [0.78, 0.5]] },
  '_': { strokes: [s([0.16, 0.9], [0.84, 0.9])], dots: [[0.16, 0.9], [0.84, 0.9]] },
  '!': { strokes: [s([0.5, 0.1], [0.5, 0.64])], dots: [[0.5, 0.86]] },
  '?': {
    strokes: [s([0.24, 0.26], [0.36, 0.1], [0.66, 0.1], [0.78, 0.24], [0.78, 0.38], [0.5, 0.54], [0.5, 0.66])],
    dots: [[0.5, 0.86]],
  },
  '+': {
    strokes: [s([0.5, 0.24], [0.5, 0.76]), s([0.22, 0.5], [0.78, 0.5])],
    dots: [[0.5, 0.5]],
  },
  '=': {
    strokes: [s([0.22, 0.38], [0.78, 0.38]), s([0.22, 0.62], [0.78, 0.62])],
    dots: [[0.22, 0.38], [0.78, 0.62]],
  },
  '[': { strokes: [s([0.68, 0.1], [0.34, 0.1], [0.34, 0.9], [0.68, 0.9])], dots: [[0.68, 0.1], [0.68, 0.9]] },
  ']': { strokes: [s([0.32, 0.1], [0.66, 0.1], [0.66, 0.9], [0.32, 0.9])], dots: [[0.32, 0.1], [0.32, 0.9]] },
  '|': { strokes: [s([0.5, 0.08], [0.5, 0.92])], dots: [[0.5, 0.08], [0.5, 0.92]] },
  '*': {
    strokes: [s([0.5, 0.22], [0.5, 0.78]), s([0.24, 0.34], [0.76, 0.66]), s([0.76, 0.34], [0.24, 0.66])],
    dots: [[0.5, 0.5]],
  },
  '@': {
    strokes: [
      s([0.76, 0.76], [0.64, 0.9], [0.3, 0.9], [0.16, 0.74], [0.16, 0.26], [0.32, 0.1], [0.7, 0.1], [0.84, 0.26], [0.84, 0.64], [0.64, 0.64], [0.42, 0.64], [0.36, 0.42], [0.64, 0.42], [0.64, 0.64]),
    ],
    dots: [[0.76, 0.76]],
  },
  '#': {
    strokes: [
      s([0.36, 0.14], [0.32, 0.86]),
      s([0.68, 0.14], [0.64, 0.86]),
      s([0.16, 0.36], [0.84, 0.36]),
      s([0.16, 0.64], [0.84, 0.64]),
    ],
  },
};

// ============================================================================
// Style 2: Oscilloscope / Cathode-Ray single-stroke vector alphabet
// ============================================================================
const OSCILLOSCOPE_GLYPHS: Record<string, GlyphDefinition> = {
  ' ': { strokes: [] },
  A: { strokes: [s([0.14, 0.9], [0.5, 0.08], [0.86, 0.9], [0.72, 0.58], [0.26, 0.58])] },
  B: { strokes: [s([0.18, 0.9], [0.18, 0.1], [0.74, 0.2], [0.42, 0.48], [0.82, 0.68], [0.18, 0.9])] },
  C: { strokes: [s([0.84, 0.2], [0.46, 0.08], [0.16, 0.5], [0.46, 0.92], [0.84, 0.8])] },
  D: { strokes: [s([0.18, 0.9], [0.18, 0.1], [0.76, 0.34], [0.76, 0.66], [0.18, 0.9])] },
  E: { strokes: [s([0.82, 0.1], [0.2, 0.1], [0.2, 0.5], [0.68, 0.5], [0.2, 0.5], [0.2, 0.9], [0.82, 0.9])] },
  F: { strokes: [s([0.82, 0.1], [0.2, 0.1], [0.2, 0.9], [0.2, 0.5], [0.68, 0.5])] },
  G: { strokes: [s([0.8, 0.22], [0.46, 0.08], [0.16, 0.5], [0.46, 0.92], [0.84, 0.78], [0.84, 0.52], [0.48, 0.52])] },
  H: { strokes: [s([0.18, 0.1], [0.18, 0.9], [0.18, 0.5], [0.82, 0.5], [0.82, 0.1], [0.82, 0.9])] },
  I: { strokes: [s([0.28, 0.1], [0.72, 0.1], [0.5, 0.1], [0.5, 0.9], [0.28, 0.9], [0.72, 0.9])] },
  J: { strokes: [s([0.26, 0.1], [0.8, 0.1], [0.8, 0.74], [0.48, 0.92], [0.18, 0.68])] },
  K: { strokes: [s([0.18, 0.1], [0.18, 0.9], [0.18, 0.52], [0.82, 0.1], [0.36, 0.5], [0.84, 0.9])] },
  L: { strokes: [s([0.2, 0.1], [0.2, 0.9], [0.84, 0.9])] },
  M: { strokes: [s([0.14, 0.9], [0.22, 0.1], [0.5, 0.62], [0.78, 0.1], [0.86, 0.9])] },
  N: { strokes: [s([0.18, 0.9], [0.18, 0.1], [0.82, 0.9], [0.82, 0.1])] },
  O: { strokes: [s([0.5, 0.08], [0.84, 0.34], [0.84, 0.66], [0.5, 0.92], [0.16, 0.66], [0.16, 0.34], [0.5, 0.08])] },
  P: { strokes: [s([0.2, 0.9], [0.2, 0.1], [0.8, 0.24], [0.76, 0.48], [0.2, 0.54])] },
  Q: { strokes: [s([0.5, 0.08], [0.84, 0.34], [0.84, 0.66], [0.5, 0.92], [0.16, 0.66], [0.16, 0.34], [0.5, 0.08]), s([0.54, 0.62], [0.88, 0.94])] },
  R: { strokes: [s([0.2, 0.9], [0.2, 0.1], [0.8, 0.24], [0.74, 0.46], [0.2, 0.52], [0.84, 0.9])] },
  S: { strokes: [s([0.82, 0.2], [0.48, 0.08], [0.2, 0.28], [0.8, 0.7], [0.5, 0.92], [0.18, 0.78])] },
  T: { strokes: [s([0.12, 0.12], [0.88, 0.12], [0.5, 0.12], [0.5, 0.92])] },
  U: { strokes: [s([0.18, 0.1], [0.2, 0.76], [0.5, 0.92], [0.8, 0.76], [0.82, 0.1])] },
  V: { strokes: [s([0.14, 0.1], [0.5, 0.9], [0.86, 0.1])] },
  W: { strokes: [s([0.1, 0.1], [0.3, 0.9], [0.5, 0.38], [0.7, 0.9], [0.9, 0.1])] },
  X: { strokes: [s([0.16, 0.1], [0.84, 0.9]), s([0.84, 0.1], [0.16, 0.9])] },
  Y: { strokes: [s([0.16, 0.1], [0.5, 0.52], [0.84, 0.1], [0.5, 0.52], [0.5, 0.9])] },
  Z: { strokes: [s([0.16, 0.12], [0.84, 0.12], [0.16, 0.88], [0.84, 0.88])] },
  '0': { strokes: [s([0.5, 0.08], [0.84, 0.32], [0.84, 0.68], [0.5, 0.92], [0.16, 0.68], [0.16, 0.32], [0.5, 0.08]), s([0.22, 0.76], [0.78, 0.24])] },
  '1': { strokes: [s([0.28, 0.3], [0.54, 0.1], [0.54, 0.9], [0.24, 0.9], [0.8, 0.9])] },
  '2': { strokes: [s([0.2, 0.28], [0.52, 0.1], [0.82, 0.28], [0.18, 0.88], [0.84, 0.88])] },
  '3': { strokes: [s([0.2, 0.18], [0.58, 0.1], [0.82, 0.3], [0.42, 0.5], [0.82, 0.7], [0.58, 0.9], [0.2, 0.8])] },
  '4': { strokes: [s([0.72, 0.9], [0.72, 0.1], [0.14, 0.58], [0.88, 0.58])] },
  '5': { strokes: [s([0.82, 0.1], [0.24, 0.1], [0.22, 0.48], [0.68, 0.44], [0.84, 0.68], [0.52, 0.92], [0.18, 0.78])] },
  '6': { strokes: [s([0.72, 0.1], [0.28, 0.26], [0.18, 0.68], [0.5, 0.92], [0.82, 0.7], [0.56, 0.48], [0.18, 0.58])] },
  '7': { strokes: [s([0.16, 0.12], [0.84, 0.12], [0.4, 0.9])] },
  '8': { strokes: [s([0.5, 0.5], [0.22, 0.26], [0.5, 0.08], [0.78, 0.26], [0.22, 0.72], [0.5, 0.92], [0.78, 0.72], [0.5, 0.5])] },
  '9': { strokes: [s([0.82, 0.42], [0.46, 0.52], [0.18, 0.32], [0.5, 0.08], [0.82, 0.3], [0.68, 0.82], [0.28, 0.92])] },
};

// ============================================================================
// Style 3: Hex / Honeycomb double-hexagon lattice alphabet
// Lattice vertices strictly in [0, 1] x [0, 1]
// ============================================================================
const HX = {
  T: [0.5, 0.04] as Pt,
  UL: [0.12, 0.22] as Pt,
  UR: [0.88, 0.22] as Pt,
  UC: [0.5, 0.34] as Pt,
  ML: [0.12, 0.5] as Pt,
  MC: [0.5, 0.5] as Pt,
  MR: [0.88, 0.5] as Pt,
  LC: [0.5, 0.66] as Pt,
  LL: [0.12, 0.78] as Pt,
  LR: [0.88, 0.78] as Pt,
  B: [0.5, 0.96] as Pt,
};

const HEX_GLYPHS: Record<string, GlyphDefinition> = {
  ' ': { strokes: [] },
  A: { strokes: [s(HX.LL, HX.ML, HX.UL, HX.T, HX.UR, HX.MR, HX.LR), s(HX.ML, HX.MC, HX.MR)] },
  B: { strokes: [s(HX.LL, HX.ML, HX.UL, HX.T, HX.UR, HX.MC, HX.LR, HX.B, HX.LL), s(HX.ML, HX.MC)] },
  C: { strokes: [s(HX.UR, HX.T, HX.UL, HX.ML, HX.LL, HX.B, HX.LR)] },
  D: { strokes: [s(HX.UL, HX.ML, HX.LL, HX.B, HX.LR, HX.MR, HX.UR, HX.T, HX.UL)] },
  E: { strokes: [s(HX.UR, HX.T, HX.UL, HX.ML, HX.LL, HX.B, HX.LR), s(HX.ML, HX.MC)] },
  F: { strokes: [s(HX.UR, HX.T, HX.UL, HX.ML, HX.LL), s(HX.ML, HX.MC)] },
  G: { strokes: [s(HX.UR, HX.T, HX.UL, HX.ML, HX.LL, HX.B, HX.LR, HX.MR, HX.MC)] },
  H: { strokes: [s(HX.UL, HX.ML, HX.LL), s(HX.UR, HX.MR, HX.LR), s(HX.ML, HX.MC, HX.MR)] },
  I: { strokes: [s(HX.UL, HX.T, HX.UR), s(HX.T, HX.UC, HX.MC, HX.LC, HX.B), s(HX.LL, HX.B, HX.LR)] },
  J: { strokes: [s(HX.UR, HX.MR, HX.LR, HX.B, HX.LL, HX.ML)] },
  K: { strokes: [s(HX.UL, HX.ML, HX.LL), s(HX.UR, HX.MC, HX.ML), s(HX.MC, HX.LR)] },
  L: { strokes: [s(HX.UL, HX.ML, HX.LL, HX.B, HX.LR)] },
  M: { strokes: [s(HX.LL, HX.ML, HX.UL, HX.MC, HX.UR, HX.MR, HX.LR)] },
  N: { strokes: [s(HX.LL, HX.ML, HX.UL, HX.MC, HX.LR, HX.MR, HX.UR)] },
  O: { strokes: [s(HX.T, HX.UR, HX.MR, HX.LR, HX.B, HX.LL, HX.ML, HX.UL, HX.T)] },
  P: { strokes: [s(HX.LL, HX.ML, HX.UL, HX.T, HX.UR, HX.MR, HX.MC, HX.ML)] },
  Q: { strokes: [s(HX.T, HX.UR, HX.MR, HX.LR, HX.B, HX.LL, HX.ML, HX.UL, HX.T), s(HX.MC, HX.LR)] },
  R: { strokes: [s(HX.LL, HX.ML, HX.UL, HX.T, HX.UR, HX.MC, HX.ML), s(HX.MC, HX.LR)] },
  S: { strokes: [s(HX.UR, HX.T, HX.UL, HX.MC, HX.LR, HX.B, HX.LL)] },
  T: { strokes: [s(HX.UL, HX.T, HX.UR), s(HX.T, HX.UC, HX.MC, HX.LC, HX.B)] },
  U: { strokes: [s(HX.UL, HX.ML, HX.LL, HX.B, HX.LR, HX.MR, HX.UR)] },
  V: { strokes: [s(HX.UL, HX.ML, HX.B, HX.MR, HX.UR)] },
  W: { strokes: [s(HX.UL, HX.ML, HX.LL, HX.MC, HX.LR, HX.MR, HX.UR)] },
  X: { strokes: [s(HX.UL, HX.MC, HX.LR), s(HX.UR, HX.MC, HX.LL)] },
  Y: { strokes: [s(HX.UL, HX.MC, HX.UR), s(HX.MC, HX.LC, HX.B)] },
  Z: { strokes: [s(HX.UL, HX.T, HX.UR, HX.MC, HX.LL, HX.B, HX.LR)] },
  '0': { strokes: [s(HX.T, HX.UR, HX.MR, HX.LR, HX.B, HX.LL, HX.ML, HX.UL, HX.T), s(HX.LL, HX.MC, HX.UR)] },
  '1': { strokes: [s(HX.ML, HX.T, HX.UC, HX.MC, HX.LC, HX.B), s(HX.LL, HX.B, HX.LR)] },
  '2': { strokes: [s(HX.UL, HX.T, HX.UR, HX.MR, HX.MC, HX.LL, HX.B, HX.LR)] },
  '3': { strokes: [s(HX.UL, HX.T, HX.UR, HX.MC, HX.LR, HX.B, HX.LL), s(HX.ML, HX.MC)] },
  '4': { strokes: [s(HX.UL, HX.ML, HX.MC, HX.MR), s(HX.UR, HX.MR, HX.LR)] },
  '5': { strokes: [s(HX.UR, HX.T, HX.UL, HX.ML, HX.MC, HX.LR, HX.B, HX.LL)] },
  '6': { strokes: [s(HX.UR, HX.T, HX.UL, HX.ML, HX.LL, HX.B, HX.LR, HX.MR, HX.MC, HX.ML)] },
  '7': { strokes: [s(HX.UL, HX.T, HX.UR, HX.MC, HX.LC, HX.B)] },
  '8': { strokes: [s(HX.T, HX.UR, HX.MC, HX.UL, HX.T), s(HX.MC, HX.LR, HX.B, HX.LL, HX.MC)] },
  '9': { strokes: [s(HX.MR, HX.MC, HX.ML, HX.UL, HX.T, HX.UR, HX.MR, HX.LR, HX.B, HX.LL)] },
};

const FALLBACK_GLYPH: GlyphDefinition = {
  strokes: [
    s([0.24, 0.14], [0.76, 0.14], [0.76, 0.86], [0.24, 0.86], [0.24, 0.14]),
    s([0.36, 0.38], [0.64, 0.62]),
  ],
  dots: [[0.5, 0.5]],
};

export function getGlyphStrokes(char: string, style: BootGlyphStyle): GlyphDefinition {
  const upper = char.toUpperCase();
  if (style === 'oscilloscope') {
    return OSCILLOSCOPE_GLYPHS[upper] ?? CIRCUIT_GLYPHS[upper] ?? FALLBACK_GLYPH;
  }
  if (style === 'hex') {
    return HEX_GLYPHS[upper] ?? CIRCUIT_GLYPHS[upper] ?? FALLBACK_GLYPH;
  }
  return CIRCUIT_GLYPHS[upper] ?? FALLBACK_GLYPH;
}

export function drawGeometricGlyph(params: {
  ctx: CanvasRenderingContext2D;
  char: string;
  style: BootGlyphStyle;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  dimColor: string;
  timeSec: number;
}): void {
  const { ctx, char, style, x, y, w, h, color, dimColor, timeSec } = params;
  if (char === ' ') return;

  const def = getGlyphStrokes(char, style);
  const strokeWidth = Math.max(1.2, Math.min(3.4, h * 0.095));

  ctx.save();

  // Subtle unlit matrix ghost frame per style
  if (style === 'hex') {
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = Math.max(0.75, strokeWidth * 0.45);
    ctx.lineJoin = 'bevel';
    ctx.beginPath();
    const outerLoop: Pt[] = [HX.T, HX.UR, HX.MR, HX.LR, HX.B, HX.LL, HX.ML, HX.UL, HX.T];
    outerLoop.forEach(([px, py], idx) => {
      const gx = x + px * w;
      const gy = y + py * h;
      if (idx === 0) ctx.moveTo(gx, gy);
      else ctx.lineTo(gx, gy);
    });
    ctx.moveTo(x + HX.ML[0] * w, y + HX.ML[1] * h);
    ctx.lineTo(x + HX.MR[0] * w, y + HX.MR[1] * h);
    ctx.stroke();
  } else if (style === 'circuit') {
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = Math.max(0.7, strokeWidth * 0.4);
    ctx.strokeRect(x + w * 0.14, y + h * 0.08, w * 0.72, h * 0.84);
  } else {
    // Oscilloscope graticule ticks
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = Math.max(0.7, strokeWidth * 0.4);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y + h * 0.05);
    ctx.lineTo(x + w * 0.5, y + h * 0.14);
    ctx.moveTo(x + w * 0.5, y + h * 0.86);
    ctx.lineTo(x + w * 0.5, y + h * 0.95);
    ctx.moveTo(x + w * 0.06, y + h * 0.5);
    ctx.lineTo(x + w * 0.15, y + h * 0.5);
    ctx.moveTo(x + w * 0.85, y + h * 0.5);
    ctx.lineTo(x + w * 0.94, y + h * 0.5);
    ctx.stroke();
  }

  // Lit glyph strokes
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = style === 'hex' ? 'square' : 'round';
  ctx.lineJoin = style === 'hex' ? 'bevel' : 'round';

  for (let si = 0; si < def.strokes.length; si += 1) {
    const stroke = def.strokes[si]!;
    if (stroke.points.length === 0) continue;
    ctx.beginPath();
    for (let pi = 0; pi < stroke.points.length; pi += 1) {
      const [nx, ny] = stroke.points[pi]!;
      let gx = x + nx * w;
      let gy = y + ny * h;
      if (style === 'oscilloscope') {
        const phase = timeSec * 16 + nx * 9 + ny * 7 + si;
        const amp = Math.min(0.85, h * 0.022);
        gx += Math.sin(phase) * amp;
        gy += Math.cos(phase * 1.3) * amp;
      }
      if (pi === 0) {
        ctx.moveTo(gx, gy);
      } else {
        ctx.lineTo(gx, gy);
      }
    }
    ctx.stroke();
  }

  // Terminal solder pads (circuit) or beam phosphor hotspots (oscilloscope)
  if (style === 'circuit' && def.dots) {
    const padR = Math.max(1.2, strokeWidth * 0.72);
    for (const [dx, dy] of def.dots) {
      ctx.beginPath();
      ctx.arc(x + dx * w, y + dy * h, padR, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === 'oscilloscope') {
    const spotR = Math.max(1.0, strokeWidth * 0.55);
    for (const stroke of def.strokes) {
      for (const [nx, ny] of stroke.points) {
        ctx.beginPath();
        ctx.arc(x + nx * w, y + ny * h, spotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}
