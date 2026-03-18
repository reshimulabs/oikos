/**
 * Pricing Service — Real-time market prices via WDK Bitfinex pricing.
 *
 * Provides USD valuations for all portfolio assets.
 * Uses PricingProvider for 1-hour TTL caching.
 * Falls back to hardcoded estimates if Bitfinex is unreachable.
 */

// WDK pricing packages are plain JS with .d.ts — use dynamic import
// to avoid ESM/CJS issues at compile time.

/** Price data for a single asset */
export interface AssetPrice {
  symbol: string;
  priceUsd: number;
  source: 'live' | 'fallback';
  updatedAt: number;
}

/** Portfolio valuation result */
export interface PortfolioValuation {
  totalUsd: number;
  assets: Array<{
    symbol: string;
    balance: string;
    humanBalance: number;
    priceUsd: number;
    valueUsd: number;
    allocation: number;
  }>;
  prices: AssetPrice[];
  updatedAt: number;
}

/** Historical price point */
export interface PricePoint {
  price: number;
  ts: number;
}

/** Token symbol to Bitfinex trading pair mapping */
const BITFINEX_PAIRS: Record<string, { from: string; to: string }> = {
  // Major crypto
  BTC: { from: 'BTC', to: 'USD' },
  ETH: { from: 'ETH', to: 'USD' },
  SOL: { from: 'SOL', to: 'USD' },
  XRP: { from: 'XRP', to: 'USD' },
  ADA: { from: 'ADA', to: 'USD' },
  DOT: { from: 'DOT', to: 'USD' },
  AVAX: { from: 'AVAX', to: 'USD' },
  LINK: { from: 'LINK', to: 'USD' },
  LTC: { from: 'LTC', to: 'USD' },
  UNI: { from: 'UNI', to: 'USD' },
  AAVE: { from: 'AAVE', to: 'USD' },
  NEAR: { from: 'NEAR', to: 'USD' },
  ARB: { from: 'ARB', to: 'USD' },
  SUI: { from: 'SUI', to: 'USD' },
  APT: { from: 'APT', to: 'USD' },
  TON: { from: 'TON', to: 'USD' },
  DOGE: { from: 'DOGE', to: 'USD' },
  SHIB: { from: 'SHIB', to: 'USD' },
  TRX: { from: 'TRX', to: 'USD' },
  FIL: { from: 'FIL', to: 'USD' },
  // Tether assets
  USDT: { from: 'UST', to: 'USD' },
  XAUT: { from: 'XAUT', to: 'USD' },
};

/** Fallback prices when Bitfinex is unreachable */
const FALLBACK_PRICES: Record<string, number> = {
  BTC: 73900,
  ETH: 2300,
  SOL: 130,
  XRP: 2.30,
  ADA: 0.70,
  DOT: 5.80,
  AVAX: 22,
  LINK: 14,
  LTC: 95,
  UNI: 7.50,
  AAVE: 190,
  NEAR: 3.50,
  ARB: 0.45,
  SUI: 2.80,
  APT: 6.50,
  TON: 3.40,
  DOGE: 0.17,
  SHIB: 0.000013,
  TRX: 0.23,
  FIL: 3.80,
  USDT: 1.0,
  USAT: 1.0,
  XAUT: 4975,
};

/** Token decimals for human-readable conversion */
const DECIMALS: Record<string, number> = {
  USDT: 6,
  USAT: 6,
  XAUT: 6,
  BTC: 8,
  ETH: 18,
  SOL: 9,
  XRP: 6,
  ADA: 6,
  DOT: 10,
  AVAX: 18,
  LINK: 18,
  LTC: 8,
  UNI: 18,
  AAVE: 18,
  NEAR: 24,
  ARB: 18,
  SUI: 9,
  APT: 8,
  TON: 9,
  DOGE: 8,
  SHIB: 18,
  TRX: 6,
  FIL: 18,
};

export class PricingService {
  private provider: unknown = null;
  private initialized = false;
  private cachedPrices: Map<string, AssetPrice> = new Map();

  /** Initialize the Bitfinex pricing client with caching */
  async initialize(): Promise<void> {
    try {
      const { BitfinexPricingClient } = await import('@tetherto/wdk-pricing-bitfinex-http');
      const { PricingProvider } = await import('@tetherto/wdk-pricing-provider');

      const client = new BitfinexPricingClient();
      this.provider = new PricingProvider({
        client,
        priceCacheDurationMs: 30 * 1000, // 30s cache — fast refresh for live market view
      });
      this.initialized = true;
      console.error('[pricing] Bitfinex pricing client initialized (5-min cache)');
    } catch (err) {
      console.error(`[pricing] Failed to initialize Bitfinex client: ${err instanceof Error ? err.message : 'unknown'}`);
      console.error('[pricing] Using fallback prices only');
    }
  }

  /** Get current USD price for a token symbol */
  async getPrice(symbol: string): Promise<AssetPrice> {
    const cached = this.cachedPrices.get(symbol);
    if (cached && Date.now() - cached.updatedAt < 10_000) {
      return cached;
    }

    const pair = BITFINEX_PAIRS[symbol];
    if (pair && this.initialized && this.provider) {
      try {
        const typedProvider = this.provider as { getLastPrice(from: string, to: string): Promise<number> };
        const price = await typedProvider.getLastPrice(pair.from, pair.to);
        if (price > 0) {
          const asset: AssetPrice = { symbol, priceUsd: price, source: 'live', updatedAt: Date.now() };
          this.cachedPrices.set(symbol, asset);
          return asset;
        }
      } catch {
        // Fall through to fallback
      }
    }

    // Stablecoins and tokens without Bitfinex pairs use fallback
    const fallbackPrice = FALLBACK_PRICES[symbol] ?? 0;
    const asset: AssetPrice = { symbol, priceUsd: fallbackPrice, source: 'fallback', updatedAt: Date.now() };
    this.cachedPrices.set(symbol, asset);
    return asset;
  }

  /** Get prices for all known tokens */
  async getAllPrices(): Promise<AssetPrice[]> {
    const symbols = Object.keys({ ...BITFINEX_PAIRS, ...FALLBACK_PRICES });
    const unique = [...new Set(symbols)];
    return Promise.all(unique.map(s => this.getPrice(s)));
  }

  /** Compute portfolio valuation from raw balance data */
  async valuatePortfolio(balances: Array<{ symbol: string; balance: string }>): Promise<PortfolioValuation> {
    const prices = await this.getAllPrices();
    const priceMap = new Map(prices.map(p => [p.symbol, p]));

    let totalUsd = 0;
    const assets: PortfolioValuation['assets'] = [];

    for (const b of balances) {
      const rawBalance = BigInt(b.balance || '0');
      const dec = DECIMALS[b.symbol] ?? 18;
      const humanBalance = Number(rawBalance) / Math.pow(10, dec);
      const priceUsd = priceMap.get(b.symbol)?.priceUsd ?? 0;
      const valueUsd = humanBalance * priceUsd;

      assets.push({
        symbol: b.symbol,
        balance: b.balance,
        humanBalance,
        priceUsd,
        valueUsd,
        allocation: 0, // computed below
      });
      totalUsd += valueUsd;
    }

    // Compute allocations
    for (const a of assets) {
      a.allocation = totalUsd > 0 ? a.valueUsd / totalUsd : 0;
    }

    return {
      totalUsd,
      assets,
      prices,
      updatedAt: Date.now(),
    };
  }

  /** Get historical prices for a token (max 100 data points) */
  async getHistoricalPrices(symbol: string, startMs?: number, endMs?: number): Promise<PricePoint[]> {
    const pair = BITFINEX_PAIRS[symbol];
    if (!pair || !this.initialized || !this.provider) {
      return [];
    }

    try {
      const typedProvider = this.provider as {
        getHistoricalPrice(opts: { from: string; to: string; start?: number; end?: number }): Promise<Array<{ price: number; ts: number }>>;
      };
      const now = Date.now();
      return await typedProvider.getHistoricalPrice({
        from: pair.from,
        to: pair.to,
        start: startMs ?? now - 7 * 24 * 60 * 60 * 1000, // default: last 7 days
        end: endMs ?? now,
      });
    } catch (err) {
      console.error(`[pricing] Historical prices error for ${symbol}: ${err instanceof Error ? err.message : 'unknown'}`);
      return [];
    }
  }
}
