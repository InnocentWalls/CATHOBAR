import { useState, type FormEvent } from 'react';
import {
  Database,
  KeyRound,
  LogOut,
  Monitor,
  Radio,
  Settings2,
  Sliders,
  Sparkles,
  Tv,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { TickerCanvas } from '../components/TickerCanvas.js';
import { ControlTab } from '../components/admin/ControlTab.js';
import { SourcesTab } from '../components/admin/SourcesTab.js';
import { SystemTab } from '../components/admin/SystemTab.js';
import { VisualTab } from '../components/admin/VisualTab.js';
import { useCathobar } from '../hooks/useCathobar.js';

type AdminTabId = 'control' | 'visual' | 'sources' | 'system';

const TABS: Array<{ id: AdminTabId; label: string; icon: typeof Sliders }> = [
  { id: 'control', label: 'コントロール・履歴', icon: Sliders },
  { id: 'visual', label: 'ビジュアル・夜間', icon: Sparkles },
  { id: 'sources', label: 'データソース', icon: Database },
  { id: 'system', label: 'フィルター・システム', icon: Settings2 },
];

export function AdminPage() {
  const {
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
  } = useCathobar();

  const [activeTab, setActiveTab] = useState<AdminTabId>('control');
  const [tokenInput, setTokenInput] = useState('');
  const [tokenFailed, setTokenFailed] = useState(false);
  const baseHost = lanUrls[0] ?? window.location.origin;

  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await setAuthToken(tokenInput);
    if (ok) {
      setTokenInput('');
      setTokenFailed(false);
    } else {
      setTokenFailed(true);
    }
  };

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
            {authRequired && !authError && (
              <button
                type="button"
                onClick={clearAuthToken}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                <LogOut className="h-3.5 w-3.5" />
                認証解除
              </button>
            )}
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
              sensors={sensors}
              lanUrls={lanUrls}
              bootEvent={bootEvent}
              disableAutoBoot={true}
            />
          </div>
        </div>

        {/* Navigation tabs */}
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {authRequired && authError && (
          <form
            onSubmit={(e) => void handleUnlock(e)}
            className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs"
          >
            <div className="flex items-center gap-2 font-semibold text-amber-200">
              <KeyRound className="h-4 w-4 shrink-0" />
              <span>操作には API 認証トークン (`CATHOBAR_TOKEN`) が必要です</span>
            </div>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value);
                if (tokenFailed) setTokenFailed(false);
              }}
              placeholder="CATHOBAR_TOKEN を入力"
              className="min-w-48 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-100"
            />
            <button
              type="submit"
              className="rounded-lg bg-cyan-500 px-3.5 py-1.5 font-semibold text-slate-950 hover:bg-cyan-400"
            >
              認証
            </button>
            {tokenFailed && <span className="text-red-300">トークンが正しくありません</span>}
          </form>
        )}
        {activeTab === 'control' && (
          <ControlTab
            config={config}
            history={history}
            updateConfig={updateConfig}
            applyScene={applyScene}
            pushMessage={pushMessage}
            refreshHistory={refreshHistory}
          />
        )}
        {activeTab === 'visual' && (
          <VisualTab
            config={config}
            baseHost={baseHost}
            updateConfig={updateConfig}
            replayBoot={replayBoot}
          />
        )}
        {activeTab === 'sources' && (
          <SourcesTab
            connected={connected}
            config={config}
            statuses={statuses}
            nowPlaying={nowPlaying}
            sensors={sensors}
            updateConfig={updateConfig}
            pushMessage={pushMessage}
            pushNowPlaying={pushNowPlaying}
            pushSensor={pushSensor}
            refreshSource={refreshSource}
          />
        )}
        {activeTab === 'system' && (
          <SystemTab
            config={config}
            statuses={statuses}
            lanUrls={lanUrls}
            baseHost={baseHost}
            updateConfig={updateConfig}
            importConfig={importConfig}
            exportConfig={exportConfig}
          />
        )}
      </main>
    </div>
  );
}
