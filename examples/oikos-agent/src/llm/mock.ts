/**
 * Mock LLM — Deterministic responses for testing and demo.
 *
 * Produces predictable operation decisions across an 8-step cycle
 * covering all operation types: payment, swap, bridge, yield, hold.
 * No actual LLM needed.
 */

import type { LLMResult, LLMPaymentDecision } from './client.js';

/** Extended decision type for mock DeFi operations */
interface MockDecision extends LLMPaymentDecision {
  operationType: string;
  toSymbol?: string;
  fromChain?: string;
  toChain?: string;
  protocol?: string;
  action?: string;
}

/** Pre-scripted 8-decision cycle mixing all operation types */
const DEMO_DECISIONS: Array<MockDecision | null> = [
  // 1. Payment: 2 USDT to creator (milestone)
  {
    shouldPay: true,
    reason: 'Milestone payment: First portfolio cycle complete. Disbursing 2 USDT to creator.',
    confidence: 0.92,
    amount: '2000000',
    symbol: 'USDT',
    chain: 'ethereum',
    to: '0xCREATOR1000000000000000000000000000000001',
    strategy: 'milestone',
    operationType: 'payment',
  },
  // 2. Swap: 10 USDT -> XAUT (portfolio diversification)
  {
    shouldPay: true,
    reason: 'Portfolio diversification: XAUt allocation below target (20%). Swapping 10 USDT to XAUT for gold exposure.',
    confidence: 0.88,
    amount: '10000000',
    symbol: 'USDT',
    chain: 'ethereum',
    to: '',
    strategy: 'rebalance',
    operationType: 'swap',
    toSymbol: 'XAUT',
  },
  // 3. Hold
  null,
  // 4. Yield: deposit 20 USDT into aave
  {
    shouldPay: true,
    reason: 'Yield optimization: Depositing 20 USDT into Aave lending pool. Current APY favorable for idle stablecoins.',
    confidence: 0.85,
    amount: '20000000',
    symbol: 'USDT',
    chain: 'ethereum',
    to: '',
    strategy: 'yield_optimization',
    operationType: 'yield',
    protocol: 'aave',
    action: 'deposit',
  },
  // 5. Bridge: 5 USDT Ethereum -> Arbitrum
  {
    shouldPay: true,
    reason: 'Gas optimization: Bridging 5 USDT from Ethereum to Arbitrum for lower transaction costs.',
    confidence: 0.80,
    amount: '5000000',
    symbol: 'USDT',
    chain: 'ethereum',
    to: '',
    strategy: 'gas_optimization',
    operationType: 'bridge',
    fromChain: 'ethereum',
    toChain: 'arbitrum',
  },
  // 6. Swap: 5 USDT -> USAT
  {
    shouldPay: true,
    reason: 'Stablecoin diversification: USAt allocation below target (25%). Swapping 5 USDT to USAT.',
    confidence: 0.82,
    amount: '5000000',
    symbol: 'USDT',
    chain: 'ethereum',
    to: '',
    strategy: 'rebalance',
    operationType: 'swap',
    toSymbol: 'USAT',
  },
  // 7. Payment: 3 USDT to creator
  {
    shouldPay: true,
    reason: 'Strategic disbursement: Community engagement high. Sending 3 USDT to creator.',
    confidence: 0.90,
    amount: '3000000',
    symbol: 'USDT',
    chain: 'ethereum',
    to: '0xCREATOR1000000000000000000000000000000001',
    strategy: 'sentiment',
    operationType: 'payment',
  },
  // 8. Yield: withdraw 10 USDT from aave
  {
    shouldPay: true,
    reason: 'Portfolio rebalance: Withdrawing 10 USDT from Aave to increase liquid USDT reserves.',
    confidence: 0.78,
    amount: '10000000',
    symbol: 'USDT',
    chain: 'ethereum',
    to: '',
    strategy: 'rebalance',
    operationType: 'yield',
    protocol: 'aave',
    action: 'withdraw',
  },
];

const DEMO_REASONING = [
  'Analyzing portfolio state... First cycle complete. Creator address configured. Disbursing milestone payment of 2 USDT.',
  'Portfolio analysis... XAUt allocation is 0% vs target 20%. Swapping 10 USDT to XAUT via DEX.',
  'Market signals quiet... No significant events. Holding position.',
  'Yield opportunity detected... Aave lending pool offering favorable APY on USDT. Depositing 20 USDT.',
  'Gas cost analysis... Ethereum L1 gas prices elevated. Bridging 5 USDT to Arbitrum.',
  'Stablecoin analysis... USAt allocation at 0% vs target 25%. Swapping 5 USDT to USAT.',
  'Community engagement spike... Allocating 3 USDT as performance-based disbursement.',
  'Portfolio rebalance... Withdrawing 10 USDT from Aave to maintain operational liquidity.',
];

export class MockLLM {
  private decisionIndex = 0;

  async reason(_systemPrompt: string, _userPrompt: string): Promise<LLMResult> {
    const idx = this.decisionIndex % DEMO_DECISIONS.length;
    const decision = DEMO_DECISIONS[idx] ?? null;
    const reasoning = DEMO_REASONING[idx] ?? 'No reasoning available';

    this.decisionIndex++;

    // Simulate LLM latency
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));

    return {
      decision: decision as LLMPaymentDecision | null,
      reasoning,
      model: 'mock-qwen3-8b',
      tokensUsed: 150 + Math.floor(Math.random() * 100),
    };
  }

  reset(): void {
    this.decisionIndex = 0;
  }
}
