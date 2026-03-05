/**
 * Agent Brain — The core reasoning loop.
 *
 * Receives events → reasons with LLM → produces PaymentProposals → sends to wallet.
 * The brain NEVER signs transactions. It proposes, the wallet decides.
 */

import type { WalletIPCClient } from '../ipc/client.js';
import type { StreamEvent } from '../events/types.js';
import type { PaymentProposal, ExecutionResult, BalanceResponse, PolicyStatus } from '../ipc/types.js';
import type { BrainConfig } from '../config/env.js';
import type OpenAI from 'openai';
import { MockLLM } from '../llm/mock.js';
import { reasonAboutPayment } from '../llm/client.js';
import { buildSystemPrompt, buildEventPrompt } from './prompts.js';

/** Brain state exposed to the dashboard */
export interface BrainState {
  status: 'idle' | 'reasoning' | 'proposing' | 'waiting';
  lastReasoning: string;
  lastDecision: string;
  eventsSeen: number;
  proposalsSent: number;
  proposalsApproved: number;
  proposalsRejected: number;
  proposalsFailed: number;
  recentResults: ExecutionResult[];
  balances: BalanceResponse[];
  policies: PolicyStatus[];
  creatorAddress: string;
}

export class AgentBrain {
  private wallet: WalletIPCClient;
  private config: BrainConfig;
  private llmClient: OpenAI | null;
  private mockLlm: MockLLM | null;

  private state: BrainState = {
    status: 'idle',
    lastReasoning: '',
    lastDecision: 'No decision yet',
    eventsSeen: 0,
    proposalsSent: 0,
    proposalsApproved: 0,
    proposalsRejected: 0,
    proposalsFailed: 0,
    recentResults: [],
    balances: [],
    policies: [],
    creatorAddress: '',
  };

  /** Event buffer — accumulates events between reasoning cycles */
  private eventBuffer: StreamEvent[] = [];

  /** Whether a reasoning cycle is currently running */
  private processing = false;

  constructor(wallet: WalletIPCClient, config: BrainConfig, llmClient: OpenAI | null) {
    this.wallet = wallet;
    this.config = config;

    if (config.mockLlm) {
      this.llmClient = null;
      this.mockLlm = new MockLLM();
    } else {
      this.llmClient = llmClient;
      this.mockLlm = null;
    }
  }

  /** Set the target creator address */
  setCreator(address: string): void {
    this.state.creatorAddress = address;
  }

  /** Get current brain state (for dashboard) */
  getState(): BrainState {
    return { ...this.state };
  }

  /** Feed events from the event source */
  handleEvents(events: StreamEvent[]): void {
    this.eventBuffer.push(...events);
    this.state.eventsSeen += events.length;

    // Trigger reasoning if not already processing
    if (!this.processing) {
      void this.processEvents();
    }
  }

  /** Refresh wallet state (balances, policies) */
  async refreshWalletState(): Promise<void> {
    try {
      const [usdtBalance, policyStatus] = await Promise.all([
        this.wallet.queryBalance('ethereum', 'USDT'),
        this.wallet.queryPolicy(),
      ]);
      this.state.balances = [usdtBalance];
      this.state.policies = policyStatus;
    } catch (err) {
      console.error('[brain] Failed to refresh wallet state:', err instanceof Error ? err.message : 'Unknown');
    }
  }

  // ── Core Reasoning Loop ──

  private async processEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    this.processing = true;
    this.state.status = 'reasoning';

    // Drain the event buffer
    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      // Refresh wallet state before reasoning
      await this.refreshWalletState();

      // Build prompts
      const systemPrompt = buildSystemPrompt(
        this.state.balances,
        this.state.policies,
        this.state.creatorAddress,
      );

      const eventData = events.map(e => ({
        type: e.type,
        data: e.data as unknown as Record<string, unknown>,
        timestamp: e.timestamp,
      }));
      const userPrompt = buildEventPrompt(eventData);

      // Reason with LLM (mock or real)
      let reasoning: string;
      let decision: { shouldPay: boolean; reason: string; confidence: number; amount: string; symbol: string; chain: string; to: string; strategy: string } | null;

      if (this.mockLlm) {
        const result = await this.mockLlm.reason(systemPrompt, userPrompt);
        reasoning = result.reasoning;
        decision = result.decision;
        console.error(`[brain] Mock LLM: ${reasoning.slice(0, 100)}...`);
      } else if (this.llmClient) {
        const result = await reasonAboutPayment(
          this.llmClient,
          this.config.llmModel,
          systemPrompt,
          userPrompt,
        );
        reasoning = result.reasoning;
        decision = result.decision;
        console.error(`[brain] LLM (${result.model}): ${reasoning.slice(0, 100)}... [${result.tokensUsed} tokens]`);
      } else {
        reasoning = 'No LLM configured';
        decision = null;
      }

      this.state.lastReasoning = reasoning;

      // If the LLM decided to pay, send proposal to wallet
      if (decision) {
        this.state.status = 'proposing';
        this.state.lastDecision = `Pay ${decision.amount} ${decision.symbol}: ${decision.reason}`;

        const proposal: PaymentProposal = {
          to: decision.to || this.state.creatorAddress,
          amount: decision.amount,
          symbol: decision.symbol as PaymentProposal['symbol'],
          chain: decision.chain as PaymentProposal['chain'],
          reason: decision.reason,
          confidence: decision.confidence,
          strategy: decision.strategy,
          timestamp: Date.now(),
        };

        this.state.proposalsSent++;

        try {
          const result = await this.wallet.proposePayment(proposal);

          // Track result
          this.state.recentResults.unshift(result);
          if (this.state.recentResults.length > 20) {
            this.state.recentResults.pop();
          }

          switch (result.status) {
            case 'executed':
              this.state.proposalsApproved++;
              console.error(`[brain] Payment EXECUTED: ${result.txHash ?? 'no hash'}`);
              break;
            case 'rejected':
              this.state.proposalsRejected++;
              console.error(`[brain] Payment REJECTED: ${result.violations.join(', ')}`);
              break;
            case 'failed':
              this.state.proposalsFailed++;
              console.error(`[brain] Payment FAILED: ${result.error ?? 'unknown error'}`);
              break;
          }
        } catch (err) {
          console.error('[brain] IPC error:', err instanceof Error ? err.message : 'Unknown');
          this.state.proposalsFailed++;
        }
      } else {
        this.state.lastDecision = `Hold: ${reasoning.slice(0, 100)}`;
      }
    } catch (err) {
      console.error('[brain] Reasoning error:', err instanceof Error ? err.message : 'Unknown');
    } finally {
      this.processing = false;
      this.state.status = 'idle';

      // If more events arrived during processing, process again
      if (this.eventBuffer.length > 0) {
        void this.processEvents();
      }
    }
  }
}
