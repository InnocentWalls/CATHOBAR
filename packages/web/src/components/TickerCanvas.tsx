import { useEffect, useRef } from 'react';
import type { ActivityBucket, AppConfig, TickerItem } from '@cathobar/shared';
import { TickerEngine, type EngineStats } from '../engine/ticker-engine.js';

interface TickerCanvasProps {
  config: AppConfig;
  items: TickerItem[];
  lastBatch: TickerItem[];
  activity: ActivityBucket[];
  onStats?: (stats: EngineStats) => void;
  className?: string;
}

export function TickerCanvas({
  config,
  items,
  lastBatch,
  activity,
  onStats,
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

    const rect = canvas.getBoundingClientRect();
    engine.setViewportSize(rect.width, rect.height);
    engine.syncState(items, activity, config);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.syncState(items, activity, config);
  }, [config, items, activity]);

  useEffect(() => {
    if (lastBatch.length > 0) {
      engineRef.current?.pushItems(lastBatch);
    }
  }, [lastBatch]);

  useEffect(() => {
    engineRef.current?.updateActivity(activity);
  }, [activity]);

  return (
    <canvas
      ref={canvasRef}
      className={`block h-full w-full bg-black ${className}`}
    />
  );
}
