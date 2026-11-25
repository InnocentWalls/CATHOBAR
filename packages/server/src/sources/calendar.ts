import { createHash } from 'node:crypto';
import {
  isChannelActiveInConfig,
  type AppConfig,
  type CalendarFeedConfig,
  type TickerItem,
} from '@cathobar/shared';
import { cleanText, type SourceContext, type TickerSource } from './types.js';

export interface ParsedIcsEvent {
  uid: string;
  summary: string;
  location: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
}

function unfoldIcsLines(icsText: string): string[] {
  return icsText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

function unescapeIcsValue(val: string): string {
  return cleanText(
    val
      .replace(/\\n/gi, ' ')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\'),
  );
}

function parseIcsDateTime(rawValue: string, paramsPart: string): { ms: number; allDay: boolean } | null {
  const val = rawValue.trim();
  const isDateOnly = /VALUE=DATE\b/i.test(paramsPart) || /^\d{8}$/.test(val);
  if (isDateOnly) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(val);
    if (!m) return null;
    const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
    return Number.isFinite(ms) ? { ms, allDay: true } : null;
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/i.exec(val);
  if (!m) {
    const fallback = Date.parse(val);
    return Number.isFinite(fallback) ? { ms: fallback, allDay: false } : null;
  }

  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const min = Number(m[5]);
  const sec = Number(m[6]);
  const isUtc = m[7]?.toUpperCase() === 'Z';

  const ms = isUtc
    ? Date.UTC(year, month, day, hour, min, sec)
    : new Date(year, month, day, hour, min, sec).getTime();
  return Number.isFinite(ms) ? { ms, allDay: false } : null;
}

/**
 * Parses VEVENT blocks from an iCal (.ics) document within [nowMs, nowMs + windowHours].
 */
export function parseIcsEvents(
  icsText: string,
  nowMs: number,
  windowHours: number,
): ParsedIcsEvent[] {
  const lines = unfoldIcsLines(icsText);
  const events: ParsedIcsEvent[] = [];
  const windowEndMs = nowMs + windowHours * 3_600_000;

  let inEvent = false;
  let uid = '';
  let summary = '';
  let location = '';
  let start: { ms: number; allDay: boolean } | null = null;
  let end: { ms: number; allDay: boolean } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      uid = '';
      summary = '';
      location = '';
      start = null;
      end = null;
      continue;
    }
    if (trimmed === 'END:VEVENT') {
      if (inEvent && summary && start) {
        const defaultDuration = start.allDay ? 86_400_000 : 3_600_000;
        const endMs = end ? end.ms : start.ms + defaultDuration;
        const isOngoing = start.ms <= nowMs && endMs > nowMs;
        const isUpcoming = start.ms > nowMs && start.ms <= windowEndMs;
        if (isOngoing || isUpcoming) {
          events.push({
            uid: uid || `${summary}:${start.ms}`,
            summary,
            location,
            startMs: start.ms,
            endMs,
            allDay: start.allDay,
          });
        }
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx <= 0) continue;
    const keyPart = line.slice(0, colonIdx);
    const valuePart = line.slice(colonIdx + 1);
    const semiIdx = keyPart.indexOf(';');
    const propName = (semiIdx >= 0 ? keyPart.slice(0, semiIdx) : keyPart).toUpperCase();
    const paramsPart = semiIdx >= 0 ? keyPart.slice(semiIdx + 1) : '';

    if (propName === 'UID') {
      uid = valuePart.trim();
    } else if (propName === 'SUMMARY') {
      summary = unescapeIcsValue(valuePart);
    } else if (propName === 'LOCATION') {
      location = unescapeIcsValue(valuePart);
    } else if (propName === 'DTSTART') {
      start = parseIcsDateTime(valuePart, paramsPart);
    } else if (propName === 'DTEND') {
      end = parseIcsDateTime(valuePart, paramsPart);
    }
  }

  events.sort((a, b) => a.startMs - b.startMs);
  return events.slice(0, 10);
}

function formatClockHHMM(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatCalendarEventsToItems(
  events: ParsedIcsEvent[],
  feed: CalendarFeedConfig,
  nowMs: number,
  alertBeforeMinutes: number,
  alertedKeys?: Set<string>,
): TickerItem[] {
  const out: TickerItem[] = [];
  const color = feed.color ?? '#a78bfa';

  for (const ev of events) {
    const idHash = createHash('sha1')
      .update(`${feed.id}:${ev.uid}:${ev.startMs}`)
      .digest('hex')
      .slice(0, 14);
    const diffMin = Math.ceil((ev.startMs - nowMs) / 60_000);
    const timeLabel = ev.allDay ? '終日' : formatClockHHMM(ev.startMs);

    let timingText: string;
    if (ev.startMs <= nowMs) {
      timingText = ev.allDay ? '本日' : `進行中 (${timeLabel}〜)`;
    } else if (diffMin < 60) {
      timingText = `${timeLabel} (あと${diffMin}分)`;
    } else {
      const hours = Math.floor(diffMin / 60);
      const mins = diffMin % 60;
      timingText = `${timeLabel} (あと${hours}時間${mins > 0 ? `${mins}分` : ''})`;
    }

    const locSuffix = ev.location ? ` @ ${ev.location}` : '';
    const text = `${timingText} ${ev.summary}${locSuffix}`;

    out.push({
      id: `cal-${idHash}`,
      source: 'calendar',
      badge: `予定:${feed.name}`,
      text,
      color,
      timestamp: nowMs,
      priority: diffMin <= 15 ? 'high' : 'normal',
      oneShot: false,
      breaking: false,
      icon: 'calendar',
      replaceKey: `calendar:${feed.id}:${idHash}`,
      sourceKey: `calendar:${feed.id}`,
    });

    const alertKey = `${feed.id}:${ev.uid}:${ev.startMs}`;
    if (
      alertBeforeMinutes > 0 &&
      diffMin > 0 &&
      diffMin <= alertBeforeMinutes &&
      alertedKeys &&
      !alertedKeys.has(alertKey)
    ) {
      alertedKeys.add(alertKey);
      out.push({
        id: `cal-alert-${idHash}-${nowMs}`,
        source: 'calendar',
        badge: 'まもなく予定',
        text: `あと${diffMin}分で開始: ${ev.summary}${locSuffix}`,
        color: '#f59e0b',
        timestamp: nowMs,
        priority: 'high',
        oneShot: true,
        breaking: true,
        icon: 'calendar',
      });
    }
  }

  return out;
}

export class CalendarSource implements TickerSource {
  readonly id = 'calendar' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalSec = 300;
  private lastConfigSig = '';
  private alertedKeys = new Set<string>();

  constructor(private readonly ctx: SourceContext) {}

  start(): void {
    this.onConfigUpdate(this.ctx.getConfig());
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.lastConfigSig = '';
    this.ctx.updateStatus({ id: this.id, active: false, connected: false });
  }

  onConfigUpdate(config: AppConfig): void {
    if (!this.isConfigActive(config)) {
      this.stop();
      return;
    }
    const c = config.sources.calendar;
    const sig = JSON.stringify({
      feeds: c.feeds.filter((f) => f.enabled),
      windowHours: c.windowHours,
      alertBeforeMinutes: c.alertBeforeMinutes,
    });
    const intervalChanged = this.pollIntervalSec !== c.pollIntervalSec;
    const cfgChanged = sig !== this.lastConfigSig;
    const wasStopped = !this.timer;

    if (wasStopped || intervalChanged) {
      this.pollIntervalSec = c.pollIntervalSec;
      this.syncTimer();
    }
    if (wasStopped || intervalChanged || cfgChanged) {
      this.lastConfigSig = sig;
      void this.refreshNow();
    }
  }

  async refreshNow(): Promise<void> {
    const config = this.ctx.getConfig();
    if (!this.isConfigActive(config)) {
      this.ctx.updateStatus({ id: this.id, active: false, connected: false });
      return;
    }

    const c = config.sources.calendar;
    const enabledFeeds = c.feeds.filter((f) => f.enabled);
    if (enabledFeeds.length === 0) {
      this.ctx.updateStatus({
        id: this.id,
        active: true,
        connected: false,
        lastError: 'No iCal feeds configured',
      });
      return;
    }

    const nowMs = Date.now();
    const collected: TickerItem[] = [];
    const errors: string[] = [];

    await Promise.all(
      enabledFeeds.map(async (feed) => {
        try {
          const res = await fetch(feed.url, {
            headers: { 'User-Agent': 'CATHOBAR/0.2' },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ics = await res.text();
          const parsed = parseIcsEvents(ics, nowMs, c.windowHours);
          const items = formatCalendarEventsToItems(
            parsed,
            feed,
            nowMs,
            c.alertBeforeMinutes,
            this.alertedKeys,
          );
          const keepIds = new Set(items.filter((i) => !i.oneShot).map((i) => i.id));
          this.ctx.retainSourceKeyItems(`calendar:${feed.id}`, keepIds);
          collected.push(...items);
        } catch (err) {
          errors.push(`${feed.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );

    if (this.alertedKeys.size > 300) {
      this.alertedKeys = new Set(Array.from(this.alertedKeys).slice(-150));
    }

    if (collected.length > 0) {
      this.ctx.emitItems(collected);
    }

    this.ctx.updateStatus({
      id: this.id,
      active: true,
      connected: errors.length < enabledFeeds.length,
      lastFetchAt: nowMs,
      lastError: errors.length > 0 ? errors.join('; ') : null,
    });
  }

  private isConfigActive(config: AppConfig): boolean {
    return (
      config.sources.calendar.enabled &&
      (isChannelActiveInConfig(config, 'countdown') || config.sources.calendar.alertBeforeMinutes > 0)
    );
  }

  private syncTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.pollIntervalSec = this.ctx.getConfig().sources.calendar.pollIntervalSec;
    this.timer = setInterval(() => {
      void this.refreshNow();
    }, this.pollIntervalSec * 1000);
  }
}
