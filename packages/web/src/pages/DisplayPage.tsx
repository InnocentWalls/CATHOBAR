import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CHANNEL_LABELS,
  ChannelIdSchema,
  LAYOUT_MODE_LABELS,
  SCREEN_LAYOUT_LABELS,
  ScreenLayoutModeSchema,
  VFD_PALETTES,
  VISUAL_MODE_LABELS,
  VisualModeSchema,
  type ChannelId,
  type LayoutMode,
  type ScreenLayoutMode,
  type VfdPalette,
  type VisualMode,
} from '@cathobar/shared';
import { Maximize2, Monitor, Pause, Play, QrCode, SlidersHorizontal, X } from 'lucide-react';
import { TickerCanvas } from '../components/TickerCanvas.js';
import { unlockAlertAudio } from '../engine/alert-audio.js';
import { renderQrSvg } from '../engine/qrcode.js';
import type { EngineStats, TickerEngine } from '../engine/ticker-engine.js';
import { useCathobar } from '../hooks/useCathobar.js';

const CHANNEL_ORDER: ChannelId[] = [
  'all',
  'rss',
  'wikipedia',
  'weather',
  'mastodon',
  'disaster',
  'market',
  'nowplaying',
  'countdown',
  'system',
  'clock',
];
const MODE_ORDER: VisualMode[] = [
  'anobar8-vfd',
  'anobar-fed',
  'shinkansen-led',
  'split-flap',
  'station-board',
  'clean',
];
const PALETTE_ORDER: VfdPalette[] = ['cyan', 'green', 'white', 'amber'];
const LAYOUT_ORDER: LayoutMode[] = ['auto', 'lanes', 'danmaku'];
const SCREEN_LAYOUT_ORDER: ScreenLayoutMode[] = ['auto', 'board', 'wall', 'bar'];

export function DisplayPage() {
  const { connected, config, items, lastBatch, activity, lanUrls, nowPlaying, sensors, updateConfig } =
    useCathobar();

  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const isTransparent = urlParams.get('transparent') === '1' || urlParams.get('transparent') === 'true';
  const hideHudForever = urlParams.get('hideHud') === '1';

  const effectiveConfig = useMemo(() => {
    const chParam = urlParams.get('channel');
    const modeParam = urlParams.get('mode');
    const screenParam = urlParams.get('screen');
    const chOk = chParam ? ChannelIdSchema.safeParse(chParam) : null;
    const modeOk = modeParam ? VisualModeSchema.safeParse(modeParam) : null;
    const screenOk = screenParam ? ScreenLayoutModeSchema.safeParse(screenParam) : null;
    if (!chOk?.success && !modeOk?.success && !screenOk?.success) return config;
    return {
      ...config,
      activeChannel: chOk?.success ? chOk.data : config.activeChannel,
      display: {
        ...config.display,
        ...(modeOk?.success ? { visualMode: modeOk.data } : {}),
        ...(screenOk?.success ? { screenLayout: screenOk.data } : {}),
      },
    };
  }, [config, urlParams]);

  const [hudVisible, setHudVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const hideTimer = useRef<number | null>(null);
  const engineRef = useRef<TickerEngine | null>(null);

  useEffect(() => {
    if (isTransparent) {
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
    }
    return () => {
      document.documentElement.style.background = '';
      document.body.style.background = '';
    };
  }, [isTransparent]);

  const showHudTemporarily = useCallback(() => {
    if (hideHudForever) return;
    setHudVisible(true);
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = window.setTimeout(() => {
      setHudVisible(false);
    }, 4000);
  }, [hideHudForever]);

  useEffect(() => {
    return () => {
      if (hideTimer.current !== null) {
        clearTimeout(hideTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const unlock = () => unlockAlertAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const key = e.key.toLowerCase();
      if ((key >= '1' && key <= '9') || key === '0') {
        const idx = key === '0' ? 9 : Number(key) - 1;
        const nextCh = CHANNEL_ORDER[idx];
        if (nextCh) {
          void updateConfig({ activeChannel: nextCh });
          showHudTemporarily();
        }
      } else if (key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
        showHudTemporarily();
      } else if (e.key === 'ArrowLeft') {
        engineRef.current?.nudgeScroll(24);
      } else if (e.key === 'ArrowRight') {
        engineRef.current?.nudgeScroll(-24);
      } else if (key === 'q') {
        setShowQr((q) => !q);
      } else if (key === 'v') {
        const curIdx = MODE_ORDER.indexOf(config.display.visualMode);
        const nextMode = MODE_ORDER[(curIdx + 1) % MODE_ORDER.length]!;
        void updateConfig({ display: { visualMode: nextMode } });
        showHudTemporarily();
      } else if (key === 'c') {
        const curIdx = PALETTE_ORDER.indexOf(config.display.vfdPalette);
        const nextPalette = PALETTE_ORDER[(curIdx + 1) % PALETTE_ORDER.length]!;
        void updateConfig({ display: { vfdPalette: nextPalette } });
        showHudTemporarily();
      } else if (key === 'l') {
        const curIdx = LAYOUT_ORDER.indexOf(config.display.layoutMode);
        const nextLayout = LAYOUT_ORDER[(curIdx + 1) % LAYOUT_ORDER.length]!;
        void updateConfig({ display: { layoutMode: nextLayout } });
        showHudTemporarily();
      } else if (key === 'w') {
        const curIdx = SCREEN_LAYOUT_ORDER.indexOf(config.display.screenLayout);
        const nextScreen = SCREEN_LAYOUT_ORDER[(curIdx + 1) % SCREEN_LAYOUT_ORDER.length]!;
        void updateConfig({ display: { screenLayout: nextScreen } });
        showHudTemporarily();
      } else if (key === 'g') {
        void updateConfig({ display: { showActivityGraph: !config.display.showActivityGraph } });
        showHudTemporarily();
      } else if (key === 'r') {
        void updateConfig({ rotation: { enabled: !config.rotation.enabled } });
        showHudTemporarily();
      } else if (key === 'i') {
        void updateConfig({ display: { showPixelIcons: !config.display.showPixelIcons } });
        showHudTemporarily();
      } else if (key === 's') {
        void updateConfig({
          display: { showSpectrumAnalyzer: !config.display.showSpectrumAnalyzer },
        });
        showHudTemporarily();
      } else if (key === 'h') {
        setHudVisible((v) => !v);
      } else if (key === 'f') {
        if (!document.fullscreenElement) {
          void document.documentElement.requestFullscreen().catch(() => {});
        } else {
          void document.exitFullscreen().catch(() => {});
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [config.display, config.rotation.enabled, showHudTemporarily, updateConfig]);

  const adminQrUrl = `${lanUrls[0] ?? window.location.origin}/admin`;
  const qrSvg = useMemo(() => (showQr ? renderQrSvg(adminQrUrl, 160) : ''), [showQr, adminQrUrl]);

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden select-none ${
        isTransparent ? 'bg-transparent' : 'bg-black'
      }`}
      onMouseMove={showHudTemporarily}
      onTouchStart={showHudTemporarily}
    >
      <TickerCanvas
        config={effectiveConfig}
        items={items}
        lastBatch={lastBatch}
        activity={activity}
        nowPlaying={nowPlaying}
        sensors={sensors}
        transparent={isTransparent}
        paused={paused}
        onStats={setStats}
        onEngineReady={(eng) => {
          engineRef.current = eng;
        }}
      />

      {!connected && !isTransparent && (
        <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-red-950/80 px-2 py-0.5 font-mono text-[10px] text-red-300">
          RECONNECTING...
        </div>
      )}

      {showQr && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="relative flex flex-col items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 p-4 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => setShowQr(false)}
              className="absolute right-2 top-2 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="text-xs font-semibold text-cyan-300">スマホ・LAN 管理画面 (QR)</div>
            <div
              className="overflow-hidden rounded-lg border border-slate-700 bg-white p-1"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="font-mono text-[11px] text-slate-300">{adminQrUrl}</div>
          </div>
        </div>
      )}

      {!hideHudForever && (
        <div
          className={`absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-2 bg-slate-950/85 px-3 py-1.5 backdrop-blur-md transition-opacity duration-300 ${
            hudVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div className="flex flex-wrap items-center gap-1">
            {CHANNEL_ORDER.map((ch, idx) => {
              const keyHint = idx < 9 ? String(idx + 1) : idx === 9 ? '0' : '·';
              const isHighlighted =
                stats?.rotating ? stats.effectiveChannel === ch : config.activeChannel === ch;
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => void updateConfig({ activeChannel: ch })}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                    isHighlighted
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {keyHint}:{CHANNEL_LABELS[ch].short}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => void updateConfig({ rotation: { enabled: !config.rotation.enabled } })}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                config.rotation.enabled
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
              title="チャンネル自動ローテーション (R)"
            >
              R:ROT {config.rotation.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 ${
                paused ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
              title="一時停止 / 再開 (Space)"
            >
              {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {paused ? '再開' : '停止'}
            </button>

            <button
              type="button"
              onClick={() => {
                const curIdx = SCREEN_LAYOUT_ORDER.indexOf(config.display.screenLayout);
                const nextScreen = SCREEN_LAYOUT_ORDER[(curIdx + 1) % SCREEN_LAYOUT_ORDER.length]!;
                void updateConfig({ display: { screenLayout: nextScreen } });
              }}
              className="rounded bg-slate-800 px-2 py-0.5 text-emerald-300 hover:bg-slate-700"
              title="画面レイアウト切替 (W)"
            >
              W: {SCREEN_LAYOUT_LABELS[config.display.screenLayout].label}
            </button>

            <button
              type="button"
              onClick={() => {
                const curIdx = LAYOUT_ORDER.indexOf(config.display.layoutMode);
                const nextLayout = LAYOUT_ORDER[(curIdx + 1) % LAYOUT_ORDER.length]!;
                void updateConfig({ display: { layoutMode: nextLayout } });
              }}
              className="rounded bg-slate-800 px-2 py-0.5 text-amber-300 hover:bg-slate-700"
            >
              L: {LAYOUT_MODE_LABELS[config.display.layoutMode].label}
            </button>

            <button
              type="button"
              onClick={() => {
                const curIdx = MODE_ORDER.indexOf(config.display.visualMode);
                const nextMode = MODE_ORDER[(curIdx + 1) % MODE_ORDER.length]!;
                void updateConfig({ display: { visualMode: nextMode } });
              }}
              className="rounded bg-slate-800 px-2 py-0.5 text-cyan-300 hover:bg-slate-700"
            >
              V: {VISUAL_MODE_LABELS[config.display.visualMode].label}
            </button>

            {config.display.visualMode === 'anobar8-vfd' && (
              <button
                type="button"
                onClick={() => {
                  const curIdx = PALETTE_ORDER.indexOf(config.display.vfdPalette);
                  const nextPalette = PALETTE_ORDER[(curIdx + 1) % PALETTE_ORDER.length]!;
                  void updateConfig({ display: { vfdPalette: nextPalette } });
                }}
                className="rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
                style={{ color: VFD_PALETTES[config.display.vfdPalette].hex }}
              >
                C: {config.display.vfdPalette.toUpperCase()}
              </button>
            )}

            {stats && (
              <span className="hidden font-mono text-[11px] text-slate-400 md:inline">
                [{stats.effectiveScreenLayout.toUpperCase()}] {stats.logicalWidth}×{stats.logicalHeight} ({stats.fps}fps)
              </span>
            )}

            <button
              type="button"
              onClick={() => setShowQr((q) => !q)}
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
              title="Admin QR (Q)"
            >
              <QrCode className="h-3 w-3" />
              QR
            </button>
            <a
              href="/admin"
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
            >
              <SlidersHorizontal className="h-3 w-3" />
              Admin
            </a>
            <a
              href="/debug"
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-slate-200 hover:bg-slate-700"
            >
              <Monitor className="h-3 w-3" />
              Debug
            </a>
            <button
              type="button"
              onClick={() => {
                if (!document.fullscreenElement) {
                  void document.documentElement.requestFullscreen().catch(() => {});
                } else {
                  void document.exitFullscreen().catch(() => {});
                }
              }}
              className="rounded bg-slate-800 p-1 text-slate-200 hover:bg-slate-700"
              title="Fullscreen (F)"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
