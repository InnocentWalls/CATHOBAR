import { useMemo, useState, type ChangeEvent } from 'react';
import {
  SOURCE_WEIGHT_LABELS,
  type AppConfig,
  type PartialAppConfig,
  type SourceStatus,
  type SourceWeights,
} from '@cathobar/shared';
import { Activity, Download, Upload, Webhook } from 'lucide-react';
import { renderQrSvg } from '../../engine/qrcode.js';
import { SliderField, ToggleChip } from './AdminControls.js';

interface SystemTabProps {
  config: AppConfig;
  statuses: SourceStatus[];
  lanUrls: string[];
  baseHost: string;
  updateConfig: (patch: PartialAppConfig) => Promise<void>;
  importConfig: (raw: unknown) => Promise<boolean>;
  exportConfig: () => Promise<boolean>;
}

export function SystemTab({
  config,
  statuses,
  lanUrls,
  baseHost,
  updateConfig,
  importConfig,
  exportConfig,
}: SystemTabProps) {
  const [muteInput, setMuteInput] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const primaryAdminUrl = `${lanUrls[0] ?? baseHost}/admin`;
  const qrSvg = useMemo(() => renderQrSvg(primaryAdminUrl, 136), [primaryAdminUrl]);

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      const ok = await importConfig(json);
      setImportMsg(ok ? '設定をインポートしました' : '設定の形式が不正です');
    } catch {
      setImportMsg('JSON の読み込みに失敗しました');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Global NG Words & Weights */}
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

      {/* Webhook, Backup/Restore & LAN QR */}
      <section className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="space-y-2.5">
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
            <div className="text-slate-400">
              # generic / github / gitlab / homeassistant / alert / uptime-kuma / alertmanager / discord / slack / cloudflare
            </div>
            <div className="truncate text-cyan-300">
              curl -X POST {baseHost}/api/webhook/uptime-kuma -H &quot;Content-Type: application/json&quot; -d &apos;&#123;&quot;monitor&quot;:&#123;&quot;name&quot;:&quot;Web&quot;&#125;,&quot;heartbeat&quot;:&#123;&quot;status&quot;:0&#125;&#125;&apos;
            </div>
          </div>
        </div>

        {/* Config Export / Import */}
        <div className="space-y-2.5 border-t border-slate-800 pt-4">
          <h2 className="text-sm font-semibold text-cyan-300">設定バックアップ・復元 (JSON)</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                void exportConfig().then((ok) => {
                  if (!ok) setImportMsg('エクスポートに失敗しました（認証を確認してください）');
                });
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 font-medium text-slate-200 hover:bg-slate-700"
            >
              <Download className="h-3.5 w-3.5" />
              設定をエクスポート
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 font-medium text-slate-200 hover:border-cyan-400">
              <Upload className="h-3.5 w-3.5" />
              JSON をインポート
              <input type="file" accept=".json,application/json" onChange={(e) => void handleImportFile(e)} className="hidden" />
            </label>
            {importMsg && <span className="text-cyan-300">{importMsg}</span>}
          </div>
        </div>

        {/* LAN QR & URLs */}
        <div className="space-y-2.5 border-t border-slate-800 pt-4">
          <h2 className="text-sm font-semibold text-cyan-300">LAN アクセスURL & スマホ用 QR</h2>
          <div className="flex flex-wrap items-center gap-4">
            <div
              className="overflow-hidden rounded-lg border border-slate-700 bg-white p-1"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="min-w-0 flex-1 space-y-1.5 text-xs">
              {lanUrls.length > 0 ? (
                lanUrls.map((url) => (
                  <div
                    key={url}
                    className="truncate rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 font-mono text-slate-300"
                  >
                    <span className="text-cyan-300">{url}/admin</span>
                  </div>
                ))
              ) : (
                <div className="font-mono text-slate-400">{primaryAdminUrl}</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Source Statuses */}
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
        <h2 className="text-sm font-semibold text-cyan-300">全ソース稼働ステータス</h2>
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
    </div>
  );
}
