/**
 * DeFi Strategy Reasoner — Portfolio analysis and rebalancing suggestions.
 *
 * Analyzes multi-asset portfolio state against target allocations
 * and suggests DeFi operations (swaps, bridges, yield) to optimize.
 */

import type { BalanceResponse } from '../oikos-client.js';

export interface PortfolioAnalysis {
  totalValueUsd: number;
  allocations: Record<string, { balance: number; percentage: number; targetPercentage: number }>;
  deviations: Record<string, number>;
  rebalanceNeeded: boolean;
}

export interface DeFiSuggestion {
  type: 'swap' | 'bridge' | 'yield';
  reason: string;
  priority: number;
  details: Record<string, string>;
}

const TARGET_ALLOCATION: Record<string, number> = {
  USDT: 0.40, XAUT: 0.20, USAT: 0.25, BTC: 0.10, ETH: 0.05,
};

const PRICES_USD: Record<string, number> = {
  USDT: 1, USAT: 1, XAUT: 2400, BTC: 60000, ETH: 3000,
};

const DECIMALS: Record<string, number> = {
  USDT: 6, USAT: 6, XAUT: 6, BTC: 8, ETH: 18,
};

const REBALANCE_THRESHOLD = 0.10;
const MIN_ETH_RESERVE = 0.02;

export function analyzePortfolio(balances: BalanceResponse[]): PortfolioAnalysis {
  const aggregatedUsd: Record<string, number> = {};
  const aggregatedBalance: Record<string, number> = {};

  for (const b of balances) {
    const rawBalance = BigInt(b.balance || '0');
    const dec = DECIMALS[b.symbol] ?? 18;
    const humanBalance = Number(rawBalance) / Math.pow(10, dec);
    const usdValue = humanBalance * (PRICES_USD[b.symbol] ?? 0);
    aggregatedUsd[b.symbol] = (aggregatedUsd[b.symbol] ?? 0) + usdValue;
    aggregatedBalance[b.symbol] = (aggregatedBalance[b.symbol] ?? 0) + humanBalance;
  }

  const totalValueUsd = Object.values(aggregatedUsd).reduce((sum, v) => sum + v, 0);

  const allocations: Record<string, { balance: number; percentage: number; targetPercentage: number }> = {};
  const deviations: Record<string, number> = {};
  let rebalanceNeeded = false;

  for (const [symbol, target] of Object.entries(TARGET_ALLOCATION)) {
    const balance = aggregatedBalance[symbol] ?? 0;
    const usdValue = aggregatedUsd[symbol] ?? 0;
    const percentage = totalValueUsd > 0 ? usdValue / totalValueUsd : 0;
    const deviation = percentage - target;

    allocations[symbol] = { balance, percentage, targetPercentage: target };
    deviations[symbol] = deviation;

    if (Math.abs(deviation) > REBALANCE_THRESHOLD) {
      rebalanceNeeded = true;
    }
  }

  return { totalValueUsd, allocations, deviations, rebalanceNeeded };
}

export function suggestRebalance(analysis: PortfolioAnalysis): DeFiSuggestion[] {
  const suggestions: DeFiSuggestion[] = [];
  if (analysis.totalValueUsd === 0) return suggestions;

  const overweight: Array<{ symbol: string; deviation: number }> = [];
  const underweight: Array<{ symbol: string; deviation: number }> = [];

  for (const [symbol, deviation] of Object.entries(analysis.deviations)) {
    if (deviation > REBALANCE_THRESHOLD) overweight.push({ symbol, deviation });
    else if (deviation < -REBALANCE_THRESHOLD) underweight.push({ symbol, deviation });
  }

  overweight.sort((a, b) => b.deviation - a.deviation);
  underweight.sort((a, b) => a.deviation - b.deviation);

  // ETH reserve check
  const ethAllocation = analysis.allocations['ETH'];
  if (ethAllocation && ethAllocation.percentage < MIN_ETH_RESERVE) {
    const ethDeficit = (TARGET_ALLOCATION['ETH'] ?? 0.05) - ethAllocation.percentage;
    const fromSymbol = overweight[0]?.symbol ?? 'USDT';
    suggestions.push({
      type: 'swap',
      reason: `ETH reserve low (${(ethAllocation.percentage * 100).toFixed(1)}%). Swap from ${fromSymbol}.`,
      priority: 0.95,
      details: { fromSymbol, toSymbol: 'ETH', estimatedAmountUsd: (ethDeficit * analysis.totalValueUsd).toFixed(2) },
    });
  }

  // Pair overweight with underweight
  for (const over of overweight) {
    for (const under of underweight) {
      if (under.symbol === 'ETH' && ethAllocation && ethAllocation.percentage < MIN_ETH_RESERVE) continue;
      const swapDeviation = Math.min(over.deviation, Math.abs(under.deviation));
      suggestions.push({
        type: 'swap',
        reason: `${over.symbol} +${(over.deviation * 100).toFixed(1)}%, ${under.symbol} ${(under.deviation * 100).toFixed(1)}%. Rebalance.`,
        priority: Math.min(0.9, 0.5 + swapDeviation),
        details: { fromSymbol: over.symbol, toSymbol: under.symbol, estimatedAmountUsd: (swapDeviation * analysis.totalValueUsd).toFixed(2) },
      });
    }
  }

  suggestions.sort((a, b) => b.priority - a.priority);
  return suggestions;
}
