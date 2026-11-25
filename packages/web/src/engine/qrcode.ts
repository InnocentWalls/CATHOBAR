import QRCode from 'qrcode';

/**
 * Generates a boolean QR code matrix (true = dark module) using standard QR encoding (ECC M).
 */
export function generateQrMatrix(text: string): boolean[][] {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const matrix: boolean[][] = [];
  for (let r = 0; r < size; r += 1) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c += 1) {
      row.push(Boolean(data[r * size + c]));
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * Renders a crisp SVG QR code string with the spec-compliant 4-module quiet zone.
 */
export function renderQrSvg(text: string, sizePx = 160): string {
  const matrix = generateQrMatrix(text);
  const n = matrix.length;
  const quiet = 4;
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
