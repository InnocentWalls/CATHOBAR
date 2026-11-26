import {
  evaluateNightMode,
  isItemEnabledBySources,
  type ActivityBucket,
  type AppConfig,
  type BootGlyphStyle,
  type BootSequenceMode,
  type ChannelId,
  type NowPlayingState,
  type SensorReading,
  type TickerItem,
} from '@cathobar/shared';
import { playBreakingAlertChime, resolveAlertSoundKind } from './alert-audio.js';
import { computeScreenRegions } from './board-renderer.js';
import { createBootSequence, type ActiveBootSequence } from './boot-sequence.js';
import { Renderer2D, type ActiveBreakingAlert } from './renderer-2d.js';
import { RendererGL } from './renderer-gl.js';
import { SpectrumAnalyzer } from './spectrum-analyzer.js';
import {
  computeEffectiveChannel,
  computeRenderScale,
  computeScreenLogicalSize,
  resolveEffectiveScreenLayout,
  TickerLayoutEngine,
  type EffectiveScreenLayout,
} from './ticker-layout.js';

export interface EngineStats {
  fps: number;
  logicalWidth: number;
  logicalHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  effectiveChannel: ChannelId;
  effectiveScreenLayout: EffectiveScreenLayout;
  rotating: boolean;
  nightActive: boolean;
  paused: boolean;
  booting: boolean;
  backend: 'webgl2' | 'canvas2d';
}

export class TickerEngine {
  private readonly layout = new TickerLayoutEngine();
  private readonly renderer2d = new Renderer2D();
  private readonly spectrumAnalyzer = new SpectrumAnalyzer();
  private readonly rendererGl: RendererGL | null = null;
  private readonly fallbackCtx: CanvasRenderingContext2D | null = null;
  private config: AppConfig;
  private allItems: TickerItem[] = [];
  private activity: ActivityBucket[] = [];
  private latestWeathers: TickerItem[] = [];
  private nowPlaying: NowPlayingState | null = null;
  private sensors: SensorReading[] = [];
  private breakingQueue: TickerItem[] = [];
  private activeBreaking: ActiveBreakingAlert | null = null;
  private activeBoot: ActiveBootSequence | null = null;
  private lanUrls: string[] = [];
  private lastEffectiveChannel: ChannelId;
  private lastEffectiveScreenLayout: EffectiveScreenLayout = 'bar';
  private rafId: number | null = null;
  private lastFrameMs = 0;
  private fpsFrames = 0;
  private fpsLastCheck = 0;
  private currentFps = 60;
  private viewportWidth = 640;
  private viewportHeight = 96;
  private transparent = false;
  private paused = false;
  private onStats?: (stats: EngineStats) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    initialConfig: AppConfig,
    onStats?: (stats: EngineStats) => void,
  ) {
    this.config = initialConfig;
    this.lastEffectiveChannel = computeEffectiveChannel(initialConfig, Date.now()).channel;
    this.onStats = onStats;

    try {
      this.rendererGl = new RendererGL(canvas);
    } catch {
      this.fallbackCtx = canvas.getContext('2d');
    }
  }

  setViewportSize(width: number, height: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = Math.max(1, Math.round(width * dpr));
    let h = Math.max(1, Math.round(height * dpr));
    const maxDim = Math.max(w, h);
    if (maxDim > 4096) {
      const s = 4096 / maxDim;
      w = Math.max(1, Math.round(w * s));
      h = Math.max(1, Math.round(h * s));
    }
    this.viewportWidth = w;
    this.viewportHeight = h;
  }

  setTransparent(transparent: boolean): void {
    this.transparent = transparent;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  nudgeScroll(deltaPx: number): void {
    this.layout.nudgeScroll(deltaPx);
  }

  syncState(
    items: TickerItem[],
    activity: ActivityBucket[],
    config: AppConfig,
    nowPlaying: NowPlayingState | null = this.nowPlaying,
    sensors: SensorReading[] = this.sensors,
  ): void {
    this.activity = activity;
    this.nowPlaying = nowPlaying;
    this.sensors = sensors;
    this.updateConfigAndItems(items, config);
  }

  updateConfigAndItems(items: TickerItem[], config: AppConfig): void {
    const prevRotChannel = this.lastEffectiveChannel;
    const nextRot = computeEffectiveChannel(config, Date.now()).channel;
    const channelChanged = prevRotChannel !== nextRot || this.config.activeChannel !== config.activeChannel;
    const modeChanged = this.config.display.visualMode !== config.display.visualMode;
    const screenLayoutChanged =
      this.config.display.screenLayout !== config.display.screenLayout ||
      this.config.display.wallLanes !== config.display.wallLanes;

    this.config = config;
    this.allItems = items;
    this.lastEffectiveChannel = nextRot;

    this.spectrumAnalyzer.setInputMode(
      config.display.spectrumAudioInput,
      config.display.showSpectrumAnalyzer,
    );

    if (!config.display.breakingAlertEnabled) {
      this.breakingQueue = [];
      this.activeBreaking = null;
    }

    this.updateWeatherCache(items);
    this.layout.setPool(items, nextRot, config.sources, config.filtering?.weights);
    if (channelChanged || modeChanged || screenLayoutChanged) {
      this.layout.clearActive();
    }
  }

  pushItems(items: TickerItem[]): void {
    this.updateWeatherCache(items, true);
    const eff = computeEffectiveChannel(this.config, Date.now()).channel;

    const normalItems: TickerItem[] = [];
    for (const item of items) {
      if (item.breaking && this.config.display.breakingAlertEnabled) {
        this.breakingQueue.push(item);
        if (!item.oneShot) {
          normalItems.push(item);
        }
      } else {
        normalItems.push(item);
      }
    }

    if (normalItems.length > 0) {
      this.layout.enqueue(normalItems, eff, this.config.sources);
    }
  }

  updateActivity(activity: ActivityBucket[]): void {
    this.activity = activity;
  }

  updateNowPlaying(nowPlaying: NowPlayingState | null): void {
    this.nowPlaying = nowPlaying;
  }

  updateSensors(sensors: SensorReading[]): void {
    this.sensors = sensors;
  }

  updateLanUrls(lanUrls: string[]): void {
    this.lanUrls = lanUrls;
  }

  triggerBootSequence(override?: { mode?: BootSequenceMode; glyphStyle?: BootGlyphStyle }): void {
    const enabledSourceCount = Object.values(this.config.sources).filter((s) => s.enabled).length;
    this.activeBoot = createBootSequence({
      modeOverride: override?.mode,
      glyphStyleOverride: override?.glyphStyle,
      display: this.config.display,
      lanUrls: this.lanUrls,
      enabledSourceCount,
      now: new Date(),
    });
  }

  cancelBootSequence(): void {
    this.activeBoot = null;
  }

  start(): void {
    if (this.rafId !== null) return;
    this.lastFrameMs = performance.now();
    this.fpsLastCheck = this.lastFrameMs;
    const loop = (nowMs: number) => {
      this.tick(nowMs);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.spectrumAnalyzer.dispose();
    this.rendererGl?.dispose();
  }

  private tick(nowMs: number): void {
    const dtSec = (nowMs - this.lastFrameMs) / 1000;
    this.lastFrameMs = nowMs;
    const clampedDt = Math.min(0.1, Math.max(0, dtSec));

    const nowDate = new Date();
    const night = evaluateNightMode(this.config.nightMode, nowDate);
    const display = night.active
      ? {
          ...this.config.display,
          brightness: night.brightnessOverride ?? this.config.display.brightness,
          vfdPalette: night.paletteOverride ?? this.config.display.vfdPalette,
        }
      : this.config.display;

    const { sources, filtering } = this.config;
    const rotState = computeEffectiveChannel(this.config, nowDate.getTime());
    const activeChannel: ChannelId = night.clockOnly ? 'clock' : rotState.channel;

    if (activeChannel !== this.lastEffectiveChannel) {
      this.lastEffectiveChannel = activeChannel;
      this.layout.setPool(this.allItems, activeChannel, sources, filtering?.weights);
      this.layout.clearActive();
    }

    // Breaking Alert queue state machine
    if (!this.activeBreaking && this.breakingQueue.length > 0 && display.breakingAlertEnabled) {
      const nextAlert = this.breakingQueue.shift()!;
      this.activeBreaking = {
        item: nextAlert,
        elapsedSec: 0,
        durationSec: display.breakingAlertDurationSec,
      };
      if (display.breakingAlertSound) {
        playBreakingAlertChime(resolveAlertSoundKind(nextAlert), display.breakingAlertVolume);
      }
    } else if (this.activeBreaking) {
      this.activeBreaking.elapsedSec += clampedDt;
      if (this.activeBreaking.elapsedSec >= this.activeBreaking.durationSec) {
        this.activeBreaking = null;
      }
    }

    if (this.activeBoot && !this.activeBreaking && !this.paused) {
      this.activeBoot.elapsedSec += clampedDt;
      if (this.activeBoot.elapsedSec >= this.activeBoot.durationSec) {
        this.activeBoot = null;
      }
    }

    const effectiveScreenLayout = resolveEffectiveScreenLayout(
      display.screenLayout,
      this.viewportWidth,
      this.viewportHeight,
    );
    if (effectiveScreenLayout !== this.lastEffectiveScreenLayout) {
      this.lastEffectiveScreenLayout = effectiveScreenLayout;
      this.layout.clearActive();
    }

    const logical = computeScreenLogicalSize(
      this.viewportWidth,
      this.viewportHeight,
      effectiveScreenLayout,
      display,
    );

    const renderScale = computeRenderScale(
      this.viewportHeight,
      logical.width,
      logical.height,
      display.visualMode,
      effectiveScreenLayout,
    );

    this.renderer2d.configure(logical.width, logical.height, renderScale, display.visualMode);

    const spectrumSnapshot =
      display.showSpectrumAnalyzer && !(night.blackout && !this.activeBreaking)
        ? this.spectrumAnalyzer.step(
            clampedDt,
            display.spectrumAudioInput,
            this.nowPlaying,
            activeChannel === 'nowplaying',
          )
        : null;

    let tickerWidth: number;
    let tickerHeight: number;
    let stepLanes = display.lanes;
    let maxRows: number | undefined;
    let maxFontSize: number | undefined;
    let skipTickerStep = false;

    if (effectiveScreenLayout !== 'bar') {
      const regions = computeScreenRegions(
        logical.width,
        logical.height,
        effectiveScreenLayout,
        display,
        activeChannel,
      );
      tickerWidth = Math.max(40, regions.tickerRect.w);
      tickerHeight = Math.max(16, regions.tickerRect.h);
      stepLanes = regions.effectiveTickerLanes;
      maxRows = regions.effectiveTickerMaxRows;
      maxFontSize = regions.effectiveTickerMaxFontSize;
      skipTickerStep = regions.tickerRect.h <= 0 || regions.tickerRect.w <= 0;
    } else {
      const graphHeight = display.showActivityGraph
        ? logical.height <= 40
          ? Math.max(3, Math.round(logical.height * 0.14))
          : Math.max(8, Math.round(logical.height * 0.14))
        : 0;
      tickerHeight = logical.height - graphHeight;
      const overlayWidth = this.renderer2d.getRightOverlayWidth(
        tickerHeight,
        display,
        activeChannel,
        spectrumSnapshot,
      );
      tickerWidth = Math.max(40, logical.width - overlayWidth);
    }

    const effectiveSpeed =
      display.visualMode === 'shinkansen-led'
        ? display.scrollSpeed *
          (effectiveScreenLayout === 'bar'
            ? logical.height / 72
            : display.ledRows / 72)
        : display.scrollSpeed;

    const spans =
      skipTickerStep ||
      this.activeBreaking ||
      this.activeBoot ||
      (night.blackout && !this.activeBreaking)
        ? []
        : this.layout.step({
            dtSec: clampedDt,
            tickerWidth,
            tickerHeight,
            logicalHeight: logical.height,
            lanes: stepLanes,
            maxRows,
            maxFontSize,
            layoutMode: display.layoutMode,
            visualMode: display.visualMode,
            shinkansenStyle: display.shinkansenStyle,
            activeChannel,
            scrollSpeed: effectiveSpeed,
            showBadge: display.showSourceBadge,
            showPixelIcons: display.showPixelIcons,
            paused: this.paused,
            measureText: this.renderer2d.measureText,
          });

    this.renderer2d.render({
      display,
      effectiveScreenLayout,
      activeChannel,
      isRotating: rotState.rotating && !night.clockOnly,
      rotationProgress: rotState.progress,
      spans,
      splitFlapRows: this.layout.getSplitFlapRows(),
      allItems: this.allItems,
      sources,
      activity: this.activity,
      latestWeathers: this.latestWeathers,
      nowPlaying: this.nowPlaying,
      sensors: this.sensors,
      spectrum: spectrumSnapshot,
      breakingAlert: this.activeBreaking,
      bootSequence: this.activeBoot,
      now: nowDate,
      transparent: this.transparent,
      blackout: night.blackout,
      paused: this.paused,
    });

    const shiftX = display.burnInShift ? Math.sin(nowMs * 0.00017) * 0.85 : 0;
    const shiftY = display.burnInShift ? Math.cos(nowMs * 0.00013) * 0.65 : 0;

    if (this.rendererGl) {
      this.rendererGl.render(
        this.renderer2d.canvas,
        this.viewportWidth,
        this.viewportHeight,
        logical.width,
        logical.height,
        display,
        shiftX,
        shiftY,
        clampedDt,
        this.transparent,
      );
    } else if (this.fallbackCtx) {
      if (
        this.canvas.width !== this.viewportWidth ||
        this.canvas.height !== this.viewportHeight
      ) {
        this.canvas.width = this.viewportWidth;
        this.canvas.height = this.viewportHeight;
      }
      if (this.transparent) {
        this.fallbackCtx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);
      }
      this.fallbackCtx.imageSmoothingEnabled =
        display.visualMode === 'clean' || display.visualMode === 'split-flap';
      this.fallbackCtx.drawImage(
        this.renderer2d.canvas,
        0,
        0,
        this.viewportWidth,
        this.viewportHeight,
      );
    }

    this.fpsFrames += 1;
    if (nowMs - this.fpsLastCheck >= 500) {
      this.currentFps = Math.round((this.fpsFrames * 1000) / (nowMs - this.fpsLastCheck));
      this.fpsFrames = 0;
      this.fpsLastCheck = nowMs;
      this.onStats?.({
        fps: this.currentFps,
        logicalWidth: logical.width,
        logicalHeight: logical.height,
        viewportWidth: this.viewportWidth,
        viewportHeight: this.viewportHeight,
        effectiveChannel: activeChannel,
        effectiveScreenLayout,
        rotating: rotState.rotating && !night.clockOnly,
        nightActive: night.active,
        paused: this.paused,
        booting: Boolean(this.activeBoot),
        backend: this.rendererGl ? 'webgl2' : 'canvas2d',
      });
    }
  }

  private updateWeatherCache(items: TickerItem[], merge = false): void {
    const map = new Map<string, TickerItem>();
    if (merge) {
      for (const existing of this.latestWeathers) {
        if (isItemEnabledBySources(existing, this.config.sources)) {
          map.set(existing.replaceKey ?? existing.id, existing);
        }
      }
    }
    for (const item of items) {
      if (item.source === 'weather' && isItemEnabledBySources(item, this.config.sources)) {
        map.set(item.replaceKey ?? item.id, item);
      }
    }
    this.latestWeathers = Array.from(map.values());
  }
}
