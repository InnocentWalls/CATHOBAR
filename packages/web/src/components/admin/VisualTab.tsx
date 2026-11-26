import { useEffect, useState } from 'react';
import {
  BOOT_GLYPH_STYLE_LABELS,
  BOOT_MESSAGE_MODE_LABELS,
  BOOT_SEQUENCE_MODE_LABELS,
  LAYOUT_MODE_LABELS,
  SCREEN_LAYOUT_LABELS,
  SHINKANSEN_STYLE_LABELS,
  VFD_PALETTES,
  VISUAL_MODE_LABELS,
  type AppConfig,
  type BootGlyphStyle,
  type BootMessageMode,
  type BootReplayInput,
  type BootSequenceMode,
  type LayoutMode,
  type NightModeBehavior,
  type PartialAppConfig,
  type ScreenLayoutMode,
  type ShinkansenScrollStyle,
  type SpectrumAudioInput,
  type VfdPalette,
  type VisualMode,
} from '@cathobar/shared';
import { Copy, Moon, Play, Volume2 } from 'lucide-react';
import { playBreakingAlertChime, unlockAlertAudio, type AlertSoundKind } from '../../engine/alert-audio.js';
import { SliderField, ToggleChip } from './AdminControls.js';

interface VisualTabProps {
  config: AppConfig;
  baseHost: string;
  updateConfig: (patch: PartialAppConfig) => Promise<void>;
  replayBoot: (input?: BootReplayInput) => Promise<void>;
}

export function VisualTab({ config, baseHost, updateConfig, replayBoot }: VisualTabProps) {
  const [copiedObs, setCopiedObs] = useState(false);
  const [customBootMsg, setCustomBootMsg] = useState(config.display.bootCustomMessage);
  const obsUrl = `${baseHost}/?transparent=1&hideHud=1`;

  useEffect(() => {
    setCustomBootMsg(config.display.bootCustomMessage);
  }, [config.display.bootCustomMessage]);

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
            画面レイアウト（横長バー / 16:9 フルHD・4K全面表示）
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(SCREEN_LAYOUT_LABELS) as ScreenLayoutMode[]).map((sl) => (
              <button
                key={sl}
                type="button"
                onClick={() => void updateConfig({ display: { screenLayout: sl } })}
                className={`rounded-lg border p-2 text-left transition ${
                  config.display.screenLayout === sl
                    ? 'border-emerald-400 bg-emerald-500/15 text-white'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold">{SCREEN_LAYOUT_LABELS[sl].label}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-slate-400">
                  {SCREEN_LAYOUT_LABELS[sl].description}
                </div>
              </button>
            ))}
          </div>
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
            label="縦ドット解像度 (バー用 px)"
            value={config.display.logicalHeight}
            min={48}
            max={192}
            step={8}
            onChange={(v) => void updateConfig({ display: { logicalHeight: v } })}
          />
          <SliderField
            label="16:9 基準横ドット数 (px)"
            value={config.display.boardLogicalWidth}
            min={384}
            max={960}
            step={32}
            onChange={(v) => void updateConfig({ display: { boardLogicalWidth: v } })}
          />
          <SliderField
            label="ティッカー壁 行数 (Wall)"
            value={config.display.wallLanes}
            min={2}
            max={10}
            step={1}
            onChange={(v) => void updateConfig({ display: { wallLanes: v } })}
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
            OBS のブラウザソースに貼り付けると背景透過・HUD非表示で動作します（<code>&amp;channel=rss</code> や <code>&amp;screen=bar</code> / <code>&amp;screen=board</code> も指定可）。
          </p>
        </div>
      </section>

      {/* Boot Sequence Ritual */}
      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-fuchsia-300">
              起動シーケンス（ブート儀式・暗号ティッカー演出）
            </h2>
            <p className="text-[11px] text-slate-400">
              接続起動時や「B」キー／再生ボタン時に全表示端末で実行する起動アニメーションを設定します
            </p>
          </div>
          <button
            type="button"
            onClick={() => void replayBoot()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-fuchsia-400"
          >
            <Play className="h-3.5 w-3.5" />
            現在の設定で起動演出を再生
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(BOOT_SEQUENCE_MODE_LABELS) as BootSequenceMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => void updateConfig({ display: { bootSequenceMode: mode } })}
              className={`rounded-lg border p-2.5 text-left transition ${
                config.display.bootSequenceMode === mode
                  ? 'border-fuchsia-400 bg-fuchsia-500/15 text-white'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="text-xs font-semibold">
                {BOOT_SEQUENCE_MODE_LABELS[mode].label}
              </div>
              <div className="mt-1 text-[11px] leading-snug text-slate-400">
                {BOOT_SEQUENCE_MODE_LABELS[mode].description}
              </div>
            </button>
          ))}
        </div>

        {config.display.bootSequenceMode === 'auto' && (
          <div>
            <div className="mb-1.5 text-xs text-slate-400">
              自動モード時の幾何学グリフ造形（VFD / FED / クリーン時に使用）
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(BOOT_GLYPH_STYLE_LABELS) as BootGlyphStyle[]).map((gs) => (
                <button
                  key={gs}
                  type="button"
                  onClick={() => void updateConfig({ display: { bootGlyphStyle: gs } })}
                  className={`rounded-lg border p-2 text-left transition ${
                    config.display.bootGlyphStyle === gs
                      ? 'border-cyan-400 bg-cyan-500/15 text-white'
                      : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-semibold">{BOOT_GLYPH_STYLE_LABELS[gs].label}</div>
                  <div className="mt-0.5 text-[10px] leading-snug text-slate-400">
                    {BOOT_GLYPH_STYLE_LABELS[gs].description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <ToggleChip
                label="スキャン復号レンズ (中央線で英字へ復号)"
                checked={config.display.bootDecodeScan}
                onChange={(v) => void updateConfig({ display: { bootDecodeScan: v } })}
              />
            </div>

            <div>
              <div className="mb-1.5 text-xs text-slate-400">起動メッセージ内容</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(BOOT_MESSAGE_MODE_LABELS) as BootMessageMode[]).map((mm) => (
                  <button
                    key={mm}
                    type="button"
                    onClick={() => void updateConfig({ display: { bootMessageMode: mm } })}
                    className={`rounded-lg border p-2 text-left transition ${
                      config.display.bootMessageMode === mm
                        ? 'border-emerald-400 bg-emerald-500/15 text-white'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold">
                      {BOOT_MESSAGE_MODE_LABELS[mm].label}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-snug text-slate-400">
                      {BOOT_MESSAGE_MODE_LABELS[mm].description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {config.display.bootMessageMode === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={240}
                  value={customBootMsg}
                  placeholder="例: CATHOBAR // MY WORKSTATION READY"
                  onChange={(e) => setCustomBootMsg(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void updateConfig({ display: { bootCustomMessage: customBootMsg } });
                    }
                  }}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-100"
                />
                <button
                  type="button"
                  onClick={() =>
                    void updateConfig({ display: { bootCustomMessage: customBootMsg } })
                  }
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-slate-700"
                >
                  保存
                </button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <SliderField
              label="起動演出時間 (秒)"
              value={config.display.bootDurationSec}
              min={4}
              max={20}
              step={1}
              onChange={(v) => void updateConfig({ display: { bootDurationSec: v } })}
            />

            <div>
              <div className="mb-1.5 text-xs text-slate-400">
                全モード クイック試写（クリックで即座に全端末・上部プレビューで再生）
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['glyph-circuit', '回路グリフ'],
                    ['glyph-oscilloscope', '陰極線オシロ'],
                    ['glyph-hex', 'ハニカム格子'],
                    ['led-test', '3色LEDテスト'],
                    ['flap-cascade', 'パタパタ回転'],
                  ] as Array<[BootSequenceMode, string]>
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => void replayBoot({ mode })}
                    className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-fuchsia-200 hover:border-fuchsia-400 hover:bg-fuchsia-500/15"
                  >
                    <Play className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
