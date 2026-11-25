import { useState, type FormEvent } from 'react';
import {
  CHANNEL_LABELS,
  PixelIconIdSchema,
  type AppConfig,
  type ChannelId,
  type PartialAppConfig,
  type PixelIconId,
  type PushMessageInput,
  type ScenePreset,
  type TickerItem,
} from '@cathobar/shared';
import {
  AlertTriangle,
  ExternalLink,
  History,
  Layers,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import { ToggleChip } from './AdminControls.js';

interface ControlTabProps {
  config: AppConfig;
  history: TickerItem[];
  updateConfig: (patch: PartialAppConfig) => Promise<void>;
  applyScene: (sceneId: string) => Promise<void>;
  pushMessage: (input: PushMessageInput) => Promise<void>;
  refreshHistory: () => Promise<void>;
}

export function ControlTab({
  config,
  history,
  updateConfig,
  applyScene,
  pushMessage,
  refreshHistory,
}: ControlTabProps) {
  const [pushText, setPushText] = useState('');
  const [pushBadge, setPushBadge] = useState('PUSH');
  const [pushColor, setPushColor] = useState('#ff66aa');
  const [pushOneShot, setPushOneShot] = useState(true);
  const [pushBreaking, setPushBreaking] = useState(false);
  const [pushIcon, setPushIcon] = useState<PixelIconId>('info');

  const [newSceneName, setNewSceneName] = useState('');
  const [newSceneTime, setNewSceneTime] = useState('');
  const [historyFilter, setHistoryFilter] = useState('');

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

  const handleSaveCurrentAsScene = async (e: FormEvent) => {
    e.preventDefault();
    const name = newSceneName.trim();
    if (!name) return;
    const nextScene: ScenePreset = {
      id: `scene-${Date.now()}`,
      name,
      activeChannel: config.activeChannel,
      rotationEnabled: config.rotation.enabled,
      visualMode: config.display.visualMode,
      vfdPalette: config.display.vfdPalette,
      layoutMode: config.display.layoutMode,
      brightness: config.display.brightness,
      showSpectrumAnalyzer: config.display.showSpectrumAnalyzer,
      showClockOverlay: config.display.showClockOverlay,
      showActivityGraph: config.display.showActivityGraph,
      scheduleStart: /^\d{2}:\d{2}$/.test(newSceneTime.trim()) ? newSceneTime.trim() : '',
    };
    await updateConfig({ scenes: [...config.scenes, nextScene] });
    setNewSceneName('');
    setNewSceneTime('');
  };

  const filteredHistory = historyFilter.trim()
    ? history.filter((item) => {
        const q = historyFilter.trim().toLowerCase();
        return (
          item.text.toLowerCase().includes(q) ||
          item.badge.toLowerCase().includes(q) ||
          item.source.toLowerCase().includes(q)
        );
      })
    : history;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Channels, Auto-Rotation & Push */}
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
              <ToggleChip label="1回のみ" checked={pushOneShot} onChange={setPushOneShot} />
              <ToggleChip label="緊急割り込み" checked={pushBreaking} onChange={setPushBreaking} />
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
              {pushBreaking ? <AlertTriangle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {pushBreaking ? '緊急速報として割り込み送信' : '今すぐ流す'}
            </button>
          </form>
        </div>
      </section>

      {/* Scene Presets & Recent Stream History */}
      <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
            <Layers className="h-4 w-4" />
            シーンプリセット & 時間帯スケジュール切替
          </h2>
          <div className="space-y-2">
            {config.scenes.map((scene) => (
              <div
                key={scene.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">{scene.name}</div>
                  <div className="text-[10px] text-slate-400">
                    {scene.activeChannel ?? '維持'} / {scene.visualMode ?? '維持'}
                    {scene.brightness ? ` / 輝度 ${scene.brightness}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="time"
                    value={scene.scheduleStart ?? ''}
                    onChange={(e) => {
                      const next = config.scenes.map((s) =>
                        s.id === scene.id ? { ...s, scheduleStart: e.target.value } : s,
                      );
                      void updateConfig({ scenes: next });
                    }}
                    title="毎日この時刻に自動適用"
                    className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => void applyScene(scene.id)}
                    className="rounded bg-cyan-500/20 px-2.5 py-1 font-medium text-cyan-200 hover:bg-cyan-500/35"
                  >
                    適用
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void updateConfig({
                        scenes: config.scenes.filter((s) => s.id !== scene.id),
                      })
                    }
                    className="p-1 text-slate-400 hover:text-red-400"
                    title="削除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={(e) => void handleSaveCurrentAsScene(e)} className="flex flex-wrap gap-2">
            <input
              type="text"
              value={newSceneName}
              onChange={(e) => setNewSceneName(e.target.value)}
              placeholder="現在の設定をシーン保存 (例: 朝ニュース)"
              className="min-w-40 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
            />
            <input
              type="time"
              value={newSceneTime}
              onChange={(e) => setNewSceneTime(e.target.value)}
              title="自動適用時刻 (任意)"
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs hover:bg-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
              保存
            </button>
          </form>
        </div>

        {/* Item History */}
        <div className="space-y-2.5 border-t border-slate-800 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
              <History className="h-4 w-4" />
              流れたアイテム履歴 ({filteredHistory.length}件)
            </h2>
            <button
              type="button"
              onClick={() => void refreshHistory()}
              className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
            >
              <RefreshCw className="h-3 w-3" />
              更新
            </button>
          </div>
          <input
            type="text"
            value={historyFilter}
            onChange={(e) => setHistoryFilter(e.target.value)}
            placeholder="履歴を検索 (キーワード / ソース名)..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs"
          />
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {filteredHistory.slice(0, 40).map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/70 px-2.5 py-1.5 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="rounded px-1.5 py-0.2 font-mono text-[10px] font-bold text-slate-950"
                      style={{ backgroundColor: item.color || '#38bdf8' }}
                    >
                      {item.badge}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {new Date(item.timestamp).toLocaleTimeString('ja-JP')}
                    </span>
                  </div>
                  <div className="mt-1 break-words text-slate-200">{item.text}</div>
                </div>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded p-1 text-cyan-400 hover:bg-slate-800"
                    title="記事リンクを開く"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ))}
            {filteredHistory.length === 0 && (
              <div className="py-4 text-center text-xs text-slate-500">該当する履歴はありません</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
