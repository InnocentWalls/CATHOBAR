import type { ActivityBucket, AppConfig, TickerItem } from '@cathobar/shared';
import { Renderer2D } from './renderer-2d.js';
import { RendererGL } from './renderer-gl.js';
import { computeLogicalSize, TickerLayoutEngine } from './ticker-layout.js';

export interface EngineStats {
  fps: number;
  logicalWidth: number;
  logicalHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  backend: 'webgl2' | 'canvas2d';
}

export class TickerEngine {
  private readonly layout = new TickerLayoutEngine();
  private readonly renderer2d = new Renderer2D();
  private readonly rendererGl: RendererGL | null = null;
  private readonly fallbackCtx: CanvasRenderingContext2D | null = null;
  private config: AppConfig;
  private activity: ActivityBucket[] = [];
  private latestWeathers: TickerItem[] = [];
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

  syncState(items: TickerItem[], activity: ActivityBucket[], config: AppConfig): void {
    const channelChanged = this.config.activeChannel !== config.activeChannel;
    this.config = config;
    this.activity = activity;
    this.updateWeatherCache(items);
    this.layout.setPool(items, config.activeChannel);
    if (channelChanged) {
      this.layout.clearActive();
    }
  }

  pushItems(items: TickerItem[]): void {
    this.updateWeatherCache(items, true);
    this.layout.enqueue(items, this.config.activeChannel);
  }

  updateActivity(activity: ActivityBucket[]): void {
    this.activity = activity;
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
    this.rendererGl?.dispose();
  }

  private tick(nowMs: number): void {
    const dtSec = (nowMs - this.lastFrameMs) / 1000;
    this.lastFrameMs = nowMs;

    const { display, activeChannel } = this.config;
    const logical = computeLogicalSize(
      this.viewportWidth,
      this.viewportHeight,
      display.logicalHeight,
    );

    const renderScale =
      display.visualMode === 'clean'
        ? Math.max(1, Math.min(4, this.viewportHeight / logical.height))
        : 1;

    this.renderer2d.configure(logical.width, logical.height, renderScale);

    const graphHeight = display.showActivityGraph
      ? Math.max(8, Math.round(logical.height * 0.14))
      : 0;
    const tickerHeight = logical.height - graphHeight;
    const overlayWidth = this.renderer2d.getClockOverlayWidth(
      tickerHeight,
      display.showClockOverlay,
      activeChannel,
    );
    const tickerWidth = Math.max(80, logical.width - overlayWidth);

    const spans = this.layout.step({
      dtSec,
      tickerWidth,
      tickerHeight,
      logicalHeight: logical.height,
      lanes: display.lanes,
      layoutMode: display.layoutMode,
      activeChannel,
      scrollSpeed: display.scrollSpeed,
      showBadge: display.showSourceBadge,
      measureText: this.renderer2d.measureText,
    });

    this.renderer2d.render({
      display,
      activeChannel,
      spans,
      activity: this.activity,
      latestWeathers: this.latestWeathers,
      now: new Date(),
    });

    if (this.rendererGl) {
      this.rendererGl.render(
        this.renderer2d.canvas,
        this.viewportWidth,
        this.viewportHeight,
        logical.width,
        logical.height,
        display,
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
        backend: this.rendererGl ? 'webgl2' : 'canvas2d',
      });
    }
  }

  private updateWeatherCache(items: TickerItem[], merge = false): void {
    const map = new Map<string, TickerItem>();
    if (merge) {
      for (const existing of this.latestWeathers) {
        map.set(existing.replaceKey ?? existing.id, existing);
      }
    }
    for (const item of items) {
      if (item.source === 'weather') {
        map.set(item.replaceKey ?? item.id, item);
      }
    }
    this.latestWeathers = Array.from(map.values());
  }
}
