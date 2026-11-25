import { useState } from 'react';
import {
  LAYOUT_MODE_LABELS,
  SHINKANSEN_STYLE_LABELS,
  VFD_PALETTES,
  VISUAL_MODE_LABELS,
  type AppConfig,
  type LayoutMode,
  type NightModeBehavior,
  type PartialAppConfig,
  type ShinkansenScrollStyle,
  type SpectrumAudioInput,
  type VfdPalette,
  type VisualMode,
} from '@cathobar/shared';
import { Copy, Moon, Volume2 } from 'lucide-react';
import { playBreakingAlertChime, unlockAlertAudio, type AlertSoundKind } from '../../engine/alert-audio.js';
import { SliderField, ToggleChip } from './AdminControls.js';

interface VisualTabProps {
  config: AppConfig;
  baseHost: string;
  updateConfig: (patch: PartialAppConfig) => Promise<void>;
}

export function VisualTab({ config, baseHost, updateConfig }: VisualTabProps) {
  const [copiedObs, setCopiedObs] = useState(false);
  const obsUrl = `${baseHost}/?transparent=1&hideHud=1`;

  const copyObsUrl = () => {
    void navigator.clipboard?.writeText(obsUrl).then(() => {
      setCopiedObs(true);
      setTimeout(() => setCopiedObs(false), 2000);
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Visual modes & layout */}
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
          <div className="mb-1.5 text-xs text-slate-400">
            流し方レイアウト（通常レーン / ニコニコ風弾幕）
          </div>
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
      </section>

      {/* Toggles, Audio, Night Mode & OBS */}
      <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-cyan-300">表示オプション & チャイム音</h2>
          <div className="flex flex-wrap gap-2 text-xs">
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

          <div className="grid gap-3 pt-1 sm:grid-cols-2">
            <SliderField
              label="チャイム音量"
              value={config.display.breakingAlertVolume}
              min={0.05}
              max={1}
              step={0.05}
              onChange={(v) => void updateConfig({ display: { breakingAlertVolume: v } })}
            />
            <label className="block text-xs">
              <div className="mb-1 text-slate-400">スペクトラムアナライザ入力</div>
              <select
                value={config.display.spectrumAudioInput}
                onChange={(e) =>
                  void updateConfig({
                    display: { spectrumAudioInput: e.target.value as SpectrumAudioInput },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5"
              >
                <option value="auto">自動 (再生検出 / 外部レベル)</option>
                <option value="synth">常時シンセサイザ波形</option>
                <option value="mic">マイク / ライン入力 (要ブラウザ許可)</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 text-slate-400">
              <Volume2 className="h-3.5 w-3.5" />
              試聴:
            </span>
            {(
              [
                ['eew', '緊急地震速報'],
                ['quake', '地震'],
                ['news', 'NHK速報'],
                ['timer', '予定/タイマー'],
                ['default', '標準Push'],
              ] as Array<[AlertSoundKind, string]>
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  unlockAlertAudio();
                  playBreakingAlertChime(kind, config.display.breakingAlertVolume);
                }}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-400"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Night mode */}
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <Moon className="h-4 w-4" />
              ナイトモード（自動減光・消灯スケジュール）
            </h2>
            <ToggleChip
              label="有効"
              checked={config.nightMode.enabled}
              onChange={(v) => void updateConfig({ nightMode: { enabled: v } })}
            />
          </div>

          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-slate-400">開始時刻</span>
              <input
                type="time"
                value={config.nightMode.startTime}
                onChange={(e) =>
                  void updateConfig({ nightMode: { startTime: e.target.value || '23:00' } })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">終了時刻</span>
              <input
                type="time"
                value={config.nightMode.endTime}
                onChange={(e) =>
                  void updateConfig({ nightMode: { endTime: e.target.value || '07:00' } })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">夜間挙動</span>
              <select
                value={config.nightMode.behavior}
                onChange={(e) =>
                  void updateConfig({
                    nightMode: { behavior: e.target.value as NightModeBehavior },
                  })
                }
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1"
              >
                <option value="dim">減光表示 (Dim)</option>
                <option value="clock-only">時計のみ (Clock)</option>
                <option value="blackout">画面消灯 (速報時のみ点灯)</option>
              </select>
            </label>
          </div>

          <div className="grid items-center gap-3 sm:grid-cols-2">
            <SliderField
              label="夜間輝度"
              value={config.nightMode.brightness}
              min={0.1}
              max={1.0}
              step={0.05}
              onChange={(v) => void updateConfig({ nightMode: { brightness: v } })}
            />
            <div className="pt-2">
              <ToggleChip
                label="夜間VFDをアンバー配色に"
                checked={config.nightMode.forceAmberVfd}
                onChange={(v) => void updateConfig({ nightMode: { forceAmberVfd: v } })}
              />
            </div>
          </div>
        </div>

        {/* OBS Overlay URL */}
        <div className="space-y-2 border-t border-slate-800 pt-4">
          <h2 className="text-sm font-semibold text-cyan-300">OBS / 配信用 透過オーバーレイ URL</h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={obsUrl}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-cyan-300"
            />
            <button
              type="button"
              onClick={copyObsUrl}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
            >
              <Copy className="h-3.5 w-3.5" />
              {copiedObs ? 'コピー済' : 'コピー'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            OBS のブラウザソースに貼り付けると背景透過・HUD非表示で動作します（<code>&amp;channel=rss</code> 等も指定可）。
          </p>
        </div>
      </section>
    </div>
  );
}
