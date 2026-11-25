/**
 * Minimal zero-dependency QR Code generator (Byte mode, ECC Level L, Versions 1-6).
 * Sufficient for encoding LAN URLs up to 134 UTF-8 bytes.
 */

interface QrVersionSpec {
  version: number;
  size: number;
  dataCodewords: number;
  blocks: Array<{ dataCount: number; ecCount: number }>;
  alignmentCenters: number[];
}

const QR_VERSIONS: QrVersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 19, blocks: [{ dataCount: 19, ecCount: 7 }], alignmentCenters: [] },
  { version: 2, size: 25, dataCodewords: 34, blocks: [{ dataCount: 34, ecCount: 10 }], alignmentCenters: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, blocks: [{ dataCount: 55, ecCount: 15 }], alignmentCenters: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, blocks: [{ dataCount: 80, ecCount: 20 }], alignmentCenters: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, blocks: [{ dataCount: 108, ecCount: 26 }], alignmentCenters: [6, 30] },
  {
    version: 6,
    size: 41,
    dataCodewords: 136,
    blocks: [
      { dataCount: 68, ecCount: 18 },
      { dataCount: 68, ecCount: 18 },
    ],
    alignmentCenters: [6, 34],
  },
];

// GF(256) with primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11d)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255]!;
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a]! + GF_LOG[b]!) % 255]!;
}

function buildGeneratorPoly(ecCount: number): number[] {
  let poly = [1];
  for (let i = 0; i < ecCount; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    const factor = GF_EXP[i]!;
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = (next[j] ?? 0) ^ poly[j]!;
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(poly[j]!, factor);
    }
    poly = next;
  }
  return poly;
}

function computeReedSolomon(data: number[], ecCount: number): number[] {
  const gen = buildGeneratorPoly(ecCount);
  const res = new Array<number>(data.length + ecCount).fill(0);
  for (let i = 0; i < data.length; i += 1) {
    res[i] = data[i]!;
  }
  for (let i = 0; i < data.length; i += 1) {
    const coef = res[i]!;
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j += 1) {
        res[i + j] = (res[i + j] ?? 0) ^ gfMul(gen[j]!, coef);
      }
    }
  }
  return res.slice(data.length);
}

function encodeDataBits(bytes: Uint8Array, spec: QrVersionSpec): number[] {
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i -= 1) {
      bits.push((val >> i) & 1);
    }
  };

  // Mode indicator 0100 (Byte), Char count (8 bits for V1-9)
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) {
    pushBits(b, 8);
  }

  const maxBits = spec.dataCodewords * 8;
  const terminatorLen = Math.min(4, maxBits - bits.length);
  pushBits(0, terminatorLen);

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < maxBits) {
    pushBits(padBytes[padIdx % 2]!, 8);
    padIdx += 1;
  }

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let cw = 0;
    for (let j = 0; j < 8; j += 1) {
      cw = (cw << 1) | (bits[i + j] ?? 0);
    }
    codewords.push(cw);
  }

  // Split into RS blocks & interleave
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (const b of spec.blocks) {
    const slice = codewords.slice(offset, offset + b.dataCount);
    offset += b.dataCount;
    dataBlocks.push(slice);
    ecBlocks.push(computeReedSolomon(slice, b.ecCount));
  }

  const finalCodewords: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i += 1) {
    for (const blk of dataBlocks) {
      if (i < blk.length) finalCodewords.push(blk[i]!);
    }
  }
  const maxEc = Math.max(...ecBlocks.map((b) => b.length));
  for (let i = 0; i < maxEc; i += 1) {
    for (const blk of ecBlocks) {
      if (i < blk.length) finalCodewords.push(blk[i]!);
    }
  }

  const outBits: number[] = [];
  for (const cw of finalCodewords) {
    for (let i = 7; i >= 0; i -= 1) {
      outBits.push((cw >> i) & 1);
    }
  }
  return outBits;
}

function buildMatrixWithPatterns(spec: QrVersionSpec): {
  modules: number[][];
  isFunc: boolean[][];
} {
  const n = spec.size;
  const modules = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const isFunc = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));

  const setFunc = (r: number, c: number, val: number) => {
    if (r < 0 || c < 0 || r >= n || c >= n) return;
    modules[r]![c] = val;
    isFunc[r]![c] = true;
  };

  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr += 1) {
      for (let dc = -1; dc <= 7; dc += 1) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || c < 0 || r >= n || c >= n) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const isBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const isCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunc(r, c, inOuter && (isBorder || isCore) ? 1 : 0);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, n - 7);
  drawFinder(n - 7, 0);

  // Timing patterns
  for (let i = 8; i < n - 8; i += 1) {
    const v = i % 2 === 0 ? 1 : 0;
    setFunc(6, i, v);
    setFunc(i, 6, v);
  }

  // Alignment patterns
  const centers = spec.alignmentCenters;
  for (const rCenter of centers) {
    for (const cCenter of centers) {
      const overlapsFinder =
        (rCenter <= 8 && cCenter <= 8) ||
        (rCenter <= 8 && cCenter >= n - 9) ||
        (rCenter >= n - 9 && cCenter <= 8);
      if (overlapsFinder) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const isDark =
            Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          setFunc(rCenter + dr, cCenter + dc, isDark ? 1 : 0);
        }
      }
    }
  }

  // Dark module
  setFunc(n - 8, 8, 1);

  // Reserve format info cells
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      isFunc[8]![i] = true;
      isFunc[i]![8] = true;
    }
  }
  for (let i = 0; i < 8; i += 1) {
    isFunc[8]![n - 1 - i] = true;
    isFunc[n - 1 - i]![8] = true;
  }

  return { modules, isFunc };
}

function placeDataBits(modules: number[][], isFunc: boolean[][], dataBits: number[]): void {
  const n = modules.length;
  let bitIdx = 0;
  let dirUp = true;

  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < n; step += 1) {
      const r = dirUp ? n - 1 - step : step;
      for (let colOffset = 0; colOffset < 2; colOffset += 1) {
        const c = right - colOffset;
        if (isFunc[r]![c]) continue;
        modules[r]![c] = bitIdx < dataBits.length ? dataBits[bitIdx]! : 0;
        bitIdx += 1;
      }
    }
    dirUp = !dirUp;
  }
}

function applyMaskAndFormat(
  baseModules: number[][],
  isFunc: boolean[][],
  maskPattern: number,
): number[][] {
  const n = baseModules.length;
  const mat = baseModules.map((row) => [...row]);

  const maskBit = (r: number, c: number): boolean => {
    switch (maskPattern) {
      case 0:
        return (r + c) % 2 === 0;
      case 1:
        return r % 2 === 0;
      case 2:
        return c % 3 === 0;
      case 3:
        return (r + c) % 3 === 0;
      case 4:
        return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5:
        return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6:
        return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
      default:
        return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  };

  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (!isFunc[r]![c] && maskBit(r, c)) {
        mat[r]![c] = mat[r]![c]! ^ 1;
      }
    }
  }

  // Format bits: ECC Level L (01) + 3-bit mask -> BCH(15,5) + mask 0x5412
  const data5 = (0b01 << 3) | maskPattern;
  let rem = data5 << 10;
  for (let i = 4; i >= 0; i -= 1) {
    if ((rem >> (i + 10)) & 1) {
      rem ^= 0b10100110111 << i;
    }
  }
  const format15 = ((data5 << 10) | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i += 1) {
    const bit = (format15 >> i) & 1;
    mat[8]![i] = bit;
  }
  mat[8]![7] = (format15 >> 6) & 1;
  mat[8]![8] = (format15 >> 7) & 1;
  mat[7]![8] = (format15 >> 8) & 1;
  for (let i = 9; i < 15; i += 1) {
    mat[14 - i]![8] = (format15 >> i) & 1;
  }

  for (let i = 0; i < 7; i += 1) {
    mat[n - 1 - i]![8] = (format15 >> i) & 1;
  }
  for (let i = 7; i < 15; i += 1) {
    mat[8]![n - 15 + i] = (format15 >> i) & 1;
  }

  return mat;
}

function penaltyScore(mat: number[][]): number {
  const n = mat.length;
  let score = 0;

  // Rule 1: 5+ consecutive same-color modules in rows/cols
  for (let r = 0; r < n; r += 1) {
    let runColor = mat[r]![0]!;
    let runLen = 1;
    for (let c = 1; c < n; c += 1) {
      if (mat[r]![c] === runColor) {
        runLen += 1;
      } else {
        if (runLen >= 5) score += 3 + (runLen - 5);
        runColor = mat[r]![c]!;
        runLen = 1;
      }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
  }
  for (let c = 0; c < n; c += 1) {
    let runColor = mat[0]![c]!;
    let runLen = 1;
    for (let r = 1; r < n; r += 1) {
      if (mat[r]![c] === runColor) {
        runLen += 1;
      } else {
        if (runLen >= 5) score += 3 + (runLen - 5);
        runColor = mat[r]![c]!;
        runLen = 1;
      }
    }
    if (runLen >= 5) score += 3 + (runLen - 5);
  }

  // Rule 2: 2x2 blocks
  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const v = mat[r]![c]!;
      if (v === mat[r]![c + 1] && v === mat[r + 1]![c] && v === mat[r + 1]![c + 1]) {
        score += 3;
      }
    }
  }

  return score;
}

/**
 * Generates a boolean QR code matrix (true = dark module) for the given text.
 */
export function generateQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const spec =
    QR_VERSIONS.find((v) => v.dataCodewords >= bytes.length + 2) ??
    QR_VERSIONS[QR_VERSIONS.length - 1]!;
  const safeBytes = bytes.slice(0, spec.dataCodewords - 2);
  const dataBits = encodeDataBits(safeBytes, spec);
  const { modules, isFunc } = buildMatrixWithPatterns(spec);
  placeDataBits(modules, isFunc, dataBits);

  let bestMat: number[][] | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = applyMaskAndFormat(modules, isFunc, mask);
    const s = penaltyScore(candidate);
    if (s < bestScore) {
      bestScore = s;
      bestMat = candidate;
    }
  }

  return (bestMat ?? modules).map((row) => row.map((cell) => cell === 1));
}

/**
 * Renders a crisp SVG QR code string with a 2-module quiet zone.
 */
export function renderQrSvg(text: string, sizePx = 160): string {
  const matrix = generateQrMatrix(text);
  const n = matrix.length;
  const quiet = 2;
  const viewSize = n + quiet * 2;
  const rects: string[] = [];

  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (matrix[r]![c]) {
        rects.push(`<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1" />`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx}" height="${sizePx}" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="${viewSize}" height="${viewSize}" fill="#ffffff"/><g fill="#000000">${rects.join('')}</g></svg>`;
}
