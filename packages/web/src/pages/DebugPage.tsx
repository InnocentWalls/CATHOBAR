import { useEffect, useRef, useState } from 'react';
import {
  CHANNEL_LABELS,
  LAYOUT_MODE_LABELS,
  RESOLUTION_PRESETS,
  SCREEN_LAYOUT_LABELS,
  SHINKANSEN_STYLE_LABELS,
  VFD_PALETTES,
  VISUAL_MODE_LABELS,
  type ChannelId,
  type LayoutMode,
  type ScreenLayoutMode,
  type ShinkansenScrollStyle,
  type VfdPalette,
  type VisualMode,
} from '@cathobar/shared';
import { AlertTriangle, Flame, SlidersHorizontal, Sparkles, Tv } from 'lucide-react';
import { TickerCanvas } from '../components/TickerCanvas.js';
import type { EngineStats } from '../engine/ticker-engine.js';
import { useCathobar } from '../hooks/useCathobar.js';

export function DebugPage() {
  const {
    connected,
    config,
    items,
    lastBatch,
    activity,
    nowPlaying,
    sensors,
    updateConfig,
    pushMessage,
  } = useCathobar();

  const [simWidth, setSimWidth] = useState(1920);
  const [simHeight, setSimHeight] = useState(480);
  const [zoomMode, setZoomMode] = useState<'auto' | number>('auto');
  const [transparentPreview, setTransparentPreview] = useState(false);
  const [containerW, setContainerW] = useState(1100);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerW(Math.max(320, entry.contentRect.width - 32));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale =
    zoomMode === 'auto'
      ? Math.min(1, containerW / simWidth, 620 / Math.max(1, simHeight))
      : zoomMode;
  const scaledW = Math.round(simWidth * scale);
  const scaledH = Math.round(simHeight * scale);
  const aspect = (simWidth / Math.max(1, simHeight)).toFixed(2);

  const sendBurstTests = async () => {
    const samples = [
      {
        badge: 'TEST',
        text: 'CATHOBAR テスト配信（1回のみ表示）: 画面を通過すると自動で消えます',
        color: '#38fad9',
        icon: 'info' as const,
      },
      {
        badge: 'INFO',
        text: `解像度テスト ${simWidth}×${simHeight} (Aspect ${aspect}:1) — ドット絵アイコン＆VFD質感検証`,
        color: '#f472b6',
        icon: 'sun' as const,
      },
    ];
    for (const s of samples) {
      await pushMessage({ ...s, priority: 'high', oneShot: true, breaking: false });
    }
  };

  const sendBreakingAlertTest = async () => {
    await pushMessage({
      badge: '緊急速報',
      text: '【テスト】緊急割り込み演出（Breaking Alert）— 全画面フラッシュ＋優先表示テスト',
      color: '#ff2a22',
      priority: 'high',
      oneShot: true,
      breaking: true,
      icon: 'alert',
    });
  };

  const sendDanmakuBurst = async () => {
    const comments = [
      'ｷﾀ━━━━(ﾟ∀ﾟ)━━━━!!',
      '8888888888888',
      'これは懐かしいANOBAR感！',
      'VFDの発光のにじみとグリッドが最高',
      '弾幕テスト中ｗｗｗｗ',
      'ぬるぬる60fpsで動いてる',
      'www',
      'ツイ廃モニタ横向き捗る',
      'MastodonのローカルTL流したい',
      '草',
      'おつかれさまー！',
      'これリビングに置きたいやつ',
    ];
    for (const text of comments) {
      await pushMessage({
        badge: 'LIVE',
        text,
        color: '#facc15',
        priority: 'high',
        oneShot: true,
        breaking: false,
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90 px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-white">
              CATHOBAR Debug Simulator (任意解像度・仮想パネル検証)
            </h1>
            <p className="text-xs text-slate-400">
              ツイ廃モニタや初代ANOBARの実解像度を仮想ベゼル内でプレビュー・テストできます
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs ${
                connected ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
              }`}
            >
              {connected ? 'WS 接続中' : 'WS 切断'}
            </span>
            <a
              href="/"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs hover:bg-slate-800"
            >
              <Tv className="h-3.5 w-3.5" />
              全画面表示 (/)
            </a>
            <a
              href="/admin"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs hover:bg-slate-800"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Admin
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        {/* Resolution & Zoom Controls */}
        <div className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 lg:grid-cols-3">
          <div className="space-y-2 lg:col-span-2">
            <div className="text-xs font-semibold text-cyan-300">解像度プリセット</div>
            <div className="flex flex-wrap gap-2">
              {RESOLUTION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setSimWidth(preset.width);
                    setSimHeight(preset.height);
                  }}
                  className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                    simWidth === preset.width && simHeight === preset.height
                      ? 'border-cyan-400 bg-cyan-500/20 text-white'
                      : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-mono font-semibold">{preset.label}</div>
                  <div className="text-[10px] text-slate-400">{preset.note}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-cyan-300">カスタム解像度 & 倍率</div>
            <div className="flex items-center gap-2 text-xs">
              <input
                type="number"
                min={320}
                max={3840}
                value={simWidth}
                onChange={(e) => setSimWidth(Math.max(320, Number(e.target.value) || 320))}
                className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
              />
              <span>×</span>
              <input
                type="number"
                min={48}
                max={2160}
                value={simHeight}
                onChange={(e) => setSimHeight(Math.max(48, Number(e.target.value) || 48))}
                className="w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(
                [
                  { label: 'Auto', val: 'auto' },
                  { label: '50%', val: 0.5 },
                  { label: '100%', val: 1 },
                  { label: '150%', val: 1.5 },
                  { label: '200%', val: 2 },
                ] as const
              ).map((z) => (
                <button
                  key={z.label}
                  type="button"
                  onClick={() => setZoomMode(z.val)}
                  className={`rounded border px-2 py-1 ${
                    zoomMode === z.val
                      ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                      : 'border-slate-800 bg-slate-950 text-slate-300'
                  }`}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Simulated Monitor Bezel Stage */}
        <div
          ref={stageRef}
          className="flex flex-col items-center justify-center overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40 p-6"
        >
          <div className="rounded-2xl border-4 border-slate-700 bg-gradient-to-b from-slate-800 to-slate-900 p-3 shadow-2xl">
            <div
              className="overflow-hidden rounded ring-1 ring-slate-600/50"
              style={{
                width: `${scaledW}px`,
                height: `${scaledH}px`,
                backgroundColor: transparentPreview ? '#1e293b' : '#000000',
                backgroundImage: transparentPreview
                  ? 'linear-gradient(45deg, #334155 25%, transparent 25%), linear-gradient(-45deg, #334155 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #334155 75%), linear-gradient(-45deg, transparent 75%, #334155 75%)'
                  : undefined,
                backgroundSize: transparentPreview ? '20px 20px' : undefined,
                backgroundPosition: transparentPreview ? '0 0, 0 10px, 10px -10px, -10px 0' : undefined,
              }}
            >
              <TickerCanvas
                config={config}
                items={items}
                lastBatch={lastBatch}
                activity={activity}
                nowPlaying={nowPlaying}
                sensors={sensors}
                transparent={transparentPreview}
                onStats={setStats}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[11px] text-slate-400">
              <span>
                VIRTUAL PANEL: {simWidth}×{simHeight} ({aspect}:1) | ZOOM:{' '}
                {Math.round(scale * 100)}%
              </span>
              {stats && (
                <span>
                  [{stats.effectiveScreenLayout.toUpperCase()}] LOGICAL GRID: {stats.logicalWidth}×
                  {stats.logicalHeight} |{' '}
                  {stats.rotating ? `ROT:${stats.effectiveChannel}` : stats.effectiveChannel} |{' '}
                  {stats.fps} FPS | {stats.backend.toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(VISUAL_MODE_LABELS) as VisualMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => void updateConfig({ display: { visualMode: mode } })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  config.display.visualMode === mode
                    ? 'border-cyan-400 bg-cyan-500/20 text-white'
                    : 'border-slate-800 bg-slate-950 text-slate-300'
                }`}
              >
                {VISUAL_MODE_LABELS[mode].label}
              </button>
            ))}

            {(Object.keys(SCREEN_LAYOUT_LABELS) as ScreenLayoutMode[]).map((sl) => (
              <button
                key={sl}
                type="button"
                onClick={() => void updateConfig({ display: { screenLayout: sl } })}
                className={`rounded border px-2.5 py-1 text-xs ${
                  config.display.screenLayout === sl
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                    : 'border-slate-800 bg-slate-950 text-slate-400'
                }`}
              >
                {SCREEN_LAYOUT_LABELS[sl].label}
              </button>
            ))}

            {(Object.keys(LAYOUT_MODE_LABELS) as LayoutMode[]).map((lm) => (
              <button
                key={lm}
                type="button"
                onClick={() => void updateConfig({ display: { layoutMode: lm } })}
                className={`rounded border px-2.5 py-1 text-xs ${
                  config.display.layoutMode === lm
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                    : 'border-slate-800 bg-slate-950 text-slate-400'
                }`}
              >
                {LAYOUT_MODE_LABELS[lm].label}
              </button>
            ))}

            {config.display.visualMode === 'shinkansen-led' && (
              <>
                {(Object.keys(SHINKANSEN_STYLE_LABELS) as ShinkansenScrollStyle[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => void updateConfig({ display: { shinkansenStyle: st } })}
                    className={`rounded border px-2 py-1 text-xs ${
                      config.display.shinkansenStyle === st
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    {SHINKANSEN_STYLE_LABELS[st].label}
                  </button>
                ))}
                {[16, 24, 32].map((rows) => (
                  <button
                    key={rows}
                    type="button"
                    onClick={() => void updateConfig({ display: { ledRows: rows } })}
                    className={`rounded border px-2 py-1 font-mono text-xs ${
                      config.display.ledRows === rows
                        ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                        : 'border-slate-800 bg-slate-950 text-slate-400'
                    }`}
                  >
                    {rows}px
                  </button>
                ))}
              </>
            )}

            {config.display.visualMode === 'anobar8-vfd' &&
              (Object.keys(VFD_PALETTES) as VfdPalette[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => void updateConfig({ display: { vfdPalette: p } })}
                  className={`rounded border px-2 py-1 text-xs ${
                    config.display.vfdPalette === p
                      ? 'border-cyan-400 bg-slate-800 text-white'
                      : 'border-slate-800 bg-slate-950 text-slate-400'
                  }`}
                >
                  {p}
                </button>
              ))}

            <button
              type="button"
              onClick={() =>
                void updateConfig({ display: { showPixelIcons: !config.display.showPixelIcons } })
              }
              className={`rounded border px-2 py-1 text-xs ${
                config.display.showPixelIcons
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              アイコン: {config.display.showPixelIcons ? 'ON' : 'OFF'}
            </button>

            <button
              type="button"
              onClick={() =>
                void updateConfig({
                  display: { showSpectrumAnalyzer: !config.display.showSpectrumAnalyzer },
                })
              }
              className={`rounded border px-2 py-1 text-xs ${
                config.display.showSpectrumAnalyzer
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              スペアナ: {config.display.showSpectrumAnalyzer ? 'ON' : 'OFF'}
            </button>

            <button
              type="button"
              onClick={() => setTransparentPreview((t) => !t)}
              className={`rounded border px-2 py-1 text-xs ${
                transparentPreview
                  ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              透過プレビュー: {transparentPreview ? 'ON' : 'OFF'}
            </button>

            <button
              type="button"
              onClick={() =>
                void updateConfig({ rotation: { enabled: !config.rotation.enabled } })
              }
              className={`rounded border px-2 py-1 text-xs ${
                config.rotation.enabled
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              自動巡回: {config.rotation.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={config.activeChannel}
              onChange={(e) => void updateConfig({ activeChannel: e.target.value as ChannelId })}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            >
              {(Object.keys(CHANNEL_LABELS) as ChannelId[]).map((ch) => (
                <option key={ch} value={ch}>
                  {CHANNEL_LABELS[ch].label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void sendBurstTests()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
            >
              <Sparkles className="h-3.5 w-3.5" />
              テスト電文
            </button>

            <button
              type="button"
              onClick={() => void sendBreakingAlertTest()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-400"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              緊急速報テスト
            </button>

            <button
              type="button"
              onClick={() => void sendDanmakuBurst()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"
            >
              <Flame className="h-3.5 w-3.5" />
              弾幕テスト (12件)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
