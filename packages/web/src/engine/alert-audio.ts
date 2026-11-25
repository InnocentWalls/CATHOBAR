import type { TickerItem } from '@cathobar/shared';

export type AlertSoundKind = 'eew' | 'quake' | 'news' | 'timer' | 'default';

let sharedAudioCtx: AudioContext | null = null;

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

/**
 * Unlocks/resumes the shared AudioContext during a user gesture so later alerts play reliably.
 */
export function unlockAlertAudio(): void {
  try {
    const ctx = getOrCreateAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  } catch {
    // Ignore autoplay restrictions
  }
}

export function resolveAlertSoundKind(item: TickerItem): AlertSoundKind {
  if (item.source === 'earthquake') {
    if (item.badge.includes('緊急地震速報') || item.icon === 'alert') {
      return 'eew';
    }
    return 'quake';
  }
  if (item.source === 'nhk-breaking') return 'news';
  if (item.source === 'countdown' || item.source === 'calendar') return 'timer';
  return 'default';
}

interface ToneStep {
  freq: number;
  offsetSec: number;
  durationSec: number;
  type: OscillatorType;
}

const CHIME_PATTERNS: Record<AlertSoundKind, ToneStep[]> = {
  eew: [
    { freq: 587.33, offsetSec: 0, durationSec: 0.16, type: 'sawtooth' },
    { freq: 880, offsetSec: 0.16, durationSec: 0.22, type: 'sawtooth' },
    { freq: 587.33, offsetSec: 0.42, durationSec: 0.16, type: 'sawtooth' },
    { freq: 880, offsetSec: 0.58, durationSec: 0.28, type: 'sawtooth' },
  ],
  quake: [
    { freq: 523.25, offsetSec: 0, durationSec: 0.16, type: 'triangle' },
    { freq: 659.25, offsetSec: 0.15, durationSec: 0.16, type: 'triangle' },
    { freq: 783.99, offsetSec: 0.3, durationSec: 0.26, type: 'triangle' },
  ],
  news: [
    { freq: 987.77, offsetSec: 0, durationSec: 0.11, type: 'sine' },
    { freq: 1318.5, offsetSec: 0.11, durationSec: 0.11, type: 'sine' },
    { freq: 1567.98, offsetSec: 0.22, durationSec: 0.24, type: 'sine' },
  ],
  timer: [
    { freq: 783.99, offsetSec: 0, durationSec: 0.11, type: 'triangle' },
    { freq: 1046.5, offsetSec: 0.12, durationSec: 0.11, type: 'triangle' },
    { freq: 1318.5, offsetSec: 0.24, durationSec: 0.24, type: 'triangle' },
  ],
  default: [
    { freq: 880, offsetSec: 0, durationSec: 0.12, type: 'triangle' },
    { freq: 1318.5, offsetSec: 0.14, durationSec: 0.12, type: 'triangle' },
    { freq: 880, offsetSec: 0.28, durationSec: 0.12, type: 'triangle' },
    { freq: 1318.5, offsetSec: 0.42, durationSec: 0.14, type: 'triangle' },
  ],
};

/**
 * Synthesizes a hardware-style Breaking Alert chime using a shared Web Audio API context.
 */
export function playBreakingAlertChime(
  kind: AlertSoundKind = 'default',
  volume = 0.5,
): void {
  try {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const clampedVol = Math.max(0.05, Math.min(1, volume)) * 0.22;
    const now = ctx.currentTime;
    const steps = CHIME_PATTERNS[kind] ?? CHIME_PATTERNS.default;

    for (const step of steps) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + step.offsetSec;
      const end = start + step.durationSec;
      osc.type = step.type;
      osc.frequency.setValueAtTime(step.freq, start);

      gain.gain.setValueAtTime(0.0005, start);
      gain.gain.exponentialRampToValueAtTime(clampedVol, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0005, end);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.01);
    }
  } catch {
    // Ignore audio context errors when autoplay is blocked
  }
}
