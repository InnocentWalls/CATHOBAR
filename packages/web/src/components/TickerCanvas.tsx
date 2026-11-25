import { useEffect, useRef } from 'react';
import type {
  ActivityBucket,
  AppConfig,
  NowPlayingState,
  SensorReading,
  TickerItem,
} from '@cathobar/shared';
import { TickerEngine, type EngineStats } from '../engine/ticker-engine.js';

interface TickerCanvasProps {
  config: AppConfig;
  items: TickerItem[];
  lastBatch: TickerItem[];
  activity: ActivityBucket[];
  nowPlaying?: NowPlayingState | null;
  sensors?: SensorReading[];
  transparent?: boolean;
  paused?: boolean;
  onStats?: (stats: EngineStats) => void;
  onEngineReady?: (engine: TickerEngine | null) => void;
  className?: string;
}

export function TickerCanvas({
  config,
  items,
  lastBatch,
  activity,
  nowPlaying = null,
  sensors = [],
  transparent = false,
  paused = false,
  onStats,
  onEngineReady,
  className = '',
}: TickerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<TickerEngine | null>(null);
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new TickerEngine(canvas, config, (stats) => {
      onStatsRef.current?.(stats);
    });
    engineRef.current = engine;
    onEngineReady?.(engine);

    const rect = canvas.getBoundingClientRect();
    engine.setViewportSize(rect.width, rect.height);
    engine.setTransparent(transparent);
    engine.setPaused(paused);
    engine.syncState(items, activity, config, nowPlaying, sensors);
    engine.start();

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        engine.setViewportSize(width, height);
      }
    });
    ro.observe(canvas);

    return () => {
      ro.disconnect();
      engine.stop();
      engineRef.current = null;
      onEngineReady?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setTransparent(transparent);
  }, [transparent]);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    engineRef.current?.syncState(items, activity, config, nowPlaying, sensors);
  }, [config, items, activity, nowPlaying, sensors]);

  useEffect(() => {
    if (lastBatch.length > 0) {
      engineRef.current?.pushItems(lastBatch);
    }
  }, [lastBatch]);

  useEffect(() => {
    engineRef.current?.updateActivity(activity);
  }, [activity]);

  useEffect(() => {
    engineRef.current?.updateNowPlaying(nowPlaying);
  }, [nowPlaying]);

  useEffect(() => {
    engineRef.current?.updateSensors(sensors);
  }, [sensors]);

  return (
    <canvas
      ref={canvasRef}
      className={`block h-full w-full ${transparent ? 'bg-transparent' : 'bg-black'} ${className}`}
    />
  );
}
