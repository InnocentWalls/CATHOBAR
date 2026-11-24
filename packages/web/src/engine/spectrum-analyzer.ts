import type { NowPlayingState, SpectrumAudioInput } from '@cathobar/shared';

export interface SpectrumSnapshot {
  bands: number[];
  peaks: number[];
  active: boolean;
}

const BAND_COUNT = 16;

export class SpectrumAnalyzer {
  private readonly bands = new Float32Array(BAND_COUNT);
  private readonly peaks = new Float32Array(BAND_COUNT);
  private readonly peakHold = new Float32Array(BAND_COUNT);
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private freqBins: Uint8Array<ArrayBuffer> | null = null;
  private micRequested = false;
  private micAvailable = false;
  private phase = 0;

  setInputMode(mode: SpectrumAudioInput, enabled: boolean): void {
    if (!enabled || mode !== 'mic') {
      this.stopMic();
      return;
    }
    if (!this.micRequested && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      void this.startMic();
    }
  }

  step(
    dtSec: number,
    mode: SpectrumAudioInput,
    nowPlaying: NowPlayingState | null,
    isNowPlayingChannel: boolean,
  ): SpectrumSnapshot {
    const clampedDt = Math.min(0.1, Math.max(0, dtSec));
    this.phase += clampedDt * 6.2;

    const hasExternalLevels =
      Boolean(nowPlaying?.playing) &&
      Array.isArray(nowPlaying?.levels) &&
      nowPlaying.levels.length > 0;
    const isPlaying = Boolean(nowPlaying?.playing) || isNowPlayingChannel;

    if (mode === 'mic' && this.micAvailable && this.analyser && this.freqBins) {
      this.analyser.getByteFrequencyData(this.freqBins);
      const binCount = this.freqBins.length;
      for (let b = 0; b < BAND_COUNT; b += 1) {
        const start = Math.floor((b / BAND_COUNT) * binCount * 0.65);
        const end = Math.max(start + 1, Math.floor(((b + 1) / BAND_COUNT) * binCount * 0.65));
        let sum = 0;
        for (let i = start; i < end; i += 1) {
          sum += this.freqBins[i] ?? 0;
        }
        const target = Math.min(1, sum / ((end - start) * 255));
        this.applyBandTarget(b, target, clampedDt);
      }
      return {
        bands: Array.from(this.bands),
        peaks: Array.from(this.peaks),
        active: true,
      };
    }

    if (hasExternalLevels && nowPlaying?.levels) {
      const levels = nowPlaying.levels;
      for (let b = 0; b < BAND_COUNT; b += 1) {
        const idx = Math.min(levels.length - 1, Math.floor((b / BAND_COUNT) * levels.length));
        this.applyBandTarget(b, levels[idx] ?? 0, clampedDt);
      }
      return {
        bands: Array.from(this.bands),
        peaks: Array.from(this.peaks),
        active: true,
      };
    }

    // Rhythmic VFD-style synthesized equalizer when music is playing or synth mode is forced
    const active = mode === 'synth' || isPlaying;
    for (let b = 0; b < BAND_COUNT; b += 1) {
      let target = 0;
      if (active) {
        const beat = 0.5 + 0.5 * Math.sin(this.phase * 1.35);
        const bassWeight = b < 4 ? 0.35 * beat : 0;
        const wave1 = Math.sin(this.phase * (1.1 + b * 0.23) + b * 0.8);
        const wave2 = Math.cos(this.phase * (2.1 - b * 0.08) + b * 1.4);
        const envelope = 1 - (b / BAND_COUNT) * 0.32;
        target = Math.max(0.08, Math.min(0.98, (0.42 + 0.26 * wave1 + 0.18 * wave2 + bassWeight) * envelope));
      } else {
        target = 0.04 + 0.03 * Math.sin(this.phase * 0.4 + b * 0.6);
      }
      this.applyBandTarget(b, target, clampedDt);
    }

    return {
      bands: Array.from(this.bands),
      peaks: Array.from(this.peaks),
      active,
    };
  }

  dispose(): void {
    this.stopMic();
  }

  private applyBandTarget(band: number, target: number, dtSec: number): void {
    const prev = this.bands[band] ?? 0;
    const next =
      target >= prev
        ? prev + (target - prev) * Math.min(1, dtSec * 24)
        : Math.max(target, prev - dtSec * 1.9);
    this.bands[band] = Math.max(0, Math.min(1, next));

    const prevPeak = this.peaks[band] ?? 0;
    if (next >= prevPeak) {
      this.peaks[band] = next;
      this.peakHold[band] = 0.35;
    } else {
      const hold = (this.peakHold[band] ?? 0) - dtSec;
      this.peakHold[band] = hold;
      if (hold <= 0) {
        this.peaks[band] = Math.max(next, prevPeak - dtSec * 0.65);
      }
    }
  }

  private async startMic(): Promise<void> {
    this.micRequested = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);

      this.micStream = stream;
      this.audioCtx = ctx;
      this.analyser = analyser;
      this.freqBins = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      this.micAvailable = true;
    } catch {
      this.micAvailable = false;
    }
  }

  private stopMic(): void {
    this.micAvailable = false;
    this.micRequested = false;
    if (this.micStream) {
      for (const track of this.micStream.getTracks()) {
        track.stop();
      }
      this.micStream = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.analyser = null;
    this.freqBins = null;
  }
}
