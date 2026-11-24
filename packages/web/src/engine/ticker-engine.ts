import {
  isItemEnabledBySources,
  type ActivityBucket,
  type AppConfig,
  type ChannelId,
  type NowPlayingState,
  type TickerItem,
} from '@cathobar/shared';
import { playBreakingAlertChime } from './alert-audio.js';
import { Renderer2D, type ActiveBreakingAlert } from './renderer-2d.js';
import { RendererGL } from './renderer-gl.js';
import { SpectrumAnalyzer } from './spectrum-analyzer.js';
import {
  computeEffectiveChannel,
  computeLogicalSize,
  TickerLayoutEngine,
} from './ticker-layout.js';

export interface EngineStats {
  fps: number;
  logicalWidth: number;
  logicalHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  effectiveChannel: ChannelId;
  rotating: boolean;
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
  private breakingQueue: TickerItem[] = [];
  private activeBreaking: ActiveBreakingAlert | null = null;
  private lastEffectiveChannel: ChannelId;
  private rafId: number | null = null;
  private lastFrameMs = 0;
  private fpsFrames = 0;
  private fpsLastCheck = 0;
  private currentFps = 60;
  private viewportWidth = 640;
  private viewportHeight = 96;
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
    this.viewportWidth = Math.max(1, Math.round(width * dpr));
    this.viewportHeight = Math.max(1, Math.round(height * dpr));
  }

  syncState(
    items: TickerItem[],
    activity: ActivityBucket[],
    config: AppConfig,
    nowPlaying: NowPlayingState | null = this.nowPlaying,
  ): void {
    const prevRotChannel = this.lastEffectiveChannel;
    const nextRot = computeEffectiveChannel(config, Date.now()).channel;
    const channelChanged = prevRotChannel !== nextRot || this.config.activeChannel !== config.activeChannel;
    const modeChanged = this.config.display.visualMode !== config.display.visualMode;

    this.config = config;
    this.allItems = items;
    this.activity = activity;
    this.nowPlaying = nowPlaying;
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
    if (channelChanged || modeChanged) {
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

    const { display, sources, filtering } = this.config;
    const rotState = computeEffectiveChannel(this.config, Date.now());
    const activeChannel = rotState.channel;

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
        playBreakingAlertChime();
      }
    } else if (this.activeBreaking) {
      this.activeBreaking.elapsedSec += clampedDt;
      if (this.activeBreaking.elapsedSec >= this.activeBreaking.durationSec) {
        this.activeBreaking = null;
      }
    }

    const targetLogicalHeight =
      display.visualMode === 'shinkansen-led' ? display.ledRows : display.logicalHeight;

    const logical = computeLogicalSize(
      this.viewportWidth,
      this.viewportHeight,
      targetLogicalHeight,
    );

    const renderScale =
      display.visualMode === 'clean'
        ? Math.max(1, Math.min(4, this.viewportHeight / logical.height))
        : 1;

    this.renderer2d.configure(logical.width, logical.height, renderScale, display.visualMode);

    const spectrumSnapshot = display.showSpectrumAnalyzer
      ? this.spectrumAnalyzer.step(
          clampedDt,
          display.spectrumAudioInput,
          this.nowPlaying,
          activeChannel === 'nowplaying',
        )
      : null;

    const graphHeight = display.showActivityGraph
      ? logical.height <= 40
        ? Math.max(3, Math.round(logical.height * 0.14))
        : Math.max(8, Math.round(logical.height * 0.14))
      : 0;
    const tickerHeight = logical.height - graphHeight;
    const overlayWidth = this.renderer2d.getRightOverlayWidth(
      tickerHeight,
      display,
      activeChannel,
      spectrumSnapshot,
    );
    const tickerWidth = Math.max(40, logical.width - overlayWidth);

    const effectiveSpeed =
      display.visualMode === 'shinkansen-led'
        ? display.scrollSpeed * (logical.height / 72)
        : display.scrollSpeed;

    const spans = this.activeBreaking
      ? []
      : this.layout.step({
          dtSec: clampedDt,
          tickerWidth,
          tickerHeight,
          logicalHeight: logical.height,
          lanes: display.lanes,
          layoutMode: display.layoutMode,
          visualMode: display.visualMode,
          shinkansenStyle: display.shinkansenStyle,
          activeChannel,
          scrollSpeed: effectiveSpeed,
          showBadge: display.showSourceBadge,
          showPixelIcons: display.showPixelIcons,
          measureText: this.renderer2d.measureText,
        });

    this.renderer2d.render({
      display,
      activeChannel,
      isRotating: rotState.rotating,
      rotationProgress: rotState.progress,
      spans,
      activity: this.activity,
      latestWeathers: this.latestWeathers,
      nowPlaying: this.nowPlaying,
      spectrum: spectrumSnapshot,
      breakingAlert: this.activeBreaking,
      now: new Date(),
    });

    // Subtle slow Lissajous pixel shift for VFD / OLED burn-in prevention
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
      );
    } else if (this.fallbackCtx) {
      if (
        this.canvas.width !== this.viewportWidth ||
        this.canvas.height !== this.viewportHeight
      ) {
        this.canvas.width = this.viewportWidth;
        this.canvas.height = this.viewportHeight;
      }
      this.fallbackCtx.imageSmoothingEnabled = display.visualMode === 'clean';
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
        rotating: rotState.rotating,
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
