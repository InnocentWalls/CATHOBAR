import {
  isChannelActiveInConfig,
  type AppConfig,
  type MarketSymbolConfig,
  type PixelIconId,
  type TickerItem,
} from '@cathobar/shared';
import type { SourceContext, TickerSource } from './types.js';

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        regularMarketChangePercent?: number;
      };
    }>;
  };
}

/**
 * Formats a market price & delta into a TickerItem with directional icon and color.
 */
export function formatMarketQuote(
  sym: MarketSymbolConfig,
  price: number,
  prevClose?: number,
  currency?: string,
): TickerItem {
  const hasPrev = typeof prevClose === 'number' && prevClose > 0;
  const diff = hasPrev ? price - prevClose : 0;
  const pct = hasPrev ? (diff / prevClose) * 100 : 0;

  let icon: PixelIconId = 'market-flat';
  let arrow = '→';
  let color = '#94a3b8';

  if (hasPrev && Math.abs(pct) >= 0.02) {
    if (diff > 0) {
      icon = 'market-up';
      arrow = '▲';
      color = '#22c55e';
    } else {
      icon = 'market-down';
      arrow = '▼';
      color = '#ef4444';
    }
  }

  const digits = price >= 1000 ? 2 : price >= 100 ? 2 : 3;
  const formattedPrice = price.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const unit = currency === 'JPY' || sym.symbol.includes('JPY') ? '円' : '';
  const deltaStr = hasPrev
    ? ` ${arrow}${diff >= 0 ? '+' : ''}${pct.toFixed(2)}%`
    : '';

  const now = Date.now();
  return {
    id: `market-${sym.id}-${now}`,
    source: 'market',
    badge: sym.label,
    text: `${formattedPrice}${unit}${deltaStr}`,
    color,
    timestamp: now,
    priority: 'normal',
    oneShot: false,
    breaking: false,
    icon,
    replaceKey: `market:${sym.id}`,
    sourceKey: `market:${sym.id}`,
  };
}

export class MarketSource implements TickerSource {
  readonly id = 'market' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalSec = 180;
  private lastSymbolKey = '';

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
    const symKey = config.sources.market.symbols
      .filter((s) => s.enabled)
      .map((s) => `${s.id}:${s.symbol}`)
      .join('|');
    const intervalChanged = this.pollIntervalSec !== config.sources.market.pollIntervalSec;
    if (!this.timer || intervalChanged || symKey !== this.lastSymbolKey) {
      this.pollIntervalSec = config.sources.market.pollIntervalSec;
      this.lastSymbolKey = symKey;
      this.syncTimer();
      void this.refreshNow();
    }
  }

  async refreshNow(): Promise<void> {
    const config = this.ctx.getConfig();
    if (!this.isConfigActive(config)) {
      this.ctx.updateStatus({ id: this.id, active: false, connected: false });
      return;
    }

    const enabled = config.sources.market.symbols.filter((s) => s.enabled);
    if (enabled.length === 0) {
      this.ctx.updateStatus({
        id: this.id,
        active: true,
        connected: false,
        lastError: 'No market symbols enabled',
      });
      return;
    }

    const items: TickerItem[] = [];
    const errors: string[] = [];

    await Promise.all(
      enabled.map(async (sym) => {
        try {
          const item = await this.fetchSymbol(sym);
          if (item) items.push(item);
        } catch (err) {
          errors.push(`${sym.label}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }),
    );

    if (items.length > 0) {
      this.ctx.emitItems(items);
    }

    this.ctx.updateStatus({
      id: this.id,
      active: true,
      connected: errors.length < enabled.length,
      lastFetchAt: Date.now(),
      lastError: errors.length > 0 ? errors.join('; ') : null,
    });
  }

  private async fetchSymbol(sym: MarketSymbolConfig): Promise<TickerItem | null> {
    // 1. Primary: Yahoo Finance chart API (keyless)
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym.symbol)}?interval=1d&range=2d`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'CATHOBAR/0.2' },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        const json = (await res.json()) as YahooChartResponse;
        const meta = json.chart?.result?.[0]?.meta;
        if (meta && typeof meta.regularMarketPrice === 'number') {
          return formatMarketQuote(
            sym,
            meta.regularMarketPrice,
            meta.chartPreviousClose,
            meta.currency,
          );
        }
      }
    } catch {
      // Fall through to specialized fallbacks
    }

    // 2. Fallback for FX pairs like USDJPY=X / EURJPY=X via Frankfurter
    const fxMatch = /^([A-Z]{3})([A-Z]{3})=X$/i.exec(sym.symbol);
    if (fxMatch?.[1] && fxMatch[2]) {
      const base = fxMatch[1].toUpperCase();
      const quote = fxMatch[2].toUpperCase();
      const res = await fetch(
        `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(quote)}`,
        { headers: { 'User-Agent': 'CATHOBAR/0.2' }, signal: AbortSignal.timeout(8_000) },
      );
      if (res.ok) {
        const json = (await res.json()) as { rates?: Record<string, number> };
        const rate = json.rates?.[quote];
        if (typeof rate === 'number') {
          return formatMarketQuote(sym, rate, undefined, quote);
        }
      }
    }

    // 3. Fallback for Crypto pairs like BTC-JPY / ETH-USD via Coinbase
    const cryptoMatch = /^([A-Z0-9]+)-([A-Z]{3})$/i.exec(sym.symbol);
    if (cryptoMatch?.[1] && cryptoMatch[2]) {
      const pair = `${cryptoMatch[1].toUpperCase()}-${cryptoMatch[2].toUpperCase()}`;
      const res = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`, {
        headers: { 'User-Agent': 'CATHOBAR/0.2' },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: { amount?: string; currency?: string } };
        const price = Number(json.data?.amount);
        if (Number.isFinite(price)) {
          return formatMarketQuote(sym, price, undefined, json.data?.currency);
        }
      }
    }

    throw new Error('Quote unavailable');
  }

  private isConfigActive(config: AppConfig): boolean {
    return config.sources.market.enabled && isChannelActiveInConfig(config, 'market');
  }

  private syncTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.pollIntervalSec = this.ctx.getConfig().sources.market.pollIntervalSec;
    this.timer = setInterval(() => {
      void this.refreshNow();
    }, this.pollIntervalSec * 1000);
  }
}
