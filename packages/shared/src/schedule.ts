import type { NightModeConfig, VfdPalette } from './schema.js';

export interface NightModeEvaluation {
  active: boolean;
  blackout: boolean;
  clockOnly: boolean;
  brightnessOverride: number | null;
  paletteOverride: VfdPalette | null;
}

/**
 * Parses an "HH:MM" string into total minutes since midnight [0..1439], or null if invalid.
 */
export function parseHHMM(str: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(str.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return hh * 60 + mm;
}

/**
 * Returns whether `now` falls within [startHHMM, endHHMM), supporting overnight ranges like 23:00-07:00.
 */
export function isTimeInRange(now: Date, startHHMM: string, endHHMM: string): boolean {
  const start = parseHHMM(startHHMM);
  const end = parseHHMM(endHHMM);
  if (start === null || end === null) return false;
  if (start === end) return true;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start < end) {
    return cur >= start && cur < end;
  }
  return cur >= start || cur < end;
}

/**
 * Evaluates effective display overrides for the configured night mode schedule.
 */
export function evaluateNightMode(cfg: NightModeConfig | undefined, now: Date): NightModeEvaluation {
  if (!cfg || !cfg.enabled || !isTimeInRange(now, cfg.startTime, cfg.endTime)) {
    return {
      active: false,
      blackout: false,
      clockOnly: false,
      brightnessOverride: null,
      paletteOverride: null,
    };
  }

  return {
    active: true,
    blackout: cfg.behavior === 'blackout',
    clockOnly: cfg.behavior === 'clock-only',
    brightnessOverride: cfg.brightness,
    paletteOverride: cfg.forceAmberVfd ? 'amber' : null,
  };
}
