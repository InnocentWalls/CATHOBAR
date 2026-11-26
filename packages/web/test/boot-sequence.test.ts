import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  type BootGlyphStyle,
  type BootSequenceMode,
  type VisualMode,
} from '@cathobar/shared';
import {
  buildBootMessage,
  getGlyphStrokes,
  isGeometricAscii,
  resolveEffectiveBootMode,
} from '../src/engine/boot-glyphs.js';
import { createBootSequence } from '../src/engine/boot-sequence.js';

describe('resolveEffectiveBootMode', () => {
  it('resolves auto mode according to visualMode and bootGlyphStyle', () => {
    const glyphStyles: BootGlyphStyle[] = ['circuit', 'oscilloscope', 'hex'];
    for (const style of glyphStyles) {
      const expected = `glyph-${style}`;
      expect(resolveEffectiveBootMode('auto', 'anobar8-vfd', style)).toBe(expected);
      expect(resolveEffectiveBootMode('auto', 'anobar-fed', style)).toBe(expected);
      expect(resolveEffectiveBootMode('auto', 'clean', style)).toBe(expected);
    }

    expect(resolveEffectiveBootMode('auto', 'shinkansen-led', 'circuit')).toBe('led-test');
    expect(resolveEffectiveBootMode('auto', 'station-board', 'hex')).toBe('led-test');
    expect(resolveEffectiveBootMode('auto', 'split-flap', 'oscilloscope')).toBe('flap-cascade');
  });

  it('honors explicit boot mode overrides and off', () => {
    const explicit: BootSequenceMode[] = [
      'glyph-circuit',
      'glyph-oscilloscope',
      'glyph-hex',
      'led-test',
      'flap-cascade',
      'off',
    ];
    const visualModes: VisualMode[] = [
      'anobar8-vfd',
      'anobar-fed',
      'shinkansen-led',
      'split-flap',
      'station-board',
      'clean',
    ];
    for (const bm of explicit) {
      for (const vm of visualModes) {
        expect(resolveEffectiveBootMode(bm, vm, 'circuit')).toBe(bm);
      }
    }
  });
});

describe('buildBootMessage', () => {
  it('builds dynamic POST boot message with host, source count, and timestamp', () => {
    const msg = buildBootMessage({
      messageMode: 'dynamic',
      customMessage: 'IGNORED',
      lanUrls: ['http://192.168.1.42:3000'],
      enabledSourceCount: 9,
      visualMode: 'anobar8-vfd',
      now: new Date(2026, 0, 1, 8, 5, 9),
    });
    expect(msg).toContain('CATHOBAR');
    expect(msg).toContain('192.168.1.42:3000');
    expect(msg).toContain('9 SRC READY');
    expect(msg).toContain('ANOBAR8-VFD');
    expect(msg).toContain('08:05:09');
  });

  it('returns trimmed custom message when custom mode is non-empty and falls back otherwise', () => {
    const custom = buildBootMessage({
      messageMode: 'custom',
      customMessage: '  HELLO CATHODE  ',
      lanUrls: [],
      enabledSourceCount: 3,
      visualMode: 'clean',
      now: new Date(2026, 0, 1, 12, 0, 0),
    });
    expect(custom).toBe('HELLO CATHODE');

    const fallback = buildBootMessage({
      messageMode: 'custom',
      customMessage: '   ',
      lanUrls: [],
      enabledSourceCount: 3,
      visualMode: 'clean',
      now: new Date(2026, 0, 1, 12, 0, 0),
    });
    expect(fallback).toContain('LOCAL');
    expect(fallback).toContain('3 SRC READY');
  });
});

describe('getGlyphStrokes', () => {
  const styles: BootGlyphStyle[] = ['circuit', 'oscilloscope', 'hex'];
  const chars = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');

  it('provides normalized [0,1] strokes for A-Z and 0-9 in all 3 geometric styles', () => {
    for (const style of styles) {
      for (const ch of chars) {
        expect(isGeometricAscii(ch)).toBe(true);
        const def = getGlyphStrokes(ch, style);
        expect(def.strokes.length).toBeGreaterThan(0);
        for (const stroke of def.strokes) {
          expect(stroke.points.length).toBeGreaterThanOrEqual(2);
          for (const [x, y] of stroke.points) {
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(1);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(1);
          }
        }
        if (def.dots) {
          for (const [dx, dy] of def.dots) {
            expect(dx).toBeGreaterThanOrEqual(0);
            expect(dx).toBeLessThanOrEqual(1);
            expect(dy).toBeGreaterThanOrEqual(0);
            expect(dy).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});

describe('createBootSequence', () => {
  it('returns null when effective mode is off and initializes active state otherwise', () => {
    const offSeq = createBootSequence({
      modeOverride: 'off',
      display: DEFAULT_CONFIG.display,
      lanUrls: ['http://192.168.0.10:3000'],
      enabledSourceCount: 5,
      now: new Date(),
    });
    expect(offSeq).toBeNull();

    const activeSeq = createBootSequence({
      modeOverride: 'glyph-hex',
      display: {
        ...DEFAULT_CONFIG.display,
        bootDurationSec: 12,
        bootDecodeScan: false,
      },
      lanUrls: ['http://192.168.0.10:3000'],
      enabledSourceCount: 5,
      now: new Date(),
    });
    expect(activeSeq).not.toBeNull();
    expect(activeSeq?.mode).toBe('glyph-hex');
    expect(activeSeq?.durationSec).toBe(12);
    expect(activeSeq?.decodeScan).toBe(false);
    expect(activeSeq?.elapsedSec).toBe(0);
    expect(activeSeq?.message).toContain('192.168.0.10:3000');
  });
});
