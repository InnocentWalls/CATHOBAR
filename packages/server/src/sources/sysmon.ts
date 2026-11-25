import { readFile } from 'node:fs/promises';
import { cpus, freemem, loadavg, totalmem, uptime, type CpuInfo } from 'node:os';
import {
  isChannelActiveInConfig,
  type AppConfig,
  type SysmonSourceConfig,
  type TickerItem,
} from '@cathobar/shared';
import type { SourceContext, TickerSource } from './types.js';

export interface SysmonMetrics {
  cpuPct: number;
  memUsedGb: number;
  memTotalGb: number;
  memPct: number;
  tempC: number | null;
  load1: number;
  uptimeSec: number;
}

/**
 * Computes average CPU utilization percentage [0..100] from two os.cpus() snapshots.
 */
export function computeCpuUsagePercent(prev: CpuInfo[], next: CpuInfo[]): number {
  let prevIdle = 0;
  let prevTotal = 0;
  for (const cpu of prev) {
    const t = cpu.times;
    prevIdle += t.idle;
    prevTotal += t.user + t.nice + t.sys + t.idle + t.irq;
  }

  let nextIdle = 0;
  let nextTotal = 0;
  for (const cpu of next) {
    const t = cpu.times;
    nextIdle += t.idle;
    nextTotal += t.user + t.nice + t.sys + t.idle + t.irq;
  }

  const totalDiff = nextTotal - prevTotal;
  const idleDiff = nextIdle - prevIdle;
  if (totalDiff <= 0) return 0;
  const usage = ((totalDiff - idleDiff) / totalDiff) * 100;
  return Math.max(0, Math.min(100, Math.round(usage * 10) / 10));
}

function formatUptime(sec: number): string {
  const days = Math.floor(sec / 86_400);
  const hours = Math.floor((sec % 86_400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  if (days > 0) return `${days}d${hours}h`;
  if (hours > 0) return `${hours}h${mins}m`;
  return `${mins}m`;
}

/**
 * Formats system metrics into persistent & optional thermal-alert TickerItems.
 */
export function formatSysmonItems(
  metrics: SysmonMetrics,
  cfg: SysmonSourceConfig,
  nowMs = Date.now(),
  canBreak = false,
): TickerItem[] {
  const parts = [
    `CPU ${metrics.cpuPct.toFixed(0)}%`,
    `MEM ${metrics.memPct.toFixed(0)}% (${metrics.memUsedGb.toFixed(1)}/${metrics.memTotalGb.toFixed(1)}GB)`,
  ];
  if (metrics.tempC !== null) {
    parts.push(`TEMP ${metrics.tempC.toFixed(1)}℃`);
  }
  if (metrics.load1 > 0) {
    parts.push(`LOAD ${metrics.load1.toFixed(2)}`);
  }
  parts.push(`UP ${formatUptime(metrics.uptimeSec)}`);

  const isHot = metrics.tempC !== null && metrics.tempC >= cfg.highTempThresholdC;
  const isBusy = metrics.cpuPct >= 90 || metrics.memPct >= 90;

  const items: TickerItem[] = [
    {
      id: `sysmon-${nowMs}`,
      source: 'sysmon',
      badge: 'SYSMON',
      text: parts.join(' / '),
      color: isHot ? '#ef4444' : isBusy ? '#f59e0b' : '#38fad9',
      timestamp: nowMs,
      priority: isHot || isBusy ? 'high' : 'normal',
      oneShot: false,
      breaking: false,
      icon: 'cpu',
      replaceKey: 'sysmon:host',
      sourceKey: 'sysmon:host',
    },
  ];

  if (isHot && cfg.alertOnHighTemp && canBreak && metrics.tempC !== null) {
    items.push({
      id: `sysmon-hot-${nowMs}`,
      source: 'sysmon',
      badge: 'CPU高温',
      text: `【高温警告】CPU温度が ${metrics.tempC.toFixed(1)}℃ に達しました (閾値 ${cfg.highTempThresholdC}℃)`,
      color: '#ef4444',
      timestamp: nowMs,
      priority: 'high',
      oneShot: true,
      breaking: true,
      icon: 'alert',
    });
  }

  return items;
}

export class SysmonSource implements TickerSource {
  readonly id = 'sysmon' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalSec = 15;
  private prevCpus: CpuInfo[] = cpus();
  private tempCooldownUntil = 0;

  constructor(private readonly ctx: SourceContext) {}

  start(): void {
    this.onConfigUpdate(this.ctx.getConfig());
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.ctx.updateStatus({ id: this.id, active: false, connected: false });
  }

  onConfigUpdate(config: AppConfig): void {
    if (!this.isConfigActive(config)) {
      this.stop();
      return;
    }
    const intervalChanged = this.pollIntervalSec !== config.sources.sysmon.pollIntervalSec;
    const wasStopped = !this.timer;
    if (wasStopped || intervalChanged) {
      this.pollIntervalSec = config.sources.sysmon.pollIntervalSec;
      this.syncTimer();
    }
    if (wasStopped || intervalChanged) {
      void this.refreshNow();
    }
  }

  async refreshNow(): Promise<void> {
    const config = this.ctx.getConfig();
    if (!this.isConfigActive(config)) {
      this.ctx.updateStatus({ id: this.id, active: false, connected: false });
      return;
    }

    const cfg = config.sources.sysmon;
    const nextCpus = cpus();
    const cpuPct = computeCpuUsagePercent(this.prevCpus, nextCpus);
    this.prevCpus = nextCpus;

    const total = totalmem();
    const free = freemem();
    const used = Math.max(0, total - free);
    const memTotalGb = total / 1024 ** 3;
    const memUsedGb = used / 1024 ** 3;
    const memPct = total > 0 ? (used / total) * 100 : 0;
    const load1 = loadavg()[0] ?? 0;
    const tempC = await readCpuTempC();

    const nowMs = Date.now();
    const canBreak = nowMs >= this.tempCooldownUntil;
    const items = formatSysmonItems(
      {
        cpuPct,
        memUsedGb,
        memTotalGb,
        memPct,
        tempC,
        load1,
        uptimeSec: uptime(),
      },
      cfg,
      nowMs,
      canBreak,
    );

    if (items.some((i) => i.breaking)) {
      this.tempCooldownUntil = nowMs + 5 * 60_000;
    }

    this.ctx.emitItems(items);
    this.ctx.updateStatus({
      id: this.id,
      active: true,
      connected: true,
      lastFetchAt: nowMs,
      lastError: null,
    });
  }

  private isConfigActive(config: AppConfig): boolean {
    return (
      config.sources.sysmon.enabled &&
      (isChannelActiveInConfig(config, 'system') || config.sources.sysmon.alertOnHighTemp)
    );
  }

  private syncTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.pollIntervalSec = this.ctx.getConfig().sources.sysmon.pollIntervalSec;
    this.timer = setInterval(() => {
      void this.refreshNow();
    }, this.pollIntervalSec * 1000);
  }
}

async function readCpuTempC(): Promise<number | null> {
  if (process.platform !== 'linux') return null;
  try {
    const raw = (await readFile('/sys/class/thermal/thermal_zone0/temp', 'utf-8')).trim();
    const val = Number(raw);
    if (!Number.isFinite(val) || val <= 0) return null;
    return val > 200 ? val / 1000 : val;
  } catch {
    return null;
  }
}
