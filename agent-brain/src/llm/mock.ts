/**
 * Mock LLM — Deterministic responses for testing and demo.
 *
 * Produces predictable PaymentProposal decisions based on
 * simple pattern matching, no actual LLM needed.
 */

import type { LLMResult, LLMPaymentDecision } from './client.js';

/** Pre-scripted decision sequences for demo mode */
const DEMO_DECISIONS: LLMPaymentDecision[] = [
  {
    shouldPay: true,
    reason: 'Creator milestone: 100 concurrent viewers reached. This shows strong community engagement.',
    confidence: 0.92,
    amount: '2000000', // 2 USDT
    symbol: 'USDT',
    chain: 'ethereum',
    to: '0xCREATOR1000000000000000000000000000000001',
    strategy: 'milestone',
  },
  {
    shouldPay: true,
    reason: 'Engagement spike: Chat activity increased 3x in the last minute. Positive sentiment detected.',
    confidence: 0.85,
    amount: '1000000', // 1 USDT
    symbol: 'USDT',
    chain: 'ethereum',
    to: '0xCREATOR1000000000000000000000000000000001',
    strategy: 'sentiment',
  },
  {
    shouldPay: false,
    reason: 'Activity is declining. Viewer count dropped below threshold. Holding funds.',
    confidence: 0.7,
    amount: '0',
    symbol: 'USDT',
    chain: 'ethereum',
    to: '',
    strategy: 'threshold',
  },
  {
    shouldPay: true,
    reason: 'Large community donation triggered excitement wave. Rewarding creator for community building.',
    confidence: 0.95,
    amount: '3000000', // 3 USDT
    symbol: 'USDT',
    chain: 'ethereum',
    to: '0xCREATOR1000000000000000000000000000000001',
    strategy: 'sentiment',
  },
  {
    shouldPay: true,
    reason: 'End of stream thank-you tip. Creator provided excellent content throughout the session.',
    confidence: 0.88,
    amount: '5000000', // 5 USDT — this should hit session limit in demo
    symbol: 'USDT',
    chain: 'ethereum',
    to: '0xCREATOR1000000000000000000000000000000001',
    strategy: 'threshold',
  },
];

const DEMO_REASONING = [
  'Analyzing stream metrics... Viewer count crossed 100 threshold. This is a significant milestone for this creator. Community engagement is high with positive chat sentiment. Recommending a milestone-based tip.',
  'Engagement analysis... Chat messages increased from 15/min to 45/min. Sentiment analysis shows 85% positive. The audience is highly engaged. Suggesting a sentiment-based reward.',
  'Stream metrics declining... Viewer count dropped from 100 to 65. Chat activity normalized. No strong signal for payment at this time. Will continue monitoring.',
  'Community event detected... A viewer donated significantly, triggering a wave of positive reactions. The creator is fostering a strong community. This aligns with our reward strategy.',
  'Stream concluding... The creator delivered consistent quality throughout. Remaining session budget should be allocated as a thank-you tip. Note: this may hit session spending limits.',
];

export class MockLLM {
  private decisionIndex = 0;

  /**
   * Produce a mock reasoning result.
   * Cycles through pre-scripted decisions for demo mode.
   */
  async reason(_systemPrompt: string, _userPrompt: string): Promise<LLMResult> {
    const idx = this.decisionIndex % DEMO_DECISIONS.length;
    const decision = DEMO_DECISIONS[idx] ?? null;
    const reasoning = DEMO_REASONING[idx] ?? 'No reasoning available';

    this.decisionIndex++;

    // Simulate LLM latency
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));

    return {
      decision: decision?.shouldPay ? decision : null,
      reasoning,
      model: 'mock-qwen3-8b',
      tokensUsed: 150 + Math.floor(Math.random() * 100),
    };
  }

  /** Reset to the beginning of the demo sequence */
  reset(): void {
    this.decisionIndex = 0;
  }
}
