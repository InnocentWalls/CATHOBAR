import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHANNEL_LABELS,
  LAYOUT_MODE_LABELS,
  VFD_PALETTES,
  VISUAL_MODE_LABELS,
  type ChannelId,
  type LayoutMode,
  type VfdPalette,
  type VisualMode,
} from '@cathobar/shared';
import { Maximize2, Monitor, SlidersHorizontal } from 'lucide-react';
import { TickerCanvas } from '../components/TickerCanvas.js';
import type { EngineStats } from '../engine/ticker-engine.js';
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
  'clock',
];
const MODE_ORDER: VisualMode[] = ['anobar8-vfd', 'anobar-fed', 'shinkansen-led', 'clean'];
const PALETTE_ORDER: VfdPalette[] = ['cyan', 'green', 'white', 'amber'];
const LAYOUT_ORDER: LayoutMode[] = ['auto', 'lanes', 'danmaku'];

export function DisplayPage() {
  const { connected, config, items, lastBatch, activity, nowPlaying, updateConfig } = useCathobar();
  const [hudVisible, setHudVisible] = useState(false);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const hideTimer = useRef<number | null>(null);

  const showHudTemporarily = useCallback(() => {
    setHudVisible(true);
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
    }
    hideTimer.current = window.setTimeout(() => {
      setHudVisible(false);
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimer.current !== null) {
        clearTimeout(hideTimer.current);
      }
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

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-black select-none"
      onMouseMove={showHudTemporarily}
      onTouchStart={showHudTemporarily}
    >
      <TickerCanvas
        config={config}
        items={items}
        lastBatch={lastBatch}
        activity={activity}
        nowPlaying={nowPlaying}
        onStats={setStats}
      />

      {!connected && (
        <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-red-950/80 px-2 py-0.5 font-mono text-[10px] text-red-300">
          RECONNECTING...
        </div>
      )}

      <div
        className={`absolute inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-2 bg-slate-950/85 px-3 py-1.5 backdrop-blur-md transition-opacity duration-300 ${
          hudVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="flex flex-wrap items-center gap-1">
          {CHANNEL_ORDER.map((ch, idx) => {
            const keyHint = idx === 9 ? '0' : String(idx + 1);
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
              {stats.logicalWidth}×{stats.logicalHeight} ({stats.fps}fps)
            </span>
          )}

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
    </div>
  );
}
