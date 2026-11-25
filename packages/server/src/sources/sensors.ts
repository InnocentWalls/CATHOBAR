import { createHmac, randomUUID } from 'node:crypto';
import {
  isChannelActiveInConfig,
  type AppConfig,
  type SensorPushInput,
  type SensorReading,
  type SensorsSourceConfig,
  type TickerItem,
} from '@cathobar/shared';
import type { SourceContext, TickerSource } from './types.js';

/**
 * Formats a SensorReading into a persistent TickerItem and flags high CO2 conditions.
 */
export function formatSensorReading(
  reading: SensorReading,
  cfg: SensorsSourceConfig,
  canBreak = false,
): TickerItem | null {
  const parts: string[] = [];
  if (typeof reading.temperature === 'number') parts.push(`${reading.temperature.toFixed(1)}℃`);
  if (typeof reading.humidity === 'number') parts.push(`湿度${Math.round(reading.humidity)}%`);
  if (typeof reading.co2 === 'number') parts.push(`CO2 ${Math.round(reading.co2)}ppm`);
  if (typeof reading.illuminance === 'number') parts.push(`${Math.round(reading.illuminance)}lx`);
  if (typeof reading.powerW === 'number') parts.push(`${Math.round(reading.powerW)}W`);
  if (typeof reading.battery === 'number') parts.push(`電池${Math.round(reading.battery)}%`);
  if (reading.customText) parts.push(reading.customText);

  if (parts.length === 0) return null;

  const highCo2 = typeof reading.co2 === 'number' && reading.co2 >= cfg.co2AlertPpm;
  return {
    id: `sensor-${reading.id}-${reading.updatedAt}`,
    source: 'sensors',
    badge: `室内:${reading.name}`,
    text: parts.join(' / '),
    color: highCo2 ? '#ef4444' : '#34d399',
    timestamp: reading.updatedAt,
    priority: highCo2 ? 'high' : 'normal',
    oneShot: false,
    breaking: highCo2 && cfg.alertOnHighCo2 && canBreak,
    icon: highCo2 ? 'alert' : 'sensor',
    replaceKey: `sensors:${reading.id}`,
    sourceKey: `sensors:${reading.id}`,
  };
}

export class SensorsSource implements TickerSource {
  readonly id = 'sensors' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalSec = 120;
  private readings = new Map<string, SensorReading>();
  private lastExternalSig = '';
  private co2CooldownUntil = new Map<string, number>();

  constructor(private readonly ctx: SourceContext) {}

  getReadings(): SensorReading[] {
    return Array.from(this.readings.values()).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }

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
    const s = config.sources.sensors;
    const extSig = JSON.stringify({
      switchbotToken: s.switchbotToken,
      switchbotSecret: s.switchbotSecret,
      switchbotDeviceIds: s.switchbotDeviceIds,
      natureRemoToken: s.natureRemoToken,
    });
    const intervalChanged = this.pollIntervalSec !== s.pollIntervalSec;
    const extChanged = extSig !== this.lastExternalSig;
    const wasStopped = !this.timer;

    if (wasStopped || intervalChanged) {
      this.pollIntervalSec = s.pollIntervalSec;
      this.syncTimer();
    }
    if (wasStopped || intervalChanged || extChanged) {
      this.lastExternalSig = extSig;
      void this.refreshNow();
    }
  }

  applyExternalPush(input: SensorPushInput): SensorReading {
    const now = Date.now();
    const reading: SensorReading = {
      id: input.id,
      name: input.name,
      temperature: input.temperature,
      humidity: input.humidity,
      co2: input.co2,
      illuminance: input.illuminance,
      powerW: input.powerW,
      battery: input.battery,
      customText: input.customText,
      sourceApp: input.sourceApp,
      updatedAt: now,
    };
    this.readings.set(reading.id, reading);
    this.publishReadings([reading]);
    this.ctx.updateStatus({
      id: this.id,
      active: true,
      connected: true,
      lastFetchAt: now,
      lastError: null,
    });
    return reading;
  }

  async refreshNow(): Promise<void> {
    const config = this.ctx.getConfig();
    if (!this.isConfigActive(config)) {
      this.ctx.updateStatus({ id: this.id, active: false, connected: false });
      return;
    }

    const s = config.sources.sensors;
    const fetched: SensorReading[] = [];
    const errors: string[] = [];

    if (s.natureRemoToken.trim()) {
      try {
        const remoReadings = await this.fetchNatureRemo(s.natureRemoToken.trim());
        fetched.push(...remoReadings);
      } catch (err) {
        errors.push(`Nature Remo: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (s.switchbotToken.trim() && s.switchbotSecret.trim() && s.switchbotDeviceIds.length > 0) {
      for (const deviceId of s.switchbotDeviceIds) {
        try {
          const sb = await this.fetchSwitchBotDevice(
            deviceId.trim(),
            s.switchbotToken.trim(),
            s.switchbotSecret.trim(),
          );
          if (sb) fetched.push(sb);
        } catch (err) {
          errors.push(`SwitchBot(${deviceId}): ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    if (fetched.length > 0) {
      for (const r of fetched) {
        this.readings.set(r.id, r);
      }
      this.publishReadings(fetched);
    }

    const hasExternalConfig =
      Boolean(s.natureRemoToken.trim()) ||
      (Boolean(s.switchbotToken.trim()) && s.switchbotDeviceIds.length > 0);

    this.ctx.updateStatus({
      id: this.id,
      active: true,
      connected: errors.length === 0 && (hasExternalConfig || this.readings.size > 0),
      lastFetchAt: Date.now(),
      lastError: errors.length > 0 ? errors.join('; ') : null,
    });
  }

  private publishReadings(changed: SensorReading[]): void {
    this.ctx.updateSensors?.(this.getReadings());
    const cfg = this.ctx.getConfig().sources.sensors;
    const nowMs = Date.now();
    const items: TickerItem[] = [];

    for (const r of changed) {
      const cooldownUntil = this.co2CooldownUntil.get(r.id) ?? 0;
      const canBreak = nowMs >= cooldownUntil;
      const item = formatSensorReading(r, cfg, canBreak);
      if (!item) continue;
      if (item.breaking) {
        this.co2CooldownUntil.set(r.id, nowMs + 15 * 60_000);
      }
      items.push(item);
    }

    if (items.length > 0) {
      this.ctx.emitItems(items);
    }
  }

  private async fetchNatureRemo(token: string): Promise<SensorReading[]> {
    const res = await fetch('https://api.nature.global/1/devices', {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'CATHOBAR/0.2',
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = (await res.json()) as Array<{
      id?: string;
      name?: string;
      newest_events?: {
        te?: { val?: number };
        hu?: { val?: number };
        il?: { val?: number };
      };
    }>;

    const now = Date.now();
    return list
      .filter((d) => Boolean(d.id && d.newest_events))
      .map((d) => ({
        id: `remo-${d.id}`,
        name: d.name || 'Nature Remo',
        temperature: d.newest_events?.te?.val,
        humidity: d.newest_events?.hu?.val,
        illuminance: d.newest_events?.il?.val,
        sourceApp: 'Nature Remo',
        updatedAt: now,
      }));
  }

  private async fetchSwitchBotDevice(
    deviceId: string,
    token: string,
    secret: string,
  ): Promise<SensorReading | null> {
    if (!deviceId) return null;
    const t = String(Date.now());
    const nonce = randomUUID();
    const sign = createHmac('sha256', secret).update(`${token}${t}${nonce}`).digest('base64');

    const res = await fetch(
      `https://api.switch-bot.com/v1.1/devices/${encodeURIComponent(deviceId)}/status`,
      {
        headers: {
          Authorization: token,
          sign,
          t,
          nonce,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      statusCode?: number;
      message?: string;
      body?: {
        deviceType?: string;
        temperature?: number;
        humidity?: number;
        CO2?: number;
        lightLevel?: number;
        weight?: number;
        battery?: number;
      };
    };
    if (json.statusCode && json.statusCode !== 100) {
      throw new Error(json.message || `API status ${json.statusCode}`);
    }
    const b = json.body;
    if (!b) return null;

    return {
      id: `sb-${deviceId}`,
      name: b.deviceType ? `SwitchBot ${b.deviceType}` : deviceId.slice(0, 8),
      temperature: b.temperature,
      humidity: b.humidity,
      co2: b.CO2,
      illuminance: b.lightLevel,
      powerW: b.weight,
      battery: b.battery,
      sourceApp: 'SwitchBot',
      updatedAt: Date.now(),
    };
  }

  private isConfigActive(config: AppConfig): boolean {
    return config.sources.sensors.enabled && isChannelActiveInConfig(config, 'system');
  }

  private syncTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.pollIntervalSec = this.ctx.getConfig().sources.sensors.pollIntervalSec;
    this.timer = setInterval(() => {
      void this.refreshNow();
    }, this.pollIntervalSec * 1000);
  }
}
