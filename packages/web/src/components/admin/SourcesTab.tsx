import { useEffect, useState, type FormEvent } from 'react';
import {
  CITY_PRESETS,
  EARTHQUAKE_SCALE_OPTIONS,
  MARKET_SYMBOL_PRESETS,
  MASTODON_INSTANCE_PRESETS,
  TRANSIT_OPERATOR_GROUPS,
  type AppConfig,
  type CalendarFeedConfig,
  type CountdownEvent,
  type MarketSymbolConfig,
  type MastodonStreamType,
  type NowPlayingPushInput,
  type NowPlayingState,
  type PartialAppConfig,
  type PushMessageInput,
  type RssFeedConfig,
  type SensorPushInput,
  type SensorReading,
  type SourceStatus,
  type TickerSourceId,
  type TransitDiscoveredLine,
  type WeatherLocation,
} from '@cathobar/shared';
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  Cpu,
  Music,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Thermometer,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { ToggleChip } from './AdminControls.js';

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

interface SourcesTabProps {
  connected: boolean;
  config: AppConfig;
  statuses: SourceStatus[];
  nowPlaying: NowPlayingState | null;
  sensors: SensorReading[];
  updateConfig: (patch: PartialAppConfig) => Promise<void>;
  pushMessage: (input: PushMessageInput) => Promise<void>;
  pushNowPlaying: (input: NowPlayingPushInput) => Promise<void>;
  pushSensor: (input: SensorPushInput) => Promise<void>;
  refreshSource: (id: TickerSourceId) => Promise<void>;
}

export function SourcesTab({
  connected,
  config,
  statuses,
  nowPlaying,
  sensors,
  updateConfig,
  pushMessage,
  pushNowPlaying,
  pushSensor,
  refreshSource,
}: SourcesTabProps) {
  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedColor, setNewFeedColor] = useState('#38bdf8');

  const [cityQuery, setCityQuery] = useState('');
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);

  const [kwInput, setKwInput] = useState('');
  const [lineFilterInput, setLineFilterInput] = useState('');
  const [discoveredLines, setDiscoveredLines] = useState<TransitDiscoveredLine[]>([]);
  const [transitSearch, setTransitSearch] = useState('');

  const [newSymbolCode, setNewSymbolCode] = useState('');
  const [newSymbolLabel, setNewSymbolLabel] = useState('');

  const [npTitle, setNpTitle] = useState('');
  const [npArtist, setNpArtist] = useState('');

  const [cdTitle, setCdTitle] = useState('');
  const [cdTarget, setCdTarget] = useState('');
  const [cdAlert, setCdAlert] = useState(true);

  const [calName, setCalName] = useState('');
  const [calUrl, setCalUrl] = useState('');

  const [senName, setSenName] = useState('リビング');
  const [senTemp, setSenTemp] = useState('23.5');
  const [senHum, setSenHum] = useState('48');
  const [senCo2, setSenCo2] = useState('680');
  const [sbDeviceInput, setSbDeviceInput] = useState('');

  const transitLastFetchAt = statuses.find((s) => s.id === 'transit')?.lastFetchAt ?? null;

  useEffect(() => {
    let cancelled = false;
    const loadLines = async () => {
      try {
        const res = await fetch('/api/transit/lines');
        if (!res.ok) return;
        const json = (await res.json()) as { lines?: TransitDiscoveredLine[] };
        if (!cancelled && Array.isArray(json.lines)) {
          setDiscoveredLines(json.lines);
        }
      } catch {
        // ignore network errors
      }
    };
    void loadLines();
    return () => {
      cancelled = true;
    };
  }, [connected, transitLastFetchAt]);

  const toggleTransitLine = (lineName: string) => {
    const current = config.sources.transit.lineFilter;
    const next = current.includes(lineName)
      ? current.filter((x) => x !== lineName)
      : [...current, lineName];
    void updateConfig({ sources: { transit: { lineFilter: next } } });
  };

  const toggleTransitGroup = (lineNames: string[], selectAll: boolean) => {
    const current = config.sources.transit.lineFilter;
    const targetSet = new Set(lineNames);
    const next = selectAll
      ? Array.from(new Set([...current, ...lineNames]))
      : current.filter((x) => !targetSet.has(x));
    void updateConfig({ sources: { transit: { lineFilter: next } } });
  };

  const handleAddFeed = async (e: FormEvent) => {
    e.preventDefault();
    if (!newFeedName.trim() || !newFeedUrl.trim()) return;
    const newFeed: RssFeedConfig = {
      id: `feed-${Date.now()}`,
      name: newFeedName.trim(),
      url: newFeedUrl.trim(),
      enabled: true,
      color: newFeedColor,
    };
    await updateConfig({
      sources: { rss: { feeds: [...config.sources.rss.feeds, newFeed] } },
    });
    setNewFeedName('');
    setNewFeedUrl('');
  };

  const handleAddWeatherLocation = async (
    cityName: string,
    latitude: number,
    longitude: number,
    jmaAreaCode?: string,
  ) => {
    const exists = config.sources.weather.locations.some(
      (l) => l.cityName === cityName && Math.abs(l.latitude - latitude) < 0.05,
    );
    if (exists) return;

    const nextLoc: WeatherLocation = {
      id: `loc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      cityName,
      latitude,
      longitude,
      enabled: true,
      jmaAreaCode,
    };
    await updateConfig({
      sources: { weather: { locations: [...config.sources.weather.locations, nextLoc] } },
    });
  };

  const handleCitySearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!cityQuery.trim()) return;
    setGeoLoading(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(cityQuery.trim())}`);
      if (res.ok) {
        const json = (await res.json()) as { results: GeoResult[] };
        setGeoResults(json.results ?? []);
      }
    } finally {
      setGeoLoading(false);
    }
  };

  const handleAddMarketSymbol = async (symbol: string, label: string, presetId?: string) => {
    const cleanSymbol = symbol.trim();
    const cleanLabel = label.trim() || cleanSymbol;
    if (!cleanSymbol) return;
    const exists = config.sources.market.symbols.some(
      (s) => s.symbol.toLowerCase() === cleanSymbol.toLowerCase(),
    );
    if (exists) return;
    const next: MarketSymbolConfig = {
      id: presetId ?? `sym-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      symbol: cleanSymbol,
      label: cleanLabel,
      enabled: true,
    };
    await updateConfig({
      sources: { market: { symbols: [...config.sources.market.symbols, next] } },
    });
  };

  const handleAddCountdown = async (e: FormEvent) => {
    e.preventDefault();
    if (!cdTitle.trim() || !cdTarget) return;
    const iso = new Date(cdTarget).toISOString();
    const nextEv: CountdownEvent = {
      id: `cd-${Date.now()}`,
      title: cdTitle.trim(),
      targetIso: iso,
      enabled: true,
      alertOnComplete: cdAlert,
    };
    await updateConfig({
      sources: { countdown: { events: [...config.sources.countdown.events, nextEv] } },
    });
    setCdTitle('');
    setCdTarget('');
  };

  const handleAddCalendarFeed = async (e: FormEvent) => {
    e.preventDefault();
    if (!calName.trim() || !calUrl.trim()) return;
    const nextFeed: CalendarFeedConfig = {
      id: `cal-${Date.now()}`,
      name: calName.trim(),
      url: calUrl.trim(),
      enabled: true,
      color: '#a78bfa',
    };
    await updateConfig({
      sources: {
        calendar: { feeds: [...config.sources.calendar.feeds, nextFeed] },
      },
    });
    setCalName('');
    setCalUrl('');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Disaster (P2PQuake / NHK Breaking) & Transit (ODPT) */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
            <ShieldAlert className="h-4 w-4" />
            防災・速報 (P2P地震情報 / NHK) & 鉄道運行情報 (ODPT)
          </h2>
        </div>

        {/* NHK Breaking */}
        <div className="space-y-2.5 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white">NHK ニュース速報 (JUST IN)</span>
            <div className="flex flex-wrap items-center gap-2">
              <ToggleChip
                label="有効"
                checked={config.sources.nhkBreaking.enabled}
                onChange={(v) => void updateConfig({ sources: { nhkBreaking: { enabled: v } } })}
              />
              <button
                type="button"
                onClick={() => void refreshSource('nhk-breaking')}
                className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
              >
                <RefreshCw className="h-3 w-3" />
                確認
              </button>
              <button
                type="button"
                onClick={() =>
                  void pushMessage({
                    badge: 'NHK速報',
                    text: '【テスト速報】NHKニュース速報アラート割り込みテスト',
                    color: '#ff3b30',
                    priority: 'high',
                    oneShot: true,
                    breaking: true,
                    icon: 'alert',
                  })
                }
                className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/15 px-2 py-1 text-xs text-red-200 hover:bg-red-500/25"
              >
                <AlertTriangle className="h-3 w-3" />
                テスト
              </button>
            </div>
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-slate-400">監視間隔 (秒: 30〜600)</span>
              <input
                type="number"
                min={30}
                max={600}
                value={config.sources.nhkBreaking.pollIntervalSec}
                onChange={(e) =>
                  void updateConfig({
                    sources: {
                      nhkBreaking: {
                        pollIntervalSec: Math.min(600, Math.max(30, Number(e.target.value) || 60)),
                      },
                    },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">速報有効時間 (分: 5〜180)</span>
              <input
                type="number"
                min={5}
                max={180}
                value={config.sources.nhkBreaking.maxItemAgeMinutes}
                onChange={(e) =>
                  void updateConfig({
                    sources: {
                      nhkBreaking: {
                        maxItemAgeMinutes: Math.min(180, Math.max(5, Number(e.target.value) || 30)),
                      },
                    },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
              />
            </label>
          </div>

          <label className="block space-y-1 text-xs">
            <span className="text-slate-400">速報フィード URL</span>
            <input
              type="url"
              value={config.sources.nhkBreaking.url}
              onChange={(e) =>
                void updateConfig({ sources: { nhkBreaking: { url: e.target.value } } })
              }
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-[11px]"
            />
          </label>
        </div>

        {/* Earthquake */}
        <div className="space-y-2.5 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white">
              地震・津波・緊急地震速報 (P2P地震情報)
            </span>
            <div className="flex items-center gap-2">
              <ToggleChip
                label="有効"
                checked={config.sources.earthquake.enabled}
                onChange={(v) => void updateConfig({ sources: { earthquake: { enabled: v } } })}
              />
              <button
                type="button"
                onClick={() => void refreshSource('earthquake')}
                className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-slate-400">表示する最小震度</span>
              <select
                value={config.sources.earthquake.minScale}
                onChange={(e) =>
                  void updateConfig({
                    sources: { earthquake: { minScale: Number(e.target.value) } },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
              >
                {EARTHQUAKE_SCALE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">緊急割り込み発動震度</span>
              <select
                value={config.sources.earthquake.breakingMinScale}
                onChange={(e) =>
                  void updateConfig({
                    sources: { earthquake: { breakingMinScale: Number(e.target.value) } },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
              >
                {EARTHQUAKE_SCALE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ToggleChip
            label="津波情報を含める"
            checked={config.sources.earthquake.includeTsunami}
            onChange={(v) => void updateConfig({ sources: { earthquake: { includeTsunami: v } } })}
          />
        </div>

        {/* Transit */}
        <div className="space-y-2.5 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white">鉄道運行情報 (ODPT / カスタムRSS)</span>
            <div className="flex items-center gap-2">
              <ToggleChip
                label="有効"
                checked={config.sources.transit.enabled}
                onChange={(v) => void updateConfig({ sources: { transit: { enabled: v } } })}
              />
              <button
                type="button"
                onClick={() => void refreshSource('transit')}
                className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <ToggleChip
              label="ODPT 公開API (都営線等)"
              checked={config.sources.transit.usePublicOdpt}
              onChange={(v) => void updateConfig({ sources: { transit: { usePublicOdpt: v } } })}
            />
            <ToggleChip
              label="遅延・見合わせ時のみ表示"
              checked={config.sources.transit.onlyProblems}
              onChange={(v) => void updateConfig({ sources: { transit: { onlyProblems: v } } })}
            />
            <ToggleChip
              label="運転見合わせ時に緊急速報"
              checked={config.sources.transit.breakingOnSuspension}
              onChange={(v) =>
                void updateConfig({ sources: { transit: { breakingOnSuspension: v } } })
              }
            />
          </div>

          <label className="block space-y-1 text-xs">
            <span className="text-slate-400">ODPT Consumer Key (任意: JR・東京メトロ等の取得用)</span>
            <input
              type="password"
              value={config.sources.transit.odptToken}
              onChange={(e) =>
                void updateConfig({ sources: { transit: { odptToken: e.target.value } } })
              }
              placeholder="api.odpt.org で取得したキー"
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
            />
          </label>

          <div className="space-y-2.5 border-t border-slate-800 pt-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-300">
                {config.sources.transit.lineFilter.length > 0
                  ? `選択中: ${config.sources.transit.lineFilter.length}路線のみ監視`
                  : '未選択: 全路線を監視中（チェックで絞り込み）'}
              </span>
              {config.sources.transit.lineFilter.length > 0 && (
                <button
                  type="button"
                  onClick={() => void updateConfig({ sources: { transit: { lineFilter: [] } } })}
                  className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800"
                >
                  すべて解除（全路線）
                </button>
              )}
            </div>

            <input
              type="text"
              value={transitSearch}
              onChange={(e) => setTransitSearch(e.target.value)}
              placeholder="路線名で検索... (例: 山手, 浅草, 東急)"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            />

            {discoveredLines.length > 0 &&
              (() => {
                const query = transitSearch.trim().toLowerCase();
                const visibleDiscovered = query
                  ? discoveredLines.filter(
                      (l) =>
                        l.name.toLowerCase().includes(query) ||
                        l.operator.toLowerCase().includes(query) ||
                        l.id.toLowerCase().includes(query),
                    )
                  : discoveredLines;
                if (visibleDiscovered.length === 0) return null;
                return (
                  <div className="space-y-1.5 rounded-lg border border-slate-800/80 bg-slate-900/50 p-2.5">
                    <div className="flex items-center justify-between text-[11px] text-cyan-300">
                      <span>取得中の路線 (ODPT: {visibleDiscovered.length}路線)</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            toggleTransitGroup(
                              visibleDiscovered.map((l) => l.name),
                              true,
                            )
                          }
                          className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
                        >
                          全選択
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            toggleTransitGroup(
                              visibleDiscovered.map((l) => l.name),
                              false,
                            )
                          }
                          className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
                        >
                          解除
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3">
                      {visibleDiscovered.map((line) => {
                        const checked = config.sources.transit.lineFilter.includes(line.name);
                        return (
                          <label
                            key={line.railwayKey}
                            title={line.statusText}
                            className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs ${
                              checked
                                ? 'border-amber-400/60 bg-amber-500/15 text-amber-100'
                                : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTransitLine(line.name)}
                            />
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                line.severe
                                  ? 'bg-red-500'
                                  : line.normal
                                    ? 'bg-emerald-400'
                                    : 'bg-amber-400'
                              }`}
                            />
                            <span className="truncate">{line.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

            <div className="space-y-1.5">
              <div className="text-[11px] text-slate-400">事業者別プリセット（チェックで選択）</div>
              {TRANSIT_OPERATOR_GROUPS.map((group) => {
                const query = transitSearch.trim().toLowerCase();
                const visibleLines = query
                  ? group.lines.filter(
                      (l) =>
                        l.name.toLowerCase().includes(query) ||
                        group.label.toLowerCase().includes(query),
                    )
                  : group.lines;
                if (query && visibleLines.length === 0) return null;

                const groupNames = visibleLines.map((l) => l.name);
                const selectedInGroup = groupNames.filter((n) =>
                  config.sources.transit.lineFilter.includes(n),
                ).length;
                const allGroupSelected =
                  groupNames.length > 0 && selectedInGroup === groupNames.length;

                return (
                  <details
                    key={group.id}
                    open={Boolean(query) || group.id === 'toei'}
                    className="rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-1.5"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-0.5 text-xs">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-semibold text-slate-200">{group.label}</span>
                        <span className="text-[10px] text-slate-400">{group.note}</span>
                        {selectedInGroup > 0 && (
                          <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] text-amber-200">
                            {selectedInGroup}/{groupNames.length}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          toggleTransitGroup(groupNames, !allGroupSelected);
                        }}
                        className="shrink-0 rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-800"
                      >
                        {allGroupSelected ? '解除' : '全選択'}
                      </button>
                    </summary>
                    <div className="mt-2 grid grid-cols-1 gap-1.5 pb-1 sm:grid-cols-2 md:grid-cols-3">
                      {visibleLines.map((preset) => {
                        const checked = config.sources.transit.lineFilter.includes(preset.name);
                        return (
                          <label
                            key={preset.name}
                            className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs ${
                              checked
                                ? 'border-amber-400/60 bg-amber-500/15 text-amber-100'
                                : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTransitLine(preset.name)}
                            />
                            <span className="truncate">{preset.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const ln = lineFilterInput.trim();
              if (!ln) return;
              if (!config.sources.transit.lineFilter.includes(ln)) {
                void updateConfig({
                  sources: {
                    transit: { lineFilter: [...config.sources.transit.lineFilter, ln] },
                  },
                });
              }
              setLineFilterInput('');
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={lineFilterInput}
              onChange={(e) => setLineFilterInput(e.target.value)}
              placeholder="自由入力フィルタ追加 (例: 湘南新宿)"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
            >
              追加
            </button>
          </form>
        </div>
      </section>

      {/* Market, Countdown, Calendar & Now Playing */}
      <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        {/* Market */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <TrendingUp className="h-4 w-4" />
              市況・為替・株価 ({config.sources.market.symbols.length}銘柄)
            </h2>
            <div className="flex items-center gap-2">
              <ToggleChip
                label="有効"
                checked={config.sources.market.enabled}
                onChange={(v) => void updateConfig({ sources: { market: { enabled: v } } })}
              />
              <button
                type="button"
                onClick={() => void refreshSource('market')}
                className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {config.sources.market.symbols.map((sym) => (
              <div
                key={sym.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs"
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sym.enabled}
                    onChange={(e) => {
                      const next = config.sources.market.symbols.map((s) =>
                        s.id === sym.id ? { ...s, enabled: e.target.checked } : s,
                      );
                      void updateConfig({ sources: { market: { symbols: next } } });
                    }}
                  />
                  <span className="font-semibold text-white">{sym.label}</span>
                  <span className="font-mono text-[10px] text-slate-400">{sym.symbol}</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const next = config.sources.market.symbols.filter((s) => s.id !== sym.id);
                    void updateConfig({ sources: { market: { symbols: next } } });
                  }}
                  className="text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs">
            {MARKET_SYMBOL_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void handleAddMarketSymbol(p.symbol, p.label, p.id)}
                className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5 text-slate-300 hover:border-cyan-400"
              >
                + {p.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleAddMarketSymbol(newSymbolCode, newSymbolLabel);
              setNewSymbolCode('');
              setNewSymbolLabel('');
            }}
            className="flex flex-wrap gap-2"
          >
            <input
              type="text"
              value={newSymbolCode}
              onChange={(e) => setNewSymbolCode(e.target.value)}
              placeholder="シンボル (例: 7203.T)"
              className="w-36 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs"
            />
            <input
              type="text"
              value={newSymbolLabel}
              onChange={(e) => setNewSymbolLabel(e.target.value)}
              placeholder="表示名 (例: トヨタ)"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
              追加
            </button>
          </form>
        </div>

        {/* Countdown */}
        <div className="space-y-2.5 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <CalendarClock className="h-4 w-4" />
              カウントダウン ({config.sources.countdown.events.length}件)
            </h2>
            <ToggleChip
              label="有効"
              checked={config.sources.countdown.enabled}
              onChange={(v) => void updateConfig({ sources: { countdown: { enabled: v } } })}
            />
          </div>

          <div className="space-y-1.5">
            {config.sources.countdown.events.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs"
              >
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={ev.enabled}
                    onChange={(e) => {
                      const next = config.sources.countdown.events.map((x) =>
                        x.id === ev.id ? { ...x, enabled: e.target.checked } : x,
                      );
                      void updateConfig({ sources: { countdown: { events: next } } });
                    }}
                  />
                  <span className="truncate font-semibold text-white">{ev.title}</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {new Date(ev.targetIso).toLocaleString('ja-JP')}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const next = config.sources.countdown.events.filter((x) => x.id !== ev.id);
                    void updateConfig({ sources: { countdown: { events: next } } });
                  }}
                  className="text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={(e) => void handleAddCountdown(e)} className="flex flex-wrap gap-2">
            <input
              type="text"
              value={cdTitle}
              onChange={(e) => setCdTitle(e.target.value)}
              placeholder="イベント名"
              className="min-w-32 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <input
              type="datetime-local"
              value={cdTarget}
              onChange={(e) => setCdTarget(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs"
            />
            <ToggleChip label="到達時速報" checked={cdAlert} onChange={setCdAlert} />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
              追加
            </button>
          </form>
        </div>

        {/* iCal Calendar */}
        <div className="space-y-2.5 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <Calendar className="h-4 w-4" />
              iCal カレンダー連携 (.ics)
            </h2>
            <div className="flex items-center gap-2">
              <ToggleChip
                label="有効"
                checked={config.sources.calendar.enabled}
                onChange={(v) => void updateConfig({ sources: { calendar: { enabled: v } } })}
              />
              <button
                type="button"
                onClick={() => void refreshSource('calendar')}
                className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-slate-400">表示対象時間 (時間先まで)</span>
              <input
                type="number"
                min={1}
                max={168}
                value={config.sources.calendar.windowHours}
                onChange={(e) =>
                  void updateConfig({
                    sources: {
                      calendar: { windowHours: Math.max(1, Number(e.target.value) || 24) },
                    },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">開始前アラート (分 / 0で無効)</span>
              <input
                type="number"
                min={0}
                max={60}
                value={config.sources.calendar.alertBeforeMinutes}
                onChange={(e) =>
                  void updateConfig({
                    sources: {
                      calendar: { alertBeforeMinutes: Math.max(0, Number(e.target.value) || 0) },
                    },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
              />
            </label>
          </div>

          {config.sources.calendar.feeds.map((feed) => (
            <div
              key={feed.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs"
            >
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  type="checkbox"
                  checked={feed.enabled}
                  onChange={(e) => {
                    const next = config.sources.calendar.feeds.map((f) =>
                      f.id === feed.id ? { ...f, enabled: e.target.checked } : f,
                    );
                    void updateConfig({ sources: { calendar: { feeds: next } } });
                  }}
                />
                <span className="font-semibold text-white">{feed.name}</span>
                <span className="truncate font-mono text-[10px] text-slate-400">{feed.url}</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  const next = config.sources.calendar.feeds.filter((f) => f.id !== feed.id);
                  void updateConfig({ sources: { calendar: { feeds: next } } });
                }}
                className="text-slate-400 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <form onSubmit={(e) => void handleAddCalendarFeed(e)} className="flex flex-wrap gap-2">
            <input
              type="text"
              value={calName}
              onChange={(e) => setCalName(e.target.value)}
              placeholder="予定名 (例: Google)"
              className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <input
              type="url"
              value={calUrl}
              onChange={(e) => setCalUrl(e.target.value)}
              placeholder="https://calendar.google.com/.../basic.ics"
              className="min-w-40 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
              追加
            </button>
          </form>
        </div>

        {/* Now Playing */}
        <div className="space-y-2.5 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <Music className="h-4 w-4" />
              Now Playing 音楽連携
            </h2>
            <div className="flex items-center gap-2">
              <ToggleChip
                label="有効"
                checked={config.sources.nowplaying.enabled}
                onChange={(v) => void updateConfig({ sources: { nowplaying: { enabled: v } } })}
              />
              <ToggleChip
                label="OS自動検出"
                checked={config.sources.nowplaying.enableSystemMedia}
                onChange={(v) =>
                  void updateConfig({ sources: { nowplaying: { enableSystemMedia: v } } })
                }
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs">
            {nowPlaying?.playing ? (
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-pink-300">
                  ♪ {nowPlaying.title}
                  {nowPlaying.artist ? ` — ${nowPlaying.artist}` : ''}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-slate-400">
                  {nowPlaying.sourceApp}
                </span>
              </div>
            ) : (
              <span className="text-slate-500">現在再生中のメディアは検出されていません</span>
            )}
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-slate-400">Last.fm Username (任意)</span>
              <input
                type="text"
                value={config.sources.nowplaying.lastfmUsername}
                onChange={(e) =>
                  void updateConfig({
                    sources: { nowplaying: { lastfmUsername: e.target.value } },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">Last.fm API Key (任意)</span>
              <input
                type="password"
                value={config.sources.nowplaying.lastfmApiKey}
                onChange={(e) =>
                  void updateConfig({
                    sources: { nowplaying: { lastfmApiKey: e.target.value } },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
              />
            </label>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!npTitle.trim()) return;
              void pushNowPlaying({
                playing: true,
                title: npTitle.trim(),
                artist: npArtist.trim(),
                album: '',
                sourceApp: 'Admin',
              });
              setNpTitle('');
              setNpArtist('');
            }}
            className="flex flex-wrap gap-2"
          >
            <input
              type="text"
              value={npTitle}
              onChange={(e) => setNpTitle(e.target.value)}
              placeholder="曲名テスト送信"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              value={npArtist}
              onChange={(e) => setNpArtist(e.target.value)}
              placeholder="アーティスト"
              className="w-32 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
            >
              再生テスト
            </button>
          </form>
        </div>
      </section>

      {/* RSS, Sysmon & Sensors */}
      <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        {/* RSS */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-cyan-300">RSS / ニュースフィード</h2>
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                <span className="text-slate-400">間隔(秒):</span>
                <input
                  type="number"
                  min={30}
                  max={3600}
                  value={config.sources.rss.pollIntervalSec}
                  onChange={(e) =>
                    void updateConfig({
                      sources: { rss: { pollIntervalSec: Math.max(30, Number(e.target.value) || 300) } },
                    })
                  }
                  className="w-16 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono"
                />
              </label>
              <ToggleChip
                label="有効"
                checked={config.sources.rss.enabled}
                onChange={(v) => void updateConfig({ sources: { rss: { enabled: v } } })}
              />
              <button
                type="button"
                onClick={() => void refreshSource('rss')}
                className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
              >
                <RefreshCw className="h-3 w-3" />
                更新
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {config.sources.rss.feeds.map((feed) => (
              <div
                key={feed.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"
              >
                <label className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={feed.enabled}
                    onChange={(e) => {
                      const nextFeeds = config.sources.rss.feeds.map((f) =>
                        f.id === feed.id ? { ...f, enabled: e.target.checked } : f,
                      );
                      void updateConfig({ sources: { rss: { feeds: nextFeeds } } });
                    }}
                  />
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: feed.color ?? '#38bdf8' }}
                  />
                  <span className="font-semibold text-white">{feed.name}</span>
                  <span className="truncate text-slate-400">{feed.url}</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const nextFeeds = config.sources.rss.feeds.filter((f) => f.id !== feed.id);
                    void updateConfig({ sources: { rss: { feeds: nextFeeds } } });
                  }}
                  className="text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={(e) => void handleAddFeed(e)} className="flex flex-wrap gap-2">
            <input
              type="text"
              value={newFeedName}
              onChange={(e) => setNewFeedName(e.target.value)}
              placeholder="名前 (例: 4Gamer)"
              className="w-32 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <input
              type="url"
              value={newFeedUrl}
              onChange={(e) => setNewFeedUrl(e.target.value)}
              placeholder="https://example.com/rss.xml"
              className="min-w-44 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <input
              type="color"
              value={newFeedColor}
              onChange={(e) => setNewFeedColor(e.target.value)}
              className="h-8 w-9 cursor-pointer rounded border border-slate-700 bg-slate-950 p-0.5"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
              追加
            </button>
          </form>
        </div>

        {/* Sysmon */}
        <div className="space-y-2.5 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <Cpu className="h-4 w-4" />
              システムモニター (CPU / メモリ / 温度)
            </h2>
            <div className="flex items-center gap-2">
              <ToggleChip
                label="有効"
                checked={config.sources.sysmon.enabled}
                onChange={(v) => void updateConfig({ sources: { sysmon: { enabled: v } } })}
              />
              <button
                type="button"
                onClick={() => void refreshSource('sysmon')}
                className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-slate-400">取得間隔 (秒)</span>
              <input
                type="number"
                min={5}
                max={300}
                value={config.sources.sysmon.pollIntervalSec}
                onChange={(e) =>
                  void updateConfig({
                    sources: {
                      sysmon: { pollIntervalSec: Math.max(5, Number(e.target.value) || 15) },
                    },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">高温アラート (℃)</span>
              <input
                type="number"
                min={50}
                max={110}
                value={config.sources.sysmon.highTempThresholdC}
                onChange={(e) =>
                  void updateConfig({
                    sources: {
                      sysmon: { highTempThresholdC: Number(e.target.value) || 80 },
                    },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
              />
            </label>
            <div className="flex items-end pb-0.5">
              <ToggleChip
                label="高温時速報"
                checked={config.sources.sysmon.alertOnHighTemp}
                onChange={(v) =>
                  void updateConfig({ sources: { sysmon: { alertOnHighTemp: v } } })
                }
              />
            </div>
          </div>
        </div>

        {/* Indoor Sensors */}
        <div className="space-y-2.5 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <Thermometer className="h-4 w-4" />
              室内環境・スマートホーム (SwitchBot / Nature Remo / API)
            </h2>
            <div className="flex items-center gap-2">
              <ToggleChip
                label="有効"
                checked={config.sources.sensors.enabled}
                onChange={(v) => void updateConfig({ sources: { sensors: { enabled: v } } })}
              />
              <button
                type="button"
                onClick={() => void refreshSource('sensors')}
                className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </div>

          {sensors.length > 0 && (
            <div className="space-y-1 text-xs">
              {sensors.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/70 px-2.5 py-1"
                >
                  <span className="font-semibold text-emerald-300">{s.name}</span>
                  <span className="font-mono text-slate-300">
                    {s.temperature !== undefined ? `${s.temperature}℃ ` : ''}
                    {s.humidity !== undefined ? `${s.humidity}% ` : ''}
                    {s.co2 !== undefined ? `CO2:${s.co2}ppm` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-slate-400">Nature Remo Token (任意)</span>
              <input
                type="password"
                value={config.sources.sensors.natureRemoToken}
                onChange={(e) =>
                  void updateConfig({
                    sources: { sensors: { natureRemoToken: e.target.value } },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">CO2 換気アラート閾値 (ppm)</span>
              <input
                type="number"
                min={600}
                max={5000}
                value={config.sources.sensors.co2AlertPpm}
                onChange={(e) =>
                  void updateConfig({
                    sources: {
                      sensors: { co2AlertPpm: Math.max(600, Number(e.target.value) || 1200) },
                    },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">SwitchBot Token (v1.1)</span>
              <input
                type="password"
                value={config.sources.sensors.switchbotToken}
                onChange={(e) =>
                  void updateConfig({
                    sources: { sensors: { switchbotToken: e.target.value } },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">SwitchBot Secret (v1.1)</span>
              <input
                type="password"
                value={config.sources.sensors.switchbotSecret}
                onChange={(e) =>
                  void updateConfig({
                    sources: { sensors: { switchbotSecret: e.target.value } },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <ToggleChip
              label="CO2超過で速報"
              checked={config.sources.sensors.alertOnHighCo2}
              onChange={(v) =>
                void updateConfig({ sources: { sensors: { alertOnHighCo2: v } } })
              }
            />
            <input
              type="text"
              value={sbDeviceInput}
              onChange={(e) => setSbDeviceInput(e.target.value)}
              placeholder="SwitchBot Device ID 追加"
              className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => {
                const id = sbDeviceInput.trim();
                if (!id) return;
                if (!config.sources.sensors.switchbotDeviceIds.includes(id)) {
                  void updateConfig({
                    sources: {
                      sensors: {
                        switchbotDeviceIds: [...config.sources.sensors.switchbotDeviceIds, id],
                      },
                    },
                  });
                }
                setSbDeviceInput('');
              }}
              className="rounded bg-slate-800 px-2.5 py-1 hover:bg-slate-700"
            >
              ID追加
            </button>
          </div>

          {config.sources.sensors.switchbotDeviceIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {config.sources.sensors.switchbotDeviceIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    void updateConfig({
                      sources: {
                        sensors: {
                          switchbotDeviceIds: config.sources.sensors.switchbotDeviceIds.filter(
                            (x) => x !== id,
                          ),
                        },
                      },
                    })
                  }
                  className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-200"
                >
                  {id} ×
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void pushSensor({
                id: 'room',
                name: senName.trim() || '室内',
                temperature: Number(senTemp) || undefined,
                humidity: Number(senHum) || undefined,
                co2: Number(senCo2) || undefined,
                sourceApp: 'Admin',
              });
            }}
            className="flex flex-wrap gap-1.5 text-xs"
          >
            <input
              type="text"
              value={senName}
              onChange={(e) => setSenName(e.target.value)}
              placeholder="場所"
              className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1"
            />
            <input
              type="number"
              step="0.1"
              value={senTemp}
              onChange={(e) => setSenTemp(e.target.value)}
              placeholder="℃"
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
            />
            <input
              type="number"
              value={senHum}
              onChange={(e) => setSenHum(e.target.value)}
              placeholder="%"
              className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
            />
            <input
              type="number"
              value={senCo2}
              onChange={(e) => setSenCo2(e.target.value)}
              placeholder="ppm"
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
            />
            <button type="submit" className="rounded bg-slate-800 px-2.5 py-1 hover:bg-slate-700">
              センサー値テスト送信
            </button>
          </form>
        </div>
      </section>

      {/* Weather, Wikipedia, Mastodon */}
      <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        {/* Weather */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-cyan-300">
              天気予報・雨雲接近・気象警報 ({config.sources.weather.locations.length}地点)
            </h2>
            <div className="flex items-center gap-2">
              <ToggleChip
                label="有効"
                checked={config.sources.weather.enabled}
                onChange={(v) => void updateConfig({ sources: { weather: { enabled: v } } })}
              />
              <button
                type="button"
                onClick={() => void refreshSource('weather')}
                className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
              >
                <RefreshCw className="h-3 w-3" />
                更新
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <ToggleChip
              label="雨雲接近アラート"
              checked={config.sources.weather.rainAlertEnabled}
              onChange={(v) =>
                void updateConfig({ sources: { weather: { rainAlertEnabled: v } } })
              }
            />
            <ToggleChip
              label="雨雲で速報演出"
              checked={config.sources.weather.rainAlertBreaking}
              onChange={(v) =>
                void updateConfig({ sources: { weather: { rainAlertBreaking: v } } })
              }
            />
            <ToggleChip
              label="気象庁防災警報"
              checked={config.sources.weather.jmaWarningEnabled}
              onChange={(v) =>
                void updateConfig({ sources: { weather: { jmaWarningEnabled: v } } })
              }
            />
          </div>

          <div className="space-y-1.5">
            {config.sources.weather.locations.map((loc) => (
              <div
                key={loc.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs"
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={loc.enabled}
                    onChange={(e) => {
                      const nextLocs = config.sources.weather.locations.map((l) =>
                        l.id === loc.id ? { ...l, enabled: e.target.checked } : l,
                      );
                      void updateConfig({ sources: { weather: { locations: nextLocs } } });
                    }}
                  />
                  <span className="font-semibold text-white">{loc.cityName}</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    ({loc.latitude.toFixed(2)}, {loc.longitude.toFixed(2)})
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={loc.jmaAreaCode ?? ''}
                    onChange={(e) => {
                      const nextLocs = config.sources.weather.locations.map((l) =>
                        l.id === loc.id ? { ...l, jmaAreaCode: e.target.value } : l,
                      );
                      void updateConfig({ sources: { weather: { locations: nextLocs } } });
                    }}
                    placeholder="JMAコード(例:130000)"
                    className="w-28 rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const nextLocs = config.sources.weather.locations.filter(
                        (l) => l.id !== loc.id,
                      );
                      void updateConfig({ sources: { weather: { locations: nextLocs } } });
                    }}
                    className="text-slate-400 hover:text-red-400"
                    title="地点を削除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">プリセット追加:</span>
            {CITY_PRESETS.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() =>
                  void handleAddWeatherLocation(c.name, c.latitude, c.longitude, c.jmaAreaCode)
                }
                className="rounded border border-slate-800 bg-slate-950 px-2 py-0.5 text-xs text-slate-300 hover:border-cyan-400"
              >
                + {c.name}
              </button>
            ))}
          </div>

          <form onSubmit={(e) => void handleCitySearch(e)} className="flex gap-2">
            <input
              type="text"
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              placeholder="都市名を検索して追加 (例: 横浜, Kyoto)"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <button
              type="submit"
              disabled={geoLoading}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
            >
              <Search className="h-3.5 w-3.5" />
              検索
            </button>
          </form>

          {geoResults.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {geoResults.map((g, i) => (
                <button
                  key={`${g.name}-${i}`}
                  type="button"
                  onClick={() => {
                    void handleAddWeatherLocation(g.name, g.latitude, g.longitude);
                    setGeoResults([]);
                  }}
                  className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] hover:border-cyan-400"
                >
                  + {g.name} ({g.admin1 ?? g.country ?? ''})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Wikipedia */}
        <div className="space-y-2 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-cyan-300">Wikipedia ランダム表示</h2>
            <div className="flex items-center gap-2">
              <ToggleChip
                label="有効"
                checked={config.sources.wikipedia.enabled}
                onChange={(v) => void updateConfig({ sources: { wikipedia: { enabled: v } } })}
              />
              <button
                type="button"
                onClick={() => void refreshSource('wikipedia')}
                className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
              >
                <RefreshCw className="h-3 w-3" />
                1件取得
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-slate-400">言語:</span>
              <select
                value={config.sources.wikipedia.lang}
                onChange={(e) =>
                  void updateConfig({ sources: { wikipedia: { lang: e.target.value } } })
                }
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
              >
                <option value="ja">日本語 (ja)</option>
                <option value="en">English (en)</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-slate-400">間隔(秒):</span>
              <input
                type="number"
                min={15}
                max={600}
                value={config.sources.wikipedia.pollIntervalSec}
                onChange={(e) =>
                  void updateConfig({
                    sources: { wikipedia: { pollIntervalSec: Number(e.target.value) || 45 } },
                  })
                }
                className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1"
              />
            </label>
          </div>
        </div>

        {/* Mastodon */}
        <div className="space-y-2.5 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-cyan-300">Mastodon タイムライン</h2>
            <div className="flex items-center gap-2">
              <ToggleChip
                label="有効"
                checked={config.sources.mastodon.enabled}
                onChange={(v) => void updateConfig({ sources: { mastodon: { enabled: v } } })}
              />
              <button
                type="button"
                onClick={() => void refreshSource('mastodon')}
                className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
              >
                <RefreshCw className="h-3 w-3" />
                取得
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs">
            {MASTODON_INSTANCE_PRESETS.map((preset) => (
              <button
                key={preset.url}
                type="button"
                onClick={() =>
                  void updateConfig({
                    sources: {
                      mastodon: {
                        instanceUrl: preset.url,
                        stream: preset.defaultStream,
                      },
                    },
                  })
                }
                className={`rounded border px-2 py-0.5 ${
                  config.sources.mastodon.instanceUrl === preset.url
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                    : 'border-slate-800 bg-slate-950 text-slate-300'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-slate-400">インスタンス URL</span>
              <input
                type="url"
                value={config.sources.mastodon.instanceUrl}
                onChange={(e) =>
                  void updateConfig({ sources: { mastodon: { instanceUrl: e.target.value } } })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
              />
            </label>

            <label className="space-y-1">
              <span className="text-slate-400">ストリーム種別</span>
              <select
                value={config.sources.mastodon.stream}
                onChange={(e) =>
                  void updateConfig({
                    sources: {
                      mastodon: { stream: e.target.value as MastodonStreamType },
                    },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
              >
                <option value="public:local">ローカルタイムライン (LTL)</option>
                <option value="public">連合タイムライン (FTL)</option>
                <option value="hashtag">ハッシュタグ</option>
              </select>
            </label>

            {config.sources.mastodon.stream === 'hashtag' && (
              <label className="space-y-1">
                <span className="text-slate-400">ハッシュタグ (#不要)</span>
                <input
                  type="text"
                  value={config.sources.mastodon.hashtag}
                  onChange={(e) =>
                    void updateConfig({ sources: { mastodon: { hashtag: e.target.value } } })
                  }
                  placeholder="例: 実況"
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
                />
              </label>
            )}

            <label className="space-y-1">
              <span className="text-slate-400">Access Token (必要な鯖のみ)</span>
              <input
                type="password"
                value={config.sources.mastodon.accessToken}
                onChange={(e) =>
                  void updateConfig({ sources: { mastodon: { accessToken: e.target.value } } })
                }
                placeholder="任意"
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              <span className="text-slate-400">言語:</span>
              <input
                type="text"
                value={config.sources.mastodon.lang}
                onChange={(e) =>
                  void updateConfig({ sources: { mastodon: { lang: e.target.value } } })
                }
                placeholder="ja"
                className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-slate-400">最大件数/分:</span>
              <input
                type="number"
                min={1}
                max={120}
                value={config.sources.mastodon.maxItemsPerMinute}
                onChange={(e) =>
                  void updateConfig({
                    sources: {
                      mastodon: { maxItemsPerMinute: Math.max(1, Number(e.target.value) || 24) },
                    },
                  })
                }
                className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1"
              />
            </label>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const kw = kwInput.trim();
              if (!kw) return;
              if (!config.sources.mastodon.keywords.includes(kw)) {
                void updateConfig({
                  sources: {
                    mastodon: { keywords: [...config.sources.mastodon.keywords, kw] },
                  },
                });
              }
              setKwInput('');
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={kwInput}
              onChange={(e) => setKwInput(e.target.value)}
              placeholder="キーワード絞り込み (任意)"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
            >
              追加
            </button>
          </form>

          {config.sources.mastodon.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {config.sources.mastodon.keywords.map((kw) => (
                <button
                  key={kw}
                  type="button"
                  onClick={() =>
                    void updateConfig({
                      sources: {
                        mastodon: {
                          keywords: config.sources.mastodon.keywords.filter((k) => k !== kw),
                        },
                      },
                    })
                  }
                  className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-0.5 text-xs text-cyan-200 hover:bg-red-500/20"
                >
                  #{kw} ×
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
