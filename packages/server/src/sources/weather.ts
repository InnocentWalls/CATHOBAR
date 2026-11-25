import {
  isChannelActiveInConfig,
  type AppConfig,
  type PixelIconId,
  type TickerItem,
  type WeatherLocation,
} from '@cathobar/shared';
import type { SourceContext, TickerSource } from './types.js';

export interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    precipitation?: number;
  };
  minutely_15?: {
    time?: string[];
    precipitation?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
}

interface JmaWarningPayload {
  areaTypes?: Array<{
    areas?: Array<{
      code?: string;
      name?: string;
      warnings?: Array<{ code?: string; status?: string }>;
    }>;
  }>;
}

const JMA_WARNING_CODE_MAP: Record<string, { label: string; emergency: boolean }> = {
  '02': { label: '暴風雪警報', emergency: false },
  '03': { label: '大雨警報', emergency: false },
  '04': { label: '洪水警報', emergency: false },
  '05': { label: '暴風警報', emergency: false },
  '06': { label: '大雪警報', emergency: false },
  '07': { label: '波浪警報', emergency: false },
  '08': { label: '高潮警報', emergency: false },
  '32': { label: '暴風雪特別警報', emergency: true },
  '33': { label: '大雨特別警報', emergency: true },
  '35': { label: '暴風特別警報', emergency: true },
  '36': { label: '大雪特別警報', emergency: true },
  '37': { label: '波浪特別警報', emergency: true },
  '38': { label: '高潮特別警報', emergency: true },
};

export function wmoCodeToIcon(code: number | undefined): PixelIconId {
  switch (code) {
    case 0:
    case 1:
      return 'sun';
    case 2:
      return 'partly-cloudy';
    case 3:
      return 'cloud';
    case 45:
    case 48:
      return 'fog';
    case 51:
    case 53:
    case 55:
    case 61:
    case 63:
    case 65:
    case 66:
    case 67:
    case 80:
    case 81:
    case 82:
      return 'rain';
    case 71:
    case 73:
    case 75:
    case 77:
    case 85:
    case 86:
      return 'snow';
    case 95:
    case 96:
    case 99:
      return 'thunder';
    default:
      return 'cloud';
  }
}

export function describeWmoCode(code: number | undefined): string {
  switch (code) {
    case 0:
      return '快晴';
    case 1:
      return '晴れ';
    case 2:
      return '一部曇り';
    case 3:
      return '曇り';
    case 45:
    case 48:
      return '霧';
    case 51:
    case 53:
    case 55:
      return '霧雨';
    case 61:
    case 63:
    case 65:
      return '雨';
    case 66:
    case 67:
      return '氷雨';
    case 71:
    case 73:
    case 75:
    case 77:
      return '雪';
    case 80:
    case 81:
    case 82:
      return 'にわか雨';
    case 85:
    case 86:
      return 'にわか雪';
    case 95:
    case 96:
    case 99:
      return '雷雨';
    default:
      return '不明';
  }
}

/**
 * Parses Open-Meteo response into the main weather TickerItem and optional rain-approach alert.
 */
export function parseOpenMeteoForecast(
  data: OpenMeteoResponse,
  loc: WeatherLocation,
  options: { rainAlertEnabled: boolean; rainAlertBreaking: boolean },
  nowMs = Date.now(),
): { weatherItem: TickerItem | null; rainAlertItem: TickerItem | null } {
  const cur = data.current;
  const daily = data.daily;

  const parts: string[] = [];
  if (cur) {
    const cond = describeWmoCode(cur.weather_code);
    const temp = cur.temperature_2m !== undefined ? `${cur.temperature_2m.toFixed(1)}℃` : '--';
    const hum = cur.relative_humidity_2m !== undefined ? `湿度${cur.relative_humidity_2m}%` : '';
    parts.push(`現在: ${cond} ${temp} ${hum}`.trim());
  }
  if (daily?.weather_code && daily.temperature_2m_max && daily.temperature_2m_min) {
    if (daily.weather_code[0] !== undefined) {
      const pop0 = daily.precipitation_probability_max?.[0];
      const popStr = typeof pop0 === 'number' ? ` 降水${pop0}%` : '';
      parts.push(
        `今日: ${describeWmoCode(daily.weather_code[0])} (${daily.temperature_2m_min[0]}〜${daily.temperature_2m_max[0]}℃${popStr})`,
      );
    }
    if (daily.weather_code[1] !== undefined) {
      const pop1 = daily.precipitation_probability_max?.[1];
      const popStr = typeof pop1 === 'number' ? ` 降水${pop1}%` : '';
      parts.push(
        `明日: ${describeWmoCode(daily.weather_code[1])} (${daily.temperature_2m_min[1]}〜${daily.temperature_2m_max[1]}℃${popStr})`,
      );
    }
  }

  const weatherItem: TickerItem | null =
    parts.length > 0
      ? {
          id: `weather-${loc.id}-${nowMs}`,
          source: 'weather',
          badge: `天気:${loc.cityName}`,
          text: parts.join(' ／ '),
          color: '#facc15',
          timestamp: nowMs,
          priority: 'normal',
          oneShot: false,
          breaking: false,
          icon: wmoCodeToIcon(cur?.weather_code ?? daily?.weather_code?.[0]),
          replaceKey: `weather:${loc.id}`,
          sourceKey: `weather:${loc.id}`,
        }
      : null;

  let rainAlertItem: TickerItem | null = null;
  const currentPrecip = cur?.precipitation ?? 0;
  if (
    options.rainAlertEnabled &&
    currentPrecip < 0.2 &&
    data.minutely_15?.time &&
    data.minutely_15?.precipitation
  ) {
    const times = data.minutely_15.time;
    const precips = data.minutely_15.precipitation;
    for (let i = 0; i < Math.min(times.length, precips.length); i += 1) {
      const tMs = Date.parse(times[i] ?? '');
      const mm = precips[i] ?? 0;
      if (!Number.isFinite(tMs)) continue;
      const diffMin = Math.round((tMs - nowMs) / 60_000);
      if (diffMin >= 5 && diffMin <= 60 && mm >= 0.3) {
        rainAlertItem = {
          id: `weather-rain-${loc.id}-${nowMs}`,
          source: 'weather',
          badge: `雨雲:${loc.cityName}`,
          text: `【雨雲接近】約${diffMin}分後に雨が降り始める見込み (${mm.toFixed(1)}mm/15分)`,
          color: '#38bdf8',
          timestamp: nowMs,
          priority: 'high',
          oneShot: false,
          breaking: options.rainAlertBreaking,
          icon: 'rain',
          replaceKey: `weather:rain:${loc.id}`,
          sourceKey: `weather:${loc.id}`,
        };
        break;
      }
    }
  }

  return { weatherItem, rainAlertItem };
}

/**
 * Parses JMA weather warning JSON (/bosai/warning/data/warning/<areaCode>.json) into a TickerItem.
 */
export function parseJmaWarnings(
  raw: unknown,
  loc: Pick<WeatherLocation, 'id' | 'cityName'>,
  prevActiveLabels?: Set<string>,
  nowMs = Date.now(),
): { item: TickerItem | null; activeLabels: Set<string> } {
  const activeLabels = new Set<string>();
  let hasEmergency = false;

  if (raw && typeof raw === 'object') {
    const payload = raw as JmaWarningPayload;
    for (const areaType of payload.areaTypes ?? []) {
      for (const area of areaType.areas ?? []) {
        for (const w of area.warnings ?? []) {
          if (w.status !== '発表' && w.status !== '継続') continue;
          const info = w.code ? JMA_WARNING_CODE_MAP[w.code] : undefined;
          if (!info) continue;
          activeLabels.add(info.label);
          if (info.emergency) hasEmergency = true;
        }
      }
    }
  }

  if (activeLabels.size === 0) {
    return { item: null, activeLabels };
  }

  const labels = Array.from(activeLabels);
  const newlyIssued =
    prevActiveLabels !== undefined && labels.some((label) => !prevActiveLabels.has(label));

  return {
    activeLabels,
    item: {
      id: `weather-jma-${loc.id}-${nowMs}`,
      source: 'weather',
      badge: `気象警報:${loc.cityName}`,
      text: `発表中の警報: ${labels.join('・')}`,
      color: hasEmergency ? '#ff2a22' : '#ef4444',
      timestamp: nowMs,
      priority: 'high',
      oneShot: false,
      breaking: hasEmergency || newlyIssued,
      icon: 'alert',
      replaceKey: `weather:jma:${loc.id}`,
      sourceKey: `weather:${loc.id}`,
    },
  };
}

export class WeatherSource implements TickerSource {
  readonly id = 'weather' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalSec = 900;
  private lastCoordKey = '';
  private rainCooldownUntil = new Map<string, number>();
  private prevWarningsByLoc = new Map<string, Set<string>>();

  constructor(private readonly ctx: SourceContext) {}

  start(): void {
    this.syncTimer();
    void this.refreshNow();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.ctx.updateStatus({ id: this.id, active: false, connected: false });
  }

  onConfigUpdate(config: AppConfig): void {
    const shouldRun =
      config.sources.weather.enabled && isChannelActiveInConfig(config, 'weather');
    if (!shouldRun) {
      this.stop();
      return;
    }
    const w = config.sources.weather;
    const coordKey = buildCoordKey(w);
    const intervalChanged = this.pollIntervalSec !== w.pollIntervalSec;
    if (intervalChanged || !this.timer) {
      this.pollIntervalSec = w.pollIntervalSec;
      this.syncTimer();
    }
    if (coordKey !== this.lastCoordKey || intervalChanged) {
      void this.refreshNow();
    }
  }

  async refreshNow(): Promise<void> {
    const config = this.ctx.getConfig();
    const w = config.sources.weather;
    const shouldRun = w.enabled && isChannelActiveInConfig(config, 'weather');
    if (!shouldRun) {
      this.ctx.updateStatus({ id: this.id, active: false, connected: false });
      return;
    }

    const enabledLocations = w.locations.filter((loc) => loc.enabled);
    this.lastCoordKey = buildCoordKey(w);

    if (enabledLocations.length === 0) {
      this.ctx.updateStatus({
        id: this.id,
        active: true,
        connected: false,
        lastError: 'No weather locations enabled',
      });
      return;
    }

    const items: TickerItem[] = [];
    const errors: string[] = [];

    await Promise.all(
      enabledLocations.map(async (loc) => {
        try {
          const fetched = await this.fetchLocation(loc, w);
          items.push(...fetched);
        } catch (err) {
          errors.push(`${loc.cityName}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );

    if (items.length > 0) {
      this.ctx.emitItems(items);
    }

    this.ctx.updateStatus({
      id: this.id,
      active: true,
      connected: errors.length < enabledLocations.length,
      lastFetchAt: Date.now(),
      lastError: errors.length > 0 ? errors.join('; ') : null,
    });
  }

  private async fetchLocation(
    loc: WeatherLocation,
    cfg: AppConfig['sources']['weather'],
  ): Promise<TickerItem[]> {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(loc.latitude));
    url.searchParams.set('longitude', String(loc.longitude));
    url.searchParams.set(
      'current',
      'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation',
    );
    url.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    );
    if (cfg.rainAlertEnabled) {
      url.searchParams.set('minutely_15', 'precipitation');
      url.searchParams.set('forecast_minutely_15', '6');
    }
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '2');

    const res = await fetch(url, {
      headers: { 'User-Agent': 'CATHOBAR/0.2' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as OpenMeteoResponse;
    const nowMs = Date.now();
    const { weatherItem, rainAlertItem } = parseOpenMeteoForecast(data, loc, cfg, nowMs);

    const out: TickerItem[] = [];
    if (weatherItem) out.push(weatherItem);
    if (rainAlertItem) {
      const cooldownUntil = this.rainCooldownUntil.get(loc.id) ?? 0;
      const canBreak = nowMs >= cooldownUntil;
      if (canBreak && rainAlertItem.breaking) {
        this.rainCooldownUntil.set(loc.id, nowMs + 60 * 60_000);
      }
      out.push({
        ...rainAlertItem,
        breaking: rainAlertItem.breaking && canBreak,
      });
    }

    const areaCode = loc.jmaAreaCode?.trim();
    if (cfg.jmaWarningEnabled && areaCode) {
      try {
        const jmaRes = await fetch(
          `https://www.jma.go.jp/bosai/warning/data/warning/${encodeURIComponent(areaCode)}.json`,
          { headers: { 'User-Agent': 'CATHOBAR/0.2' }, signal: AbortSignal.timeout(8_000) },
        );
        if (jmaRes.ok) {
          const jmaJson = (await jmaRes.json()) as unknown;
          const prevSet = this.prevWarningsByLoc.get(loc.id);
          const { item, activeLabels } = parseJmaWarnings(jmaJson, loc, prevSet, nowMs);
          this.prevWarningsByLoc.set(loc.id, activeLabels);
          if (item) {
            out.push(item);
          }
        }
      } catch {
        // Ignore JMA warning transient failures so primary forecast still updates
      }
    }

    return out;
  }

  private syncTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.pollIntervalSec = this.ctx.getConfig().sources.weather.pollIntervalSec;
    this.timer = setInterval(() => {
      void this.refreshNow();
    }, this.pollIntervalSec * 1000);
  }
}

function buildCoordKey(w: AppConfig['sources']['weather']): string {
  const locs = w.locations
    .filter((l) => l.enabled)
    .map((l) => `${l.id}:${l.cityName}:${l.latitude}:${l.longitude}:${l.jmaAreaCode ?? ''}`)
    .join('|');
  return `${locs}#${w.rainAlertEnabled}#${w.rainAlertBreaking}#${w.jmaWarningEnabled}`;
}
