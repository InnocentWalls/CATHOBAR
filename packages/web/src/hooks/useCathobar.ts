import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_CONFIG,
  type ActivityBucket,
  type AppConfig,
  type NowPlayingPushInput,
  type NowPlayingState,
  type PartialAppConfig,
  type PushMessageInput,
  type SensorPushInput,
  type SensorReading,
  type SourceStatus,
  type TickerItem,
  type TickerSourceId,
  type WsMessage,
} from '@cathobar/shared';

export interface CathobarHookResult {
  connected: boolean;
  config: AppConfig;
  items: TickerItem[];
  lastBatch: TickerItem[];
  history: TickerItem[];
  activity: ActivityBucket[];
  statuses: SourceStatus[];
  lanUrls: string[];
  nowPlaying: NowPlayingState | null;
  sensors: SensorReading[];
  updateConfig: (patch: PartialAppConfig) => Promise<void>;
  importConfig: (raw: unknown) => Promise<boolean>;
  applyScene: (sceneId: string) => Promise<void>;
  pushMessage: (input: PushMessageInput) => Promise<void>;
  pushNowPlaying: (input: NowPlayingPushInput) => Promise<void>;
  pushSensor: (input: SensorPushInput) => Promise<void>;
  refreshSource: (id: TickerSourceId) => Promise<void>;
  refreshHistory: () => Promise<void>;
}

export function useCathobar(): CathobarHookResult {
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [items, setItems] = useState<TickerItem[]>([]);
  const [lastBatch, setLastBatch] = useState<TickerItem[]>([]);
  const [history, setHistory] = useState<TickerItem[]>([]);
  const [activity, setActivity] = useState<ActivityBucket[]>([]);
  const [statuses, setStatuses] = useState<SourceStatus[]>([]);
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingState | null>(null);
  const [sensors, setSensors] = useState<SensorReading[]>([]);
  const reconnectTimer = useRef<number | null>(null);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const json = (await res.json()) as { items?: TickerItem[] };
        if (Array.isArray(json.items)) {
          setHistory(json.items);
        }
      }
    } catch {
      // ignore network errors
    }
  }, []);

  useEffect(() => {
    let active = true;
    let ws: WebSocket | null = null;
    let backoff = 1000;

    const prependHistory = (incoming: TickerItem[]) => {
      setHistory((prev) => {
        const existingIds = new Set(prev.map((x) => x.id));
        const fresh = incoming.filter((x) => !existingIds.has(x.id));
        if (fresh.length === 0) return prev;
        return [...fresh.reverse(), ...prev].slice(0, 120);
      });
    };

    const connect = () => {
      if (!active) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!active) return;
        setConnected(true);
        backoff = 1000;
        void refreshHistory();
      };

      ws.onmessage = (ev) => {
        if (!active) return;
        try {
          const msg = JSON.parse(String(ev.data)) as WsMessage;
          switch (msg.type) {
            case 'init':
              setConfig(msg.payload.config);
              setItems(msg.payload.items.filter((i) => !i.oneShot));
              setActivity(msg.payload.activity);
              setStatuses(msg.payload.statuses);
              setLanUrls(msg.payload.lanUrls);
              setNowPlaying(msg.payload.nowPlaying ?? null);
              setSensors(msg.payload.sensors ?? []);
              break;
            case 'config:update':
              setConfig(msg.payload);
              break;
            case 'item:new': {
              if (!msg.payload.oneShot) {
                setItems((prev) => [...prev.slice(-119), msg.payload]);
              }
              setLastBatch([msg.payload]);
              prependHistory([msg.payload]);
              break;
            }
            case 'items:batch': {
              const persistent = msg.payload.filter((i) => !i.oneShot);
              if (persistent.length > 0) {
                setItems((prev) => {
                  const existingIds = new Set(prev.map((p) => p.id));
                  const next = persistent.filter((p) => !existingIds.has(p.id));
                  return next.length > 0 ? [...prev, ...next].slice(-120) : prev;
                });
              }
              setLastBatch(msg.payload);
              prependHistory(msg.payload);
              break;
            }
            case 'items:sync':
              setItems(msg.payload.filter((i) => !i.oneShot));
              break;
            case 'activity:update':
              setActivity(msg.payload);
              break;
            case 'status:update':
              setStatuses(msg.payload);
              break;
            case 'nowplaying:update':
              setNowPlaying(msg.payload);
              break;
            case 'sensors:update':
              setSensors(msg.payload);
              break;
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!active) return;
        setConnected(false);
        const delay = backoff;
        backoff = Math.min(15000, backoff * 1.5);
        reconnectTimer.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current);
      }
      ws?.close();
    };
  }, [refreshHistory]);

  const updateConfig = useCallback(async (patch: PartialAppConfig) => {
    const res = await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = (await res.json()) as AppConfig;
      setConfig(updated);
    }
  }, []);

  const importConfig = useCallback(async (raw: unknown): Promise<boolean> => {
    const res = await fetch('/api/config/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(raw),
    });
    if (res.ok) {
      const updated = (await res.json()) as AppConfig;
      setConfig(updated);
      return true;
    }
    return false;
  }, []);

  const applyScene = useCallback(async (sceneId: string) => {
    const res = await fetch(`/api/scenes/${encodeURIComponent(sceneId)}/apply`, {
      method: 'POST',
    });
    if (res.ok) {
      const updated = (await res.json()) as AppConfig;
      setConfig(updated);
    }
  }, []);

  const pushMessage = useCallback(async (input: PushMessageInput) => {
    await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }, []);

  const pushNowPlaying = useCallback(async (input: NowPlayingPushInput) => {
    await fetch('/api/now-playing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }, []);

  const pushSensor = useCallback(async (input: SensorPushInput) => {
    await fetch('/api/sensors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }, []);

  const refreshSource = useCallback(async (id: TickerSourceId) => {
    await fetch(`/api/sources/${id}/refresh`, { method: 'POST' });
  }, []);

  return {
    connected,
    config,
    items,
    lastBatch,
    history,
    activity,
    statuses,
    lanUrls,
    nowPlaying,
    sensors,
    updateConfig,
    importConfig,
    applyScene,
    pushMessage,
    pushNowPlaying,
    pushSensor,
    refreshSource,
    refreshHistory,
  };
}
