import {
  isChannelActiveInConfig,
  type AppConfig,
  type CountdownEvent,
  type TickerItem,
} from '@cathobar/shared';
import type { SourceContext, TickerSource } from './types.js';

/**
 * Formats remaining duration for a CountdownEvent into persistent & optional breaking-alert items.
 */
export function formatCountdownEvent(
  ev: CountdownEvent,
  nowMs: number,
  triggeredIds?: Set<string>,
): TickerItem[] {
  const targetMs = Date.parse(ev.targetIso);
  if (!Number.isFinite(targetMs)) return [];

  const diffMs = targetMs - nowMs;
  const items: TickerItem[] = [];

  if (diffMs <= 0) {
    const elapsedMin = Math.floor(Math.abs(diffMs) / 60_000);
    items.push({
      id: `countdown-${ev.id}-${nowMs}`,
      source: 'countdown',
      badge: 'COUNTDOWN',
      text: `${ev.title}: 到達！ (${elapsedMin > 0 ? `${elapsedMin}分経過` : 'JUST NOW'})`,
      color: '#f59e0b',
      timestamp: nowMs,
      priority: 'high',
      oneShot: false,
      breaking: false,
      icon: 'timer',
      replaceKey: `countdown:${ev.id}`,
      sourceKey: `countdown:${ev.id}`,
    });

    if (
      ev.alertOnComplete &&
      triggeredIds &&
      !triggeredIds.has(ev.id) &&
      Math.abs(diffMs) < 120_000
    ) {
      triggeredIds.add(ev.id);
      items.push({
        id: `countdown-done-${ev.id}-${nowMs}`,
        source: 'countdown',
        badge: 'TIMER',
        text: `【カウントダウン完了】${ev.title} の時刻になりました！`,
        color: '#f59e0b',
        timestamp: nowMs,
        priority: 'high',
        oneShot: true,
        breaking: true,
        icon: 'timer',
      });
    }
    return items;
  }

  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}日`);
  if (hours > 0 || days > 0) parts.push(`${hours}時間`);
  parts.push(`${mins}分`);

  items.push({
    id: `countdown-${ev.id}-${nowMs}`,
    source: 'countdown',
    badge: 'COUNTDOWN',
    text: `${ev.title} まで あと ${parts.join(' ')}`,
    color: '#38bdf8',
    timestamp: nowMs,
    priority: totalSec <= 300 ? 'high' : 'normal',
    oneShot: false,
    breaking: false,
    icon: 'timer',
    replaceKey: `countdown:${ev.id}`,
    sourceKey: `countdown:${ev.id}`,
  });

  return items;
}

export class CountdownSource implements TickerSource {
  readonly id = 'countdown' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private triggeredIds = new Set<string>();

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
    if (!this.timer) {
      this.timer = setInterval(() => {
        void this.refreshNow();
      }, 30_000);
    }
    void this.refreshNow();
  }

  async refreshNow(): Promise<void> {
    const config = this.ctx.getConfig();
    if (!this.isConfigActive(config)) {
      this.ctx.updateStatus({ id: this.id, active: false, connected: false });
      return;
    }

    const enabled = config.sources.countdown.events.filter((e) => e.enabled);
    const now = Date.now();
    const collected: TickerItem[] = [];

    for (const ev of enabled) {
      collected.push(...formatCountdownEvent(ev, now, this.triggeredIds));
    }

    if (collected.length > 0) {
      this.ctx.emitItems(collected);
    }

    this.ctx.updateStatus({
      id: this.id,
      active: true,
      connected: true,
      lastFetchAt: now,
      lastError: null,
    });
  }

  private isConfigActive(config: AppConfig): boolean {
    return (
      config.sources.countdown.enabled &&
      config.sources.countdown.events.some((e) => e.enabled) &&
      isChannelActiveInConfig(config, 'countdown')
    );
  }
}
