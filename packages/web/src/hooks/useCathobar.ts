import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_CONFIG,
  type ActivityBucket,
  type AppConfig,
  type BootGlyphStyle,
  type BootReplayInput,
  type BootSequenceMode,
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

export interface BootEvent {
  token: number;
  mode?: BootSequenceMode;
  glyphStyle?: BootGlyphStyle;
  isInitial?: boolean;
}

const AUTH_TOKEN_STORAGE_KEY = 'cathobar_auth_token';

function readStoredToken(): string {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeStoredToken(token: string): void {
  try {
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export interface CathobarHookResult {
  connected: boolean;
  authRequired: boolean;
  authError: boolean;
  config: AppConfig;
  items: TickerItem[];
  lastBatch: TickerItem[];
  history: TickerItem[];
  activity: ActivityBucket[];
  statuses: SourceStatus[];
  lanUrls: string[];
  nowPlaying: NowPlayingState | null;
  sensors: SensorReading[];
  bootEvent: BootEvent | null;
  setAuthToken: (token: string) => Promise<boolean>;
  clearAuthToken: () => void;
  updateConfig: (patch: PartialAppConfig) => Promise<void>;
  importConfig: (raw: unknown) => Promise<boolean>;
  exportConfig: () => Promise<boolean>;
  applyScene: (sceneId: string) => Promise<void>;
  pushMessage: (input: PushMessageInput) => Promise<void>;
  replayBoot: (input?: BootReplayInput) => Promise<void>;
  pushNowPlaying: (input: NowPlayingPushInput) => Promise<void>;
  pushSensor: (input: SensorPushInput) => Promise<void>;
  refreshSource: (id: TickerSourceId) => Promise<void>;
  refreshHistory: () => Promise<void>;
}

export function useCathobar(): CathobarHookResult {
  const [connected, setConnected] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [items, setItems] = useState<TickerItem[]>([]);
  const [lastBatch, setLastBatch] = useState<TickerItem[]>([]);
  const [history, setHistory] = useState<TickerItem[]>([]);
  const [activity, setActivity] = useState<ActivityBucket[]>([]);
  const [statuses, setStatuses] = useState<SourceStatus[]>([]);
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [nowPlaying, setNowPlaying] = useState<NowPlayingState | null>(null);
  const [sensors, setSensors] = useState<SensorReading[]>([]);
  const [bootEvent, setBootEvent] = useState<BootEvent | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const bootTokenRef = useRef(0);
  const hasInitialBootedRef = useRef(false);
  const tokenRef = useRef<string>(readStoredToken());

  const buildAuthHeaders = useCallback((extra?: Record<string, string>): Record<string, string> => {
    const headers: Record<string, string> = { ...(extra ?? {}) };
    if (tokenRef.current) {
      headers['X-Cathobar-Token'] = tokenRef.current;
    }
    return headers;
  }, []);

  const checkAuthStatus = useCallback(async (tokenOverride?: string): Promise<boolean> => {
    const candidate = tokenOverride !== undefined ? tokenOverride.trim() : tokenRef.current;
    try {
      const headers: Record<string, string> = {};
      if (candidate) {
        headers['X-Cathobar-Token'] = candidate;
      }
      const res = await fetch('/api/auth/status', { headers });
      if (!res.ok) return false;
      const json = (await res.json()) as { authRequired?: boolean; authenticated?: boolean };
      const required = Boolean(json.authRequired);
      const authed = Boolean(json.authenticated);
      setAuthRequired(required);
      setAuthError(required && !authed);
      return !required || authed;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    void checkAuthStatus();
  }, [checkAuthStatus]);

  const setAuthToken = useCallback(
    async (raw: string): Promise<boolean> => {
      const trimmed = raw.trim();
      if (!trimmed) {
        setAuthError(authRequired);
        return false;
      }
      const ok = await checkAuthStatus(trimmed);
      if (ok) {
        tokenRef.current = trimmed;
        writeStoredToken(trimmed);
        setAuthError(false);
        return true;
      }
      setAuthError(true);
      return false;
    },
    [authRequired, checkAuthStatus],
  );

  const clearAuthToken = useCallback(() => {
    tokenRef.current = '';
    writeStoredToken('');
    setAuthError(authRequired);
  }, [authRequired]);

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
              if (!hasInitialBootedRef.current) {
                hasInitialBootedRef.current = true;
                bootTokenRef.current += 1;
                setBootEvent({ token: bootTokenRef.current, isInitial: true });
              }
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
            case 'boot:replay':
              bootTokenRef.current += 1;
              setBootEvent({
                token: bootTokenRef.current,
                mode: msg.payload.mode,
                glyphStyle: msg.payload.glyphStyle,
                isInitial: false,
              });
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

  const updateConfig = useCallback(
    async (patch: PartialAppConfig) => {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(patch),
      });
      if (res.status === 401) {
        setAuthError(true);
        return;
      }
      if (res.ok) {
        const updated = (await res.json()) as AppConfig;
        setConfig(updated);
      }
    },
    [buildAuthHeaders],
  );

  const importConfig = useCallback(
    async (raw: unknown): Promise<boolean> => {
      const res = await fetch('/api/config/import', {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(raw),
      });
      if (res.status === 401) {
        setAuthError(true);
        return false;
      }
      if (res.ok) {
        const updated = (await res.json()) as AppConfig;
        setConfig(updated);
        return true;
      }
      return false;
    },
    [buildAuthHeaders],
  );

  const exportConfig = useCallback(async (): Promise<boolean> => {
    const res = await fetch('/api/config/export', {
      headers: buildAuthHeaders(),
    });
    if (res.status === 401) {
      setAuthError(true);
      return false;
    }
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cathobar-config.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  }, [buildAuthHeaders]);

  const applyScene = useCallback(
    async (sceneId: string) => {
      const res = await fetch(`/api/scenes/${encodeURIComponent(sceneId)}/apply`, {
        method: 'POST',
        headers: buildAuthHeaders(),
      });
      if (res.status === 401) {
        setAuthError(true);
        return;
      }
      if (res.ok) {
        const updated = (await res.json()) as AppConfig;
        setConfig(updated);
      }
    },
    [buildAuthHeaders],
  );

  const pushMessage = useCallback(
    async (input: PushMessageInput) => {
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(input),
      });
      if (res.status === 401) {
        setAuthError(true);
      }
    },
    [buildAuthHeaders],
  );

  const replayBoot = useCallback(
    async (input?: BootReplayInput) => {
      const res = await fetch('/api/boot/replay', {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(input ?? {}),
      });
      if (res.status === 401) {
        setAuthError(true);
      }
    },
    [buildAuthHeaders],
  );

  const pushNowPlaying = useCallback(
    async (input: NowPlayingPushInput) => {
      const res = await fetch('/api/now-playing', {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(input),
      });
      if (res.status === 401) {
        setAuthError(true);
      }
    },
    [buildAuthHeaders],
  );

  const pushSensor = useCallback(
    async (input: SensorPushInput) => {
      const res = await fetch('/api/sensors', {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(input),
      });
      if (res.status === 401) {
        setAuthError(true);
      }
    },
    [buildAuthHeaders],
  );

  const refreshSource = useCallback(
    async (id: TickerSourceId) => {
      const res = await fetch(`/api/sources/${id}/refresh`, {
        method: 'POST',
        headers: buildAuthHeaders(),
      });
      if (res.status === 401) {
        setAuthError(true);
      }
    },
    [buildAuthHeaders],
  );

  return {
    connected,
    authRequired,
    authError,
    config,
    items,
    lastBatch,
    history,
    activity,
    statuses,
    lanUrls,
    nowPlaying,
    sensors,
    bootEvent,
    setAuthToken,
    clearAuthToken,
    updateConfig,
    importConfig,
    exportConfig,
    applyScene,
    pushMessage,
    replayBoot,
    pushNowPlaying,
    pushSensor,
    refreshSource,
    refreshHistory,
  };
}
