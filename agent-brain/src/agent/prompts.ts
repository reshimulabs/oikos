/**
 * Prompt templates for the Agent Brain.
 *
 * The system prompt defines the agent's role and constraints.
 * The user prompt provides current context for decision-making.
 */

import type { BalanceResponse, PolicyStatus } from '../ipc/types.js';

/** Build the agent's system prompt */
export function buildSystemPrompt(
  balances: BalanceResponse[],
  policies: PolicyStatus[],
  creatorAddress: string,
): string {
  const balanceInfo = balances.map(b =>
    `  ${b.chain}/${b.symbol}: ${b.formatted}`
  ).join('\n');

  const policyInfo = policies.map(p => {
    const session = Object.entries(p.state.sessionTotals)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return `  ${p.name} — session spent: ${session || 'none'}`;
  }).join('\n');

  return `You are SovClaw, an autonomous AI agent that manages a self-custodial crypto wallet.
Your job is to analyze live stream events and decide when to tip creators with cryptocurrency.

## Your Wallet
${balanceInfo || '  No balances available'}

## Active Policies
${policyInfo || '  No active policies'}

## Creator
Target address: ${creatorAddress}
Chain: ethereum

## Decision Rules
1. You MUST respond with valid JSON containing these fields:
   - "shouldPay": boolean — whether to send a payment
   - "reason": string — why you made this decision (be specific)
   - "confidence": number (0.0 to 1.0) — how confident you are
   - "amount": string — amount in smallest unit (e.g., "1000000" = 1 USDT)
   - "symbol": "USDT" | "XAUT" | "BTC"
   - "chain": "ethereum" | "polygon" | "bitcoin"
   - "to": string — recipient address
   - "strategy": "milestone" | "sentiment" | "threshold" | "split"
   - "reasoning": string — your full reasoning process

2. Tip triggers:
   - Viewer milestones (50, 100, 500, 1000)
   - Engagement spikes (3x+ chat rate increase)
   - Positive sentiment waves
   - Community events (large donations, raids)

3. DO NOT tip for:
   - Normal low activity
   - Negative or toxic chat
   - Declining metrics
   - When wallet balance is too low

4. Amount guidelines:
   - Small tips: 1-2 USDT (routine milestones)
   - Medium tips: 2-5 USDT (significant engagement)
   - Large tips: 5+ USDT (exceptional events only)

5. Always check remaining budget before tipping. Be conservative.

## Critical Constraints
- You CANNOT modify wallet policies
- You CANNOT access private keys
- Your proposals go through a PolicyEngine that enforces spending limits
- A rejected proposal means you are spending too much — back off`;
}

/** Build context prompt from recent events */
export function buildEventPrompt(
  events: Array<{ type: string; data: Record<string, unknown>; timestamp: string }>
): string {
  if (events.length === 0) {
    return 'No new events in this cycle. What is your assessment?';
  }

  const eventSummaries = events.map(e => {
    const data = e.data;
    switch (data['type']) {
      case 'viewer_count':
        return `[${e.timestamp}] Viewers: ${String(data['count'])} (${Number(data['delta']) > 0 ? '+' : ''}${String(data['delta'])})`;
      case 'chat_message':
        return `[${e.timestamp}] Chat (${String(data['sentiment'] ?? 'unknown')}): ${String(data['username'])}: "${String(data['message'])}"`;
      case 'donation':
        return `[${e.timestamp}] DONATION: ${String(data['username'])} donated $${String(data['amount'])} — "${String(data['message'] ?? '')}"`;
      case 'milestone':
        return `[${e.timestamp}] MILESTONE: ${String(data['name'])} reached (${String(data['value'])}/${String(data['threshold'])})`;
      case 'engagement_spike':
        return `[${e.timestamp}] ENGAGEMENT SPIKE: Chat rate ${String(data['chatRate'])}/min (${String(data['multiplier'])}x increase)`;
      case 'stream_status':
        return `[${e.timestamp}] Stream status: ${String(data['status'])}`;
      default:
        return `[${e.timestamp}] Unknown event: ${JSON.stringify(data).slice(0, 100)}`;
    }
  });

  return `Here are the latest events from the stream:\n\n${eventSummaries.join('\n')}\n\nBased on these events, should we tip the creator? Respond with JSON.`;
}
