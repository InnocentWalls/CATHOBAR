import type {
  AppConfig,
  NowPlayingState,
  SensorReading,
  SourceStatus,
  TickerItem,
  TickerSourceId,
} from '@cathobar/shared';

export interface SourceContext {
  getConfig: () => AppConfig;
  emitItems: (items: TickerItem[]) => void;
  retainSourceKeyItems: (sourceKey: string, keepIds: Set<string>) => void;
  updateStatus: (partial: Partial<SourceStatus> & { id: TickerSourceId }) => void;
  updateNowPlaying?: (state: NowPlayingState | null) => void;
  updateSensors?: (readings: SensorReading[]) => void;
}

export interface TickerSource {
  readonly id: TickerSourceId;
  start(): void;
  stop(): void;
  onConfigUpdate(config: AppConfig): void;
  refreshNow(): Promise<void>;
}

export function cleanText(input: string): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
