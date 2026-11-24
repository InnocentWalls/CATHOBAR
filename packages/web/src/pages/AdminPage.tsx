import { useState, type FormEvent } from 'react';
import {
  CHANNEL_LABELS,
  CITY_PRESETS,
  EARTHQUAKE_SCALE_OPTIONS,
  LAYOUT_MODE_LABELS,
  MARKET_SYMBOL_PRESETS,
  MASTODON_INSTANCE_PRESETS,
  PixelIconIdSchema,
  SHINKANSEN_STYLE_LABELS,
  SOURCE_WEIGHT_LABELS,
  VFD_PALETTES,
  VISUAL_MODE_LABELS,
  type ChannelId,
  type CountdownEvent,
  type LayoutMode,
  type MarketSymbolConfig,
  type MastodonStreamType,
  type PixelIconId,
  type RssFeedConfig,
  type ShinkansenScrollStyle,
  type SourceWeights,
  type SpectrumAudioInput,
  type VfdPalette,
  type VisualMode,
  type WeatherLocation,
} from '@cathobar/shared';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Monitor,
  Music,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  TrendingUp,
  Tv,
  Webhook,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { TickerCanvas } from '../components/TickerCanvas.js';
import { useCathobar } from '../hooks/useCathobar.js';

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
}

export function AdminPage() {
  const {
    connected,
    config,
    items,
    lastBatch,
    activity,
    statuses,
    lanUrls,
    nowPlaying,
    updateConfig,
    pushMessage,
    pushNowPlaying,
    refreshSource,
  } = useCathobar();

  const [pushText, setPushText] = useState('');
  const [pushBadge, setPushBadge] = useState('PUSH');
  const [pushColor, setPushColor] = useState('#ff66aa');
  const [pushOneShot, setPushOneShot] = useState(true);
  const [pushBreaking, setPushBreaking] = useState(false);
  const [pushIcon, setPushIcon] = useState<PixelIconId>('info');

  const [newFeedName, setNewFeedName] = useState('');
  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedColor, setNewFeedColor] = useState('#38bdf8');

  const [cityQuery, setCityQuery] = useState('');
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);

  const [kwInput, setKwInput] = useState('');
  const [muteInput, setMuteInput] = useState('');
  const [lineFilterInput, setLineFilterInput] = useState('');

  const [newSymbolCode, setNewSymbolCode] = useState('');
  const [newSymbolLabel, setNewSymbolLabel] = useState('');

  const [npTitle, setNpTitle] = useState('');
  const [npArtist, setNpArtist] = useState('');

  const [cdTitle, setCdTitle] = useState('');
  const [cdTarget, setCdTarget] = useState('');
  const [cdAlert, setCdAlert] = useState(true);

  const handlePush = async (e: FormEvent) => {
    e.preventDefault();
    if (!pushText.trim()) return;
    await pushMessage({
      text: pushText.trim(),
      badge: pushBadge.trim() || 'PUSH',
      color: pushColor,
      priority: 'high',
      oneShot: pushOneShot,
      breaking: pushBreaking,
      icon: pushBreaking ? 'alert' : pushIcon,
    });
    setPushText('');
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
      sources: {
        rss: {
          feeds: [...config.sources.rss.feeds, newFeed],
        },
      },
    });
    setNewFeedName('');
    setNewFeedUrl('');
  };

  const handleAddWeatherLocation = async (cityName: string, latitude: number, longitude: number) => {
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
    };
    await updateConfig({
      sources: {
        weather: {
          locations: [...config.sources.weather.locations, nextLoc],
        },
      },
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
      sources: {
        market: {
          symbols: [...config.sources.market.symbols, next],
        },
      },
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
      sources: {
        countdown: {
          events: [...config.sources.countdown.events, nextEv],
        },
      },
    });
    setCdTitle('');
    setCdTarget('');
  };

  const baseHost = lanUrls[0] ?? 'http://localhost:3000';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-wide text-white">CATHOBAR Admin</h1>
              <p className="text-xs text-slate-400">ANOBAR8 / ANOBAR リモートコントロール</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                connected
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-red-500/15 text-red-300'
              }`}
            >
              {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {connected ? '接続中' : '切断'}
            </span>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium hover:bg-slate-800"
            >
              <Tv className="h-3.5 w-3.5" />
              表示画面
            </a>
            <a
              href="/debug"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium hover:bg-slate-800"
            >
              <Monitor className="h-3.5 w-3.5" />
              Debug Sim
            </a>
          </div>
        </div>

        {/* Live mini monitor preview */}
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <div className="h-20 w-full overflow-hidden rounded-lg border border-slate-800 bg-black shadow-inner">
            <TickerCanvas
              config={config}
              items={items}
              lastBatch={lastBatch}
              activity={activity}
              nowPlaying={nowPlaying}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-2">
        {/* Channel, Auto-Rotation & Push */}
        <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-cyan-300">チャンネル切替</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(Object.keys(CHANNEL_LABELS) as ChannelId[]).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => void updateConfig({ activeChannel: ch })}
                  className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition ${
                    config.activeChannel === ch
                      ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                      : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-mono text-[10px] opacity-70">{CHANNEL_LABELS[ch].short}</div>
                  <div className="truncate">{CHANNEL_LABELS[ch].label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Channel Auto-Rotation */}
          <div className="space-y-3 border-t border-slate-800 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-cyan-300">チャンネル自動ローテーション</h2>
              <ToggleChip
                label="自動巡回"
                checked={config.rotation.enabled}
                onChange={(v) => void updateConfig({ rotation: { enabled: v } })}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <span className="text-slate-400">切替間隔(秒):</span>
                <input
                  type="number"
                  min={10}
                  max={600}
                  value={config.rotation.intervalSec}
                  onChange={(e) =>
                    void updateConfig({
                      rotation: { intervalSec: Math.max(10, Number(e.target.value) || 45) },
                    })
                  }
                  className="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
                />
              </label>
              <span className="text-[11px] text-slate-400">巡回対象チャンネル:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(CHANNEL_LABELS) as ChannelId[])
                .filter((c) => c !== 'all')
                .map((ch) => {
                  const selected = config.rotation.channels.includes(ch);
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? config.rotation.channels.filter((x) => x !== ch)
                          : [...config.rotation.channels, ch];
                        if (next.length > 0) {
                          void updateConfig({ rotation: { channels: next } });
                        }
                      }}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${
                        selected
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                          : 'border-slate-800 bg-slate-950 text-slate-400'
                      }`}
                    >
                      {CHANNEL_LABELS[ch].short}
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Push API */}
          <div className="border-t border-slate-800 pt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-cyan-300">
                割り込みメッセージ送信 (Push API)
              </h2>
              <div className="flex flex-wrap gap-1.5">
                <ToggleChip
                  label="1回のみ"
                  checked={pushOneShot}
                  onChange={setPushOneShot}
                />
                <ToggleChip
                  label="緊急割り込み"
                  checked={pushBreaking}
                  onChange={setPushBreaking}
                />
              </div>
            </div>
            <form onSubmit={(e) => void handlePush(e)} className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={pushBadge}
                  onChange={(e) => setPushBadge(e.target.value)}
                  placeholder="バッジ"
                  className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
                />
                <select
                  value={pushIcon}
                  onChange={(e) => setPushIcon(e.target.value as PixelIconId)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-200"
                  title="ドット絵アイコン"
                >
                  {PixelIconIdSchema.options.map((ic) => (
                    <option key={ic} value={ic}>
                      {ic}
                    </option>
                  ))}
                </select>
                <input
                  type="color"
                  value={pushColor}
                  onChange={(e) => setPushColor(e.target.value)}
                  className="h-9 w-11 cursor-pointer rounded-lg border border-slate-700 bg-slate-950 p-1"
                  title="FEDモード用カラー"
                />
                <input
                  type="text"
                  value={pushText}
                  onChange={(e) => setPushText(e.target.value)}
                  placeholder="画面に今すぐ流したいテキストを入力..."
                  className="min-w-40 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <button
                type="submit"
                className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
                  pushBreaking
                    ? 'bg-red-500 text-white hover:bg-red-400'
                    : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                }`}
              >
                {pushBreaking ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {pushBreaking ? '緊急速報として割り込み送信' : '今すぐ流す'}
              </button>
            </form>
          </div>
        </section>

        {/* Visual, VFD Realism, Breaking Alert & Spectrum Settings */}
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-sm font-semibold text-cyan-300">ビジュアル・VFD質感・演出設定</h2>

          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(VISUAL_MODE_LABELS) as VisualMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => void updateConfig({ display: { visualMode: mode } })}
                className={`rounded-lg border p-2.5 text-left transition ${
                  config.display.visualMode === mode
                    ? 'border-cyan-400 bg-cyan-500/15 text-white'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold">{VISUAL_MODE_LABELS[mode].label}</div>
                <div className="mt-1 text-[11px] leading-snug text-slate-400">
                  {VISUAL_MODE_LABELS[mode].description}
                </div>
              </button>
            ))}
          </div>

          <div>
            <div className="mb-1.5 text-xs text-slate-400">流し方レイアウト（通常レーン / ニコニコ風弾幕）</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(LAYOUT_MODE_LABELS) as LayoutMode[]).map((lm) => (
                <button
                  key={lm}
                  type="button"
                  onClick={() => void updateConfig({ display: { layoutMode: lm } })}
                  className={`rounded-lg border p-2 text-left transition ${
                    config.display.layoutMode === lm
                      ? 'border-amber-400 bg-amber-500/15 text-white'
                      : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-semibold">{LAYOUT_MODE_LABELS[lm].label}</div>
                  <div className="mt-0.5 text-[10px] leading-snug text-slate-400">
                    {LAYOUT_MODE_LABELS[lm].description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {config.display.visualMode === 'shinkansen-led' && (
            <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-950/15 p-3">
              <div>
                <div className="mb-1.5 text-xs font-medium text-amber-300">
                  東北新幹線 3色LED 演出スタイル
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(SHINKANSEN_STYLE_LABELS) as ShinkansenScrollStyle[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => void updateConfig({ display: { shinkansenStyle: st } })}
                      className={`rounded-lg border p-2 text-left transition ${
                        config.display.shinkansenStyle === st
                          ? 'border-amber-400 bg-amber-500/20 text-white'
                          : 'border-slate-800 bg-slate-900 text-slate-300'
                      }`}
                    >
                      <div className="text-xs font-semibold">
                        {SHINKANSEN_STYLE_LABELS[st].label}
                      </div>
                      <div className="mt-0.5 text-[10px] leading-snug text-slate-400">
                        {SHINKANSEN_STYLE_LABELS[st].description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs text-slate-300">
                  LED 縦ドット数（実機 16〜24 ドット相当）
                </div>
                <div className="flex flex-wrap gap-2">
                  {[16, 24, 32].map((rows) => (
                    <button
                      key={rows}
                      type="button"
                      onClick={() => void updateConfig({ display: { ledRows: rows } })}
                      className={`rounded border px-3 py-1 font-mono text-xs ${
                        config.display.ledRows === rows
                          ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                          : 'border-slate-800 bg-slate-900 text-slate-300'
                      }`}
                    >
                      {rows} dots
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {config.display.visualMode === 'anobar8-vfd' && (
            <div>
              <div className="mb-1.5 text-xs text-slate-400">VFD 蛍光管カラー</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(VFD_PALETTES) as VfdPalette[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void updateConfig({ display: { vfdPalette: p } })}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                      config.display.vfdPalette === p
                        ? 'border-cyan-400 bg-slate-800 text-white'
                        : 'border-slate-800 bg-slate-900 text-slate-300'
                    }`}
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: VFD_PALETTES[p].hex }}
                    />
                    <span className="truncate">{p}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <SliderField
              label="スクロール速度 (px/s)"
              value={config.display.scrollSpeed}
              min={20}
              max={260}
              step={4}
              onChange={(v) => void updateConfig({ display: { scrollSpeed: v } })}
            />
            <SliderField
              label="固定レーン数 (行数)"
              value={config.display.lanes}
              min={1}
              max={4}
              step={1}
              onChange={(v) => void updateConfig({ display: { lanes: v } })}
            />
            <SliderField
              label="縦ドット解像度 (px)"
              value={config.display.logicalHeight}
              min={48}
              max={192}
              step={8}
              onChange={(v) => void updateConfig({ display: { logicalHeight: v } })}
            />
            <SliderField
              label="輝度 (Brightness)"
              value={config.display.brightness}
              min={0.4}
              max={1.8}
              step={0.05}
              onChange={(v) => void updateConfig({ display: { brightness: v } })}
            />
            <SliderField
              label="ドット感 (Dot Matrix)"
              value={config.display.dotIntensity}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => void updateConfig({ display: { dotIntensity: v } })}
            />
            <SliderField
              label="発光ブルーム (Bloom)"
              value={config.display.bloom}
              min={0}
              max={1.2}
              step={0.05}
              onChange={(v) => void updateConfig({ display: { bloom: v } })}
            />
            <SliderField
              label="残像 (Persistence)"
              value={config.display.persistence}
              min={0}
              max={0.85}
              step={0.05}
              onChange={(v) => void updateConfig({ display: { persistence: v } })}
            />
            <SliderField
              label="VFD メッシュグリッド"
              value={config.display.vfdGridIntensity}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => void updateConfig({ display: { vfdGridIntensity: v } })}
            />
            <SliderField
              label="VFD ガラス反射"
              value={config.display.vfdGlassReflection}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => void updateConfig({ display: { vfdGlassReflection: v } })}
            />
            <SliderField
              label="緊急速報表示時間 (秒)"
              value={config.display.breakingAlertDurationSec}
              min={4}
              max={30}
              step={1}
              onChange={(v) => void updateConfig({ display: { breakingAlertDurationSec: v } })}
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1 text-xs">
            <ToggleChip
              label="ドット絵アイコン"
              checked={config.display.showPixelIcons}
              onChange={(v) => void updateConfig({ display: { showPixelIcons: v } })}
            />
            <ToggleChip
              label="焼き付き防止シフト"
              checked={config.display.burnInShift}
              onChange={(v) => void updateConfig({ display: { burnInShift: v } })}
            />
            <ToggleChip
              label="緊急速報演出"
              checked={config.display.breakingAlertEnabled}
              onChange={(v) => void updateConfig({ display: { breakingAlertEnabled: v } })}
            />
            <ToggleChip
              label="速報チャイム音"
              checked={config.display.breakingAlertSound}
              onChange={(v) => void updateConfig({ display: { breakingAlertSound: v } })}
            />
            <ToggleChip
              label="スペアナ"
              checked={config.display.showSpectrumAnalyzer}
              onChange={(v) => void updateConfig({ display: { showSpectrumAnalyzer: v } })}
            />
            <ToggleChip
              label="時計オーバーレイ"
              checked={config.display.showClockOverlay}
              onChange={(v) => void updateConfig({ display: { showClockOverlay: v } })}
            />
            <ToggleChip
              label="下部 勢いグラフ"
              checked={config.display.showActivityGraph}
              onChange={(v) => void updateConfig({ display: { showActivityGraph: v } })}
            />
            <ToggleChip
              label="ソースバッジ"
              checked={config.display.showSourceBadge}
              onChange={(v) => void updateConfig({ display: { showSourceBadge: v } })}
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">スペクトラムアナライザ入力:</span>
            <select
              value={config.display.spectrumAudioInput}
              onChange={(e) =>
                void updateConfig({
                  display: { spectrumAudioInput: e.target.value as SpectrumAudioInput },
                })
              }
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1"
            >
              <option value="auto">自動 (再生検出 / 外部レベル)</option>
              <option value="synth">常時シンセサイザ波形</option>
              <option value="mic">マイク / ライン入力 (要ブラウザ許可)</option>
            </select>
          </div>
        </section>

        {/* Global NG Words & ALL MIX Source Weights */}
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <Activity className="h-4 w-4" />
              共通 NG ワード & 配信比率 (重み付け)
            </h2>
            <ToggleChip
              label="重複記事除外"
              checked={config.filtering.dedupeTitles}
              onChange={(v) => void updateConfig({ filtering: { dedupeTitles: v } })}
            />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const kw = muteInput.trim();
              if (!kw) return;
              if (!config.filtering.muteKeywords.includes(kw)) {
                void updateConfig({
                  filtering: { muteKeywords: [...config.filtering.muteKeywords, kw] },
                });
              }
              setMuteInput('');
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={muteInput}
              onChange={(e) => setMuteInput(e.target.value)}
              placeholder="全ソース共通NGワード (例: PR, /広告|スポンサー/i)"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
            >
              追加
            </button>
          </form>

          {config.filtering.muteKeywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {config.filtering.muteKeywords.map((kw) => (
                <button
                  key={kw}
                  type="button"
                  onClick={() =>
                    void updateConfig({
                      filtering: {
                        muteKeywords: config.filtering.muteKeywords.filter((k) => k !== kw),
                      },
                    })
                  }
                  className="rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 text-xs text-red-200 hover:bg-red-500/25"
                >
                  {kw} ×
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-slate-800 pt-3">
            <div className="mb-2 text-xs text-slate-400">
              ALL MIX 配信比率 (0 = ALL MIXから除外、大きいほど高頻度)
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {(Object.keys(SOURCE_WEIGHT_LABELS) as Array<keyof SourceWeights>).map((key) => (
                <SliderField
                  key={key}
                  label={SOURCE_WEIGHT_LABELS[key]}
                  value={config.filtering.weights[key]}
                  min={0}
                  max={10}
                  step={1}
                  onChange={(v) =>
                    void updateConfig({
                      filtering: { weights: { [key]: v } },
                    })
                  }
                />
              ))}
            </div>
          </div>
        </section>

        {/* Disaster (P2PQuake) & Transit (ODPT) */}
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <ShieldAlert className="h-4 w-4" />
              防災 (P2P地震情報) & 鉄道運行情報 (ODPT)
            </h2>
          </div>

          {/* Earthquake */}
          <div className="space-y-2.5 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">地震・津波・緊急地震速報 (P2P地震情報)</span>
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
              onChange={(v) =>
                void updateConfig({ sources: { earthquake: { includeTsunami: v } } })
              }
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
                placeholder="監視路線フィルタ (空欄で全路線 / 例: 山手線, 大江戸線)"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
              />
              <button
                type="submit"
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
              >
                追加
              </button>
            </form>

            {config.sources.transit.lineFilter.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {config.sources.transit.lineFilter.map((ln) => (
                  <button
                    key={ln}
                    type="button"
                    onClick={() =>
                      void updateConfig({
                        sources: {
                          transit: {
                            lineFilter: config.sources.transit.lineFilter.filter((x) => x !== ln),
                          },
                        },
                      })
                    }
                    className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-200"
                  >
                    {ln} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Market & Countdown */}
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
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
                placeholder="シンボル (例: 7203.T, AAPL)"
                className="w-36 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-mono"
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
                placeholder="イベント名 (例: MTG開始)"
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
        </section>

        {/* Now Playing & Webhook */}
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="space-y-2.5">
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

          {/* Webhook */}
          <div className="space-y-2.5 border-t border-slate-800 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
                <Webhook className="h-4 w-4" />
                外部 Webhook 受信 (/api/webhook/:preset)
              </h2>
              <ToggleChip
                label="有効"
                checked={config.sources.webhook.enabled}
                onChange={(v) => void updateConfig({ sources: { webhook: { enabled: v } } })}
              />
            </div>

            <label className="block space-y-1 text-xs">
              <span className="text-slate-400">共有トークン Secret (空欄なら認証なし)</span>
              <input
                type="password"
                value={config.sources.webhook.secret}
                onChange={(e) =>
                  void updateConfig({ sources: { webhook: { secret: e.target.value } } })
                }
                placeholder="X-Cathobar-Token / Bearer / ?token="
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
              />
            </label>

            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5 font-mono text-[10px] leading-relaxed text-slate-300">
              <div className="text-slate-400"># generic / github / homeassistant / alert</div>
              <div className="truncate text-cyan-300">
                curl -X POST {baseHost}/api/webhook/alert -H &quot;Content-Type: application/json&quot; -d &apos;&#123;&quot;badge&quot;:&quot;HA&quot;,&quot;text&quot;:&quot;玄関が開きました&quot;&#125;&apos;
              </div>
            </div>
          </div>
        </section>

        {/* RSS Feeds */}
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-cyan-300">RSS / ニュースフィード</h2>
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                <span className="text-slate-400">更新間隔(秒):</span>
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
                今すぐ更新
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

          <form onSubmit={(e) => void handleAddFeed(e)} className="flex flex-wrap gap-2 pt-1">
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
        </section>

        {/* Weather (Multi-location), Wikipedia, Mastodon */}
        <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          {/* Weather Multi-location */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-cyan-300">
                天気予報（複数地点対応 / {config.sources.weather.locations.length}地点）
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

            <div className="space-y-1.5">
              {config.sources.weather.locations.map((loc) => (
                <div
                  key={loc.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs"
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
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400">プリセット追加:</span>
              {CITY_PRESETS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => void handleAddWeatherLocation(c.name, c.latitude, c.longitude)}
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
                  placeholder="ja (空欄で全言語)"
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

        {/* LAN URLs & Source Status */}
        <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-cyan-300">LAN アクセスURL & ソース状態</h2>

          {lanUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs">
              {lanUrls.map((url) => (
                <div
                  key={url}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 font-mono text-slate-300"
                >
                  Admin: <span className="text-cyan-300">{url}/admin</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
            {statuses.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold uppercase text-white">{s.id}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      !s.active
                        ? 'bg-slate-800 text-slate-400'
                        : s.connected
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {!s.active ? '停止' : s.connected ? '稼働中' : '待機/エラー'}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">取得数: {s.itemCount}</div>
                {s.lastError && (
                  <div className="mt-1 truncate text-[11px] text-red-400" title={s.lastError}>
                    {s.lastError}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function SliderField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs">
      <div className="mb-1 flex justify-between text-slate-300">
        <span>{props.label}</span>
        <span className="font-mono text-cyan-300">{props.value}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full accent-cyan-400"
      />
    </label>
  );
}

function ToggleChip(props: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => props.onChange(!props.checked)}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        props.checked
          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
          : 'border-slate-700 bg-slate-900 text-slate-400'
      }`}
    >
      {props.label}: {props.checked ? 'ON' : 'OFF'}
    </button>
  );
}
