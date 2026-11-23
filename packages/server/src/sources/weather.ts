import type { AppConfig, TickerItem, WeatherLocation } from '@cathobar/shared';
import type { SourceContext, TickerSource } from './types.js';

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
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

export class WeatherSource implements TickerSource {
  readonly id = 'weather' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalSec = 900;
  private lastCoordKey = '';

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
      config.sources.weather.enabled &&
      (config.activeChannel === 'all' || config.activeChannel === 'weather');
    if (!shouldRun) {
      this.stop();
      return;
    }
    const w = config.sources.weather;
    const coordKey = buildCoordKey(w.locations);
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
    const shouldRun =
      w.enabled && (config.activeChannel === 'all' || config.activeChannel === 'weather');
    if (!shouldRun) {
      this.ctx.updateStatus({ id: this.id, active: false, connected: false });
      return;
    }

    const enabledLocations = w.locations.filter((loc) => loc.enabled);
    this.lastCoordKey = buildCoordKey(w.locations);

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
          const item = await this.fetchLocation(loc);
          if (item) items.push(item);
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

  private async fetchLocation(loc: WeatherLocation): Promise<TickerItem | null> {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(loc.latitude));
    url.searchParams.set('longitude', String(loc.longitude));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m');
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '2');

    const res = await fetch(url, {
      headers: { 'User-Agent': 'CATHOBAR/0.1' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as OpenMeteoResponse;
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
        parts.push(
          `今日: ${describeWmoCode(daily.weather_code[0])} (${daily.temperature_2m_min[0]}〜${daily.temperature_2m_max[0]}℃)`,
        );
      }
      if (daily.weather_code[1] !== undefined) {
        parts.push(
          `明日: ${describeWmoCode(daily.weather_code[1])} (${daily.temperature_2m_min[1]}〜${daily.temperature_2m_max[1]}℃)`,
        );
      }
    }

    if (parts.length === 0) return null;

    const now = Date.now();
    return {
      id: `weather-${loc.id}-${now}`,
      source: 'weather',
      badge: `天気:${loc.cityName}`,
      text: parts.join(' ／ '),
      color: '#facc15',
      timestamp: now,
      priority: 'normal',
      oneShot: false,
      replaceKey: `weather:${loc.id}`,
    };
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

function buildCoordKey(locations: WeatherLocation[]): string {
  return locations
    .filter((l) => l.enabled)
    .map((l) => `${l.id}:${l.cityName}:${l.latitude}:${l.longitude}`)
    .join('|');
}
