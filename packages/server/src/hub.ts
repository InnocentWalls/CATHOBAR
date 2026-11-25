import { networkInterfaces } from 'node:os';
import type { WebSocket } from 'ws';
import {
  isItemEnabledBySources,
  matchesMuteKeywords,
  type ActivityBucket,
  type AppConfig,
  type NowPlayingPushInput,
  type NowPlayingState,
  type PartialAppConfig,
  type PushMessageInput,
  type SensorPushInput,
  type SensorReading,
  type ServerState,
  type SourceStatus,
  type TickerItem,
  type TickerSourceId,
  type TransitDiscoveredLine,
  type WsMessage,
} from '@cathobar/shared';
import { ConfigStore } from './config-store.js';
import { CalendarSource } from './sources/calendar.js';
import { CountdownSource } from './sources/countdown.js';
import { EarthquakeSource } from './sources/earthquake.js';
import { MarketSource } from './sources/market.js';
import { MastodonSource } from './sources/mastodon.js';
import { NhkBreakingSource } from './sources/nhk-breaking.js';
import { NowPlayingSource } from './sources/nowplaying.js';
import { RssSource } from './sources/rss.js';
import { SensorsSource } from './sources/sensors.js';
import { SysmonSource } from './sources/sysmon.js';
import { TransitSource } from './sources/transit.js';
import type { SourceContext, TickerSource } from './sources/types.js';
import { WeatherSource } from './sources/weather.js';
import { parseWebhookPayload } from './sources/webhook.js';
import { WikipediaSource } from './sources/wikipedia.js';

const MAX_RECENT_ITEMS = 120;
const MAX_HISTORY_ITEMS = 120;
const BUCKET_MS = 10_000;
const MAX_BUCKETS = 48;

function normalizeTitleForDedupe(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '').trim();
}

export class TickerHub {
  private readonly clients = new Set<WebSocket>();
  private readonly items: TickerItem[] = [];
  private readonly history: TickerItem[] = [];
  private readonly seenIds = new Set<string>();
  private readonly sources = new Map<TickerSourceId, TickerSource>();
  private readonly statuses = new Map<TickerSourceId, SourceStatus>();
  private readonly activityMap = new Map<number, number>();
  private readonly nowPlayingSource: NowPlayingSource;
  private readonly transitSource: TransitSource;
  private readonly sensorsSource: SensorsSource;
  private nowPlaying: NowPlayingState | null = null;
  private sensors: SensorReading[] = [];
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private sceneTimer: ReturnType<typeof setInterval> | null = null;
  private appliedSceneKey = '';
  private port = 3000;

  constructor(private readonly configStore: ConfigStore) {
    const initialIds: TickerSourceId[] = [
      'rss',
      'nhk-breaking',
      'wikipedia',
      'weather',
      'mastodon',
      'earthquake',
      'transit',
      'market',
      'nowplaying',
      'countdown',
      'sysmon',
      'calendar',
      'sensors',
      'clock',
      'push',
      'webhook',
    ];
    for (const id of initialIds) {
      const alwaysReady = id === 'clock' || id === 'push' || id === 'webhook';
      this.statuses.set(id, {
        id,
        connected: alwaysReady,
        active: alwaysReady,
        lastFetchAt: null,
        lastError: null,
        itemCount: 0,
      });
    }

    const ctx: SourceContext = {
      getConfig: () => this.configStore.get(),
      emitItems: (newItems) => this.handleIncomingItems(newItems),
      retainSourceKeyItems: (sourceKey, keepIds) => this.retainSourceKeyItems(sourceKey, keepIds),
      updateStatus: (partial) => this.updateStatus(partial),
      updateNowPlaying: (state) => this.setNowPlayingState(state),
      updateSensors: (readings) => this.setSensorsState(readings),
    };

    this.nowPlayingSource = new NowPlayingSource(ctx);
    this.transitSource = new TransitSource(ctx);
    this.sensorsSource = new SensorsSource(ctx);

    const instances: TickerSource[] = [
      new RssSource(ctx),
      new NhkBreakingSource(ctx),
      new WikipediaSource(ctx),
      new WeatherSource(ctx),
      new MastodonSource(ctx),
      new EarthquakeSource(ctx),
      this.transitSource,
      new MarketSource(ctx),
      this.nowPlayingSource,
      new CountdownSource(ctx),
      new SysmonSource(ctx),
      new CalendarSource(ctx),
      this.sensorsSource,
    ];

    for (const src of instances) {
      this.sources.set(src.id, src);
    }
  }

  setPort(port: number): void {
    this.port = port;
  }

  async init(): Promise<void> {
    await this.configStore.load();
  }

  start(): void {
    for (const src of this.sources.values()) {
      src.start();
    }
    if (!this.activityTimer) {
      this.activityTimer = setInterval(() => {
        this.broadcast({ type: 'activity:update', payload: this.getActivityBuckets() });
      }, 5000);
    }
    if (!this.sceneTimer) {
      this.sceneTimer = setInterval(() => {
        void this.checkSceneSchedule();
      }, 30_000);
    }
  }

  stop(): void {
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
    if (this.sceneTimer) {
      clearInterval(this.sceneTimer);
      this.sceneTimer = null;
    }
    for (const src of this.sources.values()) {
      src.stop();
    }
    for (const client of this.clients) {
      try {
        client.close();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
  }

  attachClient(ws: WebSocket): void {
    this.clients.add(ws);
    this.sendTo(ws, { type: 'init', payload: this.getState() });
    this.sendTo(ws, {
      type: 'item:new',
      payload: {
        id: `boot-oneshot-${Date.now()}`,
        source: 'push',
        badge: 'SYSTEM',
        text: 'CATHOBAR 接続完了 — ANOBAR8 / ANOBAR モダンティッカーシステム稼働中',
        color: '#38fad9',
        timestamp: Date.now(),
        priority: 'high',
        oneShot: true,
        breaking: false,
        icon: 'info',
      },
    });
    ws.on('close', () => {
      this.clients.delete(ws);
    });
    ws.on('error', () => {
      this.clients.delete(ws);
    });
  }

  getState(): ServerState {
    return {
      config: this.configStore.get(),
      items: [...this.items],
      activity: this.getActivityBuckets(),
      statuses: Array.from(this.statuses.values()),
      lanUrls: this.getLanUrls(),
      nowPlaying: this.nowPlaying,
      sensors: this.sensors,
    };
  }

  getConfig(): AppConfig {
    return this.configStore.get();
  }

  getHistory(): TickerItem[] {
    return [...this.history];
  }

  getSensors(): SensorReading[] {
    return [...this.sensors];
  }

  async updateConfig(patch: unknown): Promise<AppConfig> {
    const updated = await this.configStore.patch(patch);
    return this.applyUpdatedConfig(updated);
  }

  async replaceConfig(raw: unknown): Promise<AppConfig> {
    const updated = await this.configStore.replace(raw);
    return this.applyUpdatedConfig(updated);
  }

  async applyScene(sceneId: string): Promise<AppConfig | null> {
    const current = this.configStore.get();
    const scene = current.scenes.find((s) => s.id === sceneId);
    if (!scene) return null;

    const patch: PartialAppConfig = {};
    if (scene.activeChannel !== undefined) patch.activeChannel = scene.activeChannel;
    if (scene.rotationEnabled !== undefined) {
      patch.rotation = { enabled: scene.rotationEnabled };
    }
    const displayPatch: NonNullable<PartialAppConfig['display']> = {};
    if (scene.visualMode !== undefined) displayPatch.visualMode = scene.visualMode;
    if (scene.vfdPalette !== undefined) displayPatch.vfdPalette = scene.vfdPalette;
    if (scene.layoutMode !== undefined) displayPatch.layoutMode = scene.layoutMode;
    if (scene.brightness !== undefined) displayPatch.brightness = scene.brightness;
    if (scene.showSpectrumAnalyzer !== undefined) {
      displayPatch.showSpectrumAnalyzer = scene.showSpectrumAnalyzer;
    }
    if (scene.showClockOverlay !== undefined) {
      displayPatch.showClockOverlay = scene.showClockOverlay;
    }
    if (scene.showActivityGraph !== undefined) {
      displayPatch.showActivityGraph = scene.showActivityGraph;
    }
    if (Object.keys(displayPatch).length > 0) {
      patch.display = displayPatch;
    }

    return this.updateConfig(patch);
  }

  async refreshSource(id: TickerSourceId): Promise<boolean> {
    const src = this.sources.get(id);
    if (!src) return false;
    await src.refreshNow();
    return true;
  }

  getTransitLines(): TransitDiscoveredLine[] {
    return this.transitSource.getDiscoveredLines();
  }

  pushMessage(input: PushMessageInput): TickerItem {
    const item: TickerItem = {
      id: `push-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      source: 'push',
      badge: input.badge,
      text: input.text,
      color: input.color,
      timestamp: Date.now(),
      priority: input.priority,
      oneShot: input.oneShot,
      breaking: input.breaking,
      icon: input.icon ?? (input.breaking ? 'alert' : 'info'),
    };
    this.handleIncomingItems([item]);
    return item;
  }

  pushNowPlaying(input: NowPlayingPushInput): NowPlayingState {
    return this.nowPlayingSource.applyExternalPush(input);
  }

  pushSensorReading(input: SensorPushInput): SensorReading {
    return this.sensorsSource.applyExternalPush(input);
  }

  pushWebhook(
    preset: string,
    body: unknown,
    headers: Record<string, string | undefined> = {},
  ): TickerItem | null {
    const cfg = this.configStore.get().sources.webhook;
    if (!cfg.enabled) return null;
    const item = parseWebhookPayload(preset, body, headers);
    if (!item) return null;
    this.handleIncomingItems([item]);
    return item;
  }

  getLanUrls(): string[] {
    const urls: string[] = [];
    const nets = networkInterfaces();
    for (const entries of Object.values(nets)) {
      if (!entries) continue;
      for (const info of entries) {
        if (info.family === 'IPv4' && !info.internal) {
          urls.push(`http://${info.address}:${this.port}`);
        }
      }
    }
    return urls;
  }

  private applyUpdatedConfig(updated: AppConfig): AppConfig {
    const pruned = this.pruneStaleItems(updated);

    this.updateStatus({
      id: 'webhook',
      active: updated.sources.webhook.enabled,
      connected: updated.sources.webhook.enabled,
    });

    for (const src of this.sources.values()) {
      src.onConfigUpdate(updated);
    }
    this.broadcast({ type: 'config:update', payload: updated });
    if (pruned) {
      this.broadcast({ type: 'items:sync', payload: [...this.items] });
    }
    this.broadcast({ type: 'status:update', payload: Array.from(this.statuses.values()) });
    return updated;
  }

  private async checkSceneSchedule(): Promise<void> {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${hhmm}`;
    const cfg = this.configStore.get();
    for (const scene of cfg.scenes) {
      if (scene.scheduleStart && scene.scheduleStart === hhmm) {
        const key = `${scene.id}:${dayKey}`;
        if (this.appliedSceneKey === key) return;
        this.appliedSceneKey = key;
        await this.applyScene(scene.id);
        return;
      }
    }
  }

  private setNowPlayingState(state: NowPlayingState | null): void {
    const prevJson = JSON.stringify(this.nowPlaying);
    const nextJson = JSON.stringify(state);
    this.nowPlaying = state;
    if (prevJson !== nextJson) {
      this.broadcast({ type: 'nowplaying:update', payload: state });
    }
  }

  private setSensorsState(readings: SensorReading[]): void {
    const prevJson = JSON.stringify(this.sensors);
    const nextJson = JSON.stringify(readings);
    this.sensors = readings;
    if (prevJson !== nextJson) {
      this.broadcast({ type: 'sensors:update', payload: readings });
    }
  }

  private handleIncomingItems(incoming: TickerItem[]): void {
    const config = this.configStore.get();
    const fresh: TickerItem[] = [];
    let replacedAny = false;
    const existingNormalized = new Set(
      this.items.filter((i) => !i.replaceKey).map((i) => normalizeTitleForDedupe(i.text)),
    );

    for (const item of incoming) {
      if (!isItemEnabledBySources(item, config.sources)) continue;
      if (!item.oneShot && this.seenIds.has(item.id)) continue;

      const isExemptFromMute = item.breaking === true || item.source === 'push';
      if (
        !isExemptFromMute &&
        matchesMuteKeywords(item.text, item.badge, config.filtering.muteKeywords)
      ) {
        continue;
      }

      if (config.filtering.dedupeTitles && !item.oneShot && !item.replaceKey && !item.breaking) {
        const norm = normalizeTitleForDedupe(item.text);
        if (norm.length >= 6 && existingNormalized.has(norm)) {
          continue;
        }
        if (norm.length >= 6) {
          existingNormalized.add(norm);
        }
      }

      this.recordActivity(item.timestamp, 1);
      const status = this.statuses.get(item.source);
      if (status) {
        status.itemCount += 1;
        status.lastFetchAt = item.timestamp;
      }

      this.recordHistory(item);

      if (item.oneShot) {
        fresh.push(item);
        continue;
      }

      if (item.replaceKey) {
        for (let i = this.items.length - 1; i >= 0; i -= 1) {
          if (this.items[i]?.replaceKey === item.replaceKey) {
            this.seenIds.delete(this.items[i]!.id);
            this.items.splice(i, 1);
            replacedAny = true;
          }
        }
      }

      this.seenIds.add(item.id);
      this.items.push(item);
      fresh.push(item);
    }

    if (this.items.length > MAX_RECENT_ITEMS) {
      const removed = this.items.splice(0, this.items.length - MAX_RECENT_ITEMS);
      for (const old of removed) {
        this.seenIds.delete(old.id);
      }
    }

    if (fresh.length === 0) return;

    if (replacedAny) {
      this.broadcast({ type: 'items:sync', payload: [...this.items] });
      const alertTriggers = fresh.filter((x) => x.oneShot || x.breaking);
      if (alertTriggers.length > 0) {
        this.broadcast({ type: 'items:batch', payload: alertTriggers });
      }
    } else if (fresh.length === 1 && fresh[0]) {
      this.broadcast({ type: 'item:new', payload: fresh[0] });
    } else {
      this.broadcast({ type: 'items:batch', payload: fresh });
    }

    this.broadcast({ type: 'activity:update', payload: this.getActivityBuckets() });
    this.broadcast({ type: 'status:update', payload: Array.from(this.statuses.values()) });
  }

  private recordHistory(item: TickerItem): void {
    // Avoid flooding history with repetitive sysmon ticks when text didn't meaningfully change
    if (item.source === 'sysmon' && this.history[0]?.source === 'sysmon') {
      this.history[0] = item;
      return;
    }
    this.history.unshift(item);
    if (this.history.length > MAX_HISTORY_ITEMS) {
      this.history.length = MAX_HISTORY_ITEMS;
    }
  }

  private pruneStaleItems(config: AppConfig): boolean {
    const beforeLen = this.items.length;
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i]!;
      const disabled = !isItemEnabledBySources(item, config.sources);
      const muted =
        !item.breaking &&
        item.source !== 'push' &&
        matchesMuteKeywords(item.text, item.badge, config.filtering.muteKeywords);
      if (disabled || muted) {
        this.seenIds.delete(item.id);
        this.items.splice(i, 1);
      }
    }
    return this.items.length !== beforeLen;
  }

  private retainSourceKeyItems(sourceKey: string, keepIds: Set<string>): void {
    const beforeLen = this.items.length;
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i]!;
      if (item.sourceKey === sourceKey && !keepIds.has(item.id)) {
        this.seenIds.delete(item.id);
        this.items.splice(i, 1);
      }
    }
    if (this.items.length !== beforeLen) {
      this.broadcast({ type: 'items:sync', payload: [...this.items] });
    }
  }

  private updateStatus(partial: Partial<SourceStatus> & { id: TickerSourceId }): void {
    const existing = this.statuses.get(partial.id);
    if (!existing) return;
    this.statuses.set(partial.id, { ...existing, ...partial });
    this.broadcast({ type: 'status:update', payload: Array.from(this.statuses.values()) });
  }

  private recordActivity(timestamp: number, count: number): void {
    const bucketTs = Math.floor(timestamp / BUCKET_MS) * BUCKET_MS;
    this.activityMap.set(bucketTs, (this.activityMap.get(bucketTs) ?? 0) + count);
    const cutoff = bucketTs - MAX_BUCKETS * BUCKET_MS;
    for (const ts of this.activityMap.keys()) {
      if (ts < cutoff) {
        this.activityMap.delete(ts);
      }
    }
  }

  private getActivityBuckets(): ActivityBucket[] {
    const currentBucket = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
    const buckets: ActivityBucket[] = [];
    for (let i = MAX_BUCKETS - 1; i >= 0; i -= 1) {
      const ts = currentBucket - i * BUCKET_MS;
      buckets.push({
        timestamp: ts,
        count: this.activityMap.get(ts) ?? 0,
      });
    }
    return buckets;
  }

  private broadcast(msg: WsMessage): void {
    if (this.clients.size === 0) return;
    const serialized = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        client.send(serialized);
      }
    }
  }

  private sendTo(ws: WebSocket, msg: WsMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
