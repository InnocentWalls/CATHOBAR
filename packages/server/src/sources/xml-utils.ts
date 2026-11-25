import { XMLParser } from 'fast-xml-parser';

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

export function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

export function extractText(field: unknown): string {
  if (typeof field === 'string') return field;
  if (typeof field === 'number') return String(field);
  if (field && typeof field === 'object') {
    const obj = field as Record<string, unknown>;
    if (typeof obj['#text'] === 'string') return obj['#text'];
  }
  return '';
}

export function extractLink(field: unknown): string | undefined {
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) {
    for (const entry of field) {
      const href = extractLink(entry);
      if (href) return href;
    }
    return undefined;
  }
  if (field && typeof field === 'object') {
    const obj = field as Record<string, unknown>;
    if (typeof obj['@_href'] === 'string') return obj['@_href'];
    if (typeof obj['#text'] === 'string') return obj['#text'];
  }
  return undefined;
}

export function normalizeTitleKey(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '').trim();
}

export function parseTimestampMs(rawDate: unknown): number | null {
  const str = extractText(rawDate).trim();
  if (!str) return null;
  const ms = Date.parse(str);
  return Number.isNaN(ms) ? null : ms;
}
