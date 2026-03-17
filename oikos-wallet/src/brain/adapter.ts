/**
 * Brain Adapter — Agent-Agnostic Chat Bridge.
 *
 * Oikos defines the contract: send a message, get a reply.
 * Any agent framework implements the adapter:
 *   - OpenClaw → channel plugin behind an HTTP endpoint
 *   - Direct Ollama → local LLM with wallet context
 *   - Claude Code → local HTTP server piping to API
 *   - Custom → anything that speaks { message } → { reply }
 *
 * "Swap the brain, keep the wallet."
 *
 * @security Chat messages stay on loopback (127.0.0.1) or Noise-encrypted P2P.
 * No message content ever leaves the machine unencrypted.
 */

import type { OikosServices } from '../types.js';

/** Wallet context injected into brain calls */
export interface WalletContext {
  balances: Array<{ symbol: string; chain: string; formatted: string }>;
  policies: Array<{ rule: string; remaining?: string; status?: string }>;
  recentAudit: Array<{ type: string; status?: string; timestamp?: string }>;
  identity: { registered: boolean; agentId: string | null };
  swarmPeers: number;
  swarmAnnouncements: Array<{ id: string; title: string; category: string; agentName: string; priceRange?: { min: string; max: string; symbol: string } }>;
  swarmRooms: Array<{ announcementId: string; status: string; bids: number }>;
}

/** Chat message stored in history */
export interface ChatMessage {
  id: string;
  text: string;
  from: 'human' | 'agent';
  timestamp: number;
}

/** Brain adapter interface — the agent-agnostic contract */
export interface BrainAdapter {
  /** Process a chat message and return the agent's reply */
  chat(message: string, context: WalletContext): Promise<string>;
  /** Human-readable adapter name (for logs/UI) */
  readonly name: string;
}

// ── Ollama Adapter (default — sovereign, local) ──

const WALLET_SYSTEM_PROMPT = `You are the Oikos Agent — an autonomous AI managing a self-custodial multi-chain cryptocurrency wallet via the Oikos Protocol.

You operate through MCP tools at http://127.0.0.1:3420/mcp. All operations go through the PolicyEngine in the Wallet Isolate (a separate process). You NEVER have access to private keys or seed phrases — they exist in a different process you cannot reach.

## Your MCP Tools

### Wallet Operations
- propose_payment: Send tokens. Args: amount, symbol, chain, to, reason, confidence
- propose_swap: Swap tokens (e.g. USDT→XAUT). Args: amount, symbol, toSymbol, chain, reason, confidence
- propose_bridge: Bridge cross-chain. Args: amount, symbol, fromChain, toChain, reason, confidence
- propose_yield: Deposit/withdraw yield. Args: amount, symbol, chain, protocol, action (deposit|withdraw), reason, confidence
- wallet_balance_all: Get all balances
- wallet_address: Get wallet addresses
- policy_status: Check spending limits and cooldowns

### Swarm Operations (P2P Agent Marketplace)
- swarm_announce: Post listing on the board. Args: category (seller|buyer|auction), title, description, minPrice, maxPrice, symbol, tags[]
- swarm_bid: Bid on a listing. Args: announcementId, price, symbol, reason
- swarm_accept_bid: Accept best bid (if you're the creator). Args: announcementId
- swarm_submit_payment: Execute payment for accepted deal. Args: announcementId
- swarm_cancel_room: Cancel a negotiation. Args: announcementId
- swarm_room_state: Check negotiation status. Args: announcementId
- swarm_state: Get full swarm state (peers, board, rooms)

### Read-Only
- audit_log: Transaction history
- agent_state: Overall agent state

## Rules
- When asked to perform an operation, DO IT by calling the appropriate MCP tool via the REST API. Don't just describe what you would do.
- For swarm announcements: pick appropriate category (seller if offering something, buyer if requesting something).
- All write operations go through the PolicyEngine. If rejected, explain the policy violation.
- Be concise, direct, precise with numbers. You manage real value.
- NEVER claim to have access to seed phrases or private keys. You don't. They are in a separate process.`;

export class OllamaBrainAdapter implements BrainAdapter {
  readonly name = 'ollama';
  private baseUrl: string;
  private model: string;

  constructor(baseUrl = 'http://127.0.0.1:11434', model = 'qwen3:8b') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async chat(message: string, context: WalletContext): Promise<string> {
    const contextBlock = this._buildContext(context);
    const systemPrompt = `${WALLET_SYSTEM_PROMPT}\n\n## Current Wallet State\n${contextBlock}`;

    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
          temperature: 0.7,
          max_tokens: 1024,
          stream: false,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Ollama ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const reply = data.choices?.[0]?.message?.content ?? '';
      if (!reply) throw new Error('Empty response from Ollama');

      // Strip <think> blocks if present (Qwen reasoning mode)
      return reply.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[brain:ollama] Error: ${msg}`);
      throw err;
    }
  }

  private _buildContext(ctx: WalletContext): string {
    const lines: string[] = [];

    if (ctx.balances.length > 0) {
      lines.push('### Balances');
      for (const b of ctx.balances) {
        lines.push(`- ${b.symbol} (${b.chain}): ${b.formatted}`);
      }
    } else {
      lines.push('### Balances\nNo balances available yet.');
    }

    if (ctx.policies.length > 0) {
      lines.push('\n### Policy Status');
      for (const p of ctx.policies) {
        lines.push(`- ${p.rule}: ${p.remaining ?? p.status ?? 'active'}`);
      }
    }

    if (ctx.identity.registered) {
      lines.push(`\n### Identity\nERC-8004 registered, agentId: ${ctx.identity.agentId}`);
    }

    if (ctx.swarmPeers > 0 || ctx.swarmAnnouncements.length > 0) {
      lines.push(`\n### Swarm\n${ctx.swarmPeers} peers connected`);
      if (ctx.swarmAnnouncements.length > 0) {
        lines.push(`\n**Board Announcements** (${ctx.swarmAnnouncements.length}):`);
        for (const a of ctx.swarmAnnouncements.slice(0, 10)) {
          const price = a.priceRange ? `${a.priceRange.min}-${a.priceRange.max} ${a.priceRange.symbol}` : 'N/A';
          lines.push(`- [${a.id.slice(0, 8)}] ${a.category}: "${a.title}" by ${a.agentName} (${price})`);
        }
      }
      if (ctx.swarmRooms.length > 0) {
        lines.push(`\n**Active Rooms** (${ctx.swarmRooms.length}):`);
        for (const r of ctx.swarmRooms.slice(0, 5)) {
          lines.push(`- [${r.announcementId.slice(0, 8)}] ${r.status}, ${r.bids} bid(s)`);
        }
      }
    }

    return lines.join('\n');
  }
}

// ── HTTP Adapter (agent-agnostic — OpenClaw, custom brains) ──

export class HttpBrainAdapter implements BrainAdapter {
  readonly name: string;
  private url: string;
  private timeoutMs: number;

  constructor(url: string, name = 'http', timeoutMs = 30000) {
    this.url = url;
    this.name = name;
    this.timeoutMs = timeoutMs;
  }

  async chat(message: string, context: WalletContext): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context, from: 'companion' }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Brain HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = await res.json() as { reply?: string; text?: string; message?: string };
      const reply = data.reply ?? data.text ?? data.message ?? '';
      if (!reply) throw new Error('Empty reply from brain');
      return reply;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[brain:${this.name}] Error: ${msg}`);
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ── Mock Adapter (for demo/testing) ──

export class MockBrainAdapter implements BrainAdapter {
  readonly name = 'mock';

  async chat(message: string, context: WalletContext): Promise<string> {
    const lower = message.toLowerCase();

    if (lower.includes('balance') || lower.includes('portfolio')) {
      if (context.balances.length === 0) {
        return 'No balances loaded yet. The wallet is initializing.';
      }
      const lines = context.balances.map(b => `${b.symbol} (${b.chain}): ${b.formatted}`);
      return `Current portfolio:\n${lines.join('\n')}`;
    }

    if (lower.includes('swap') || lower.includes('trade')) {
      return 'I can propose a swap for you. What token pair and amount? For example: "swap 10 USDT to XAUT"';
    }

    if (lower.includes('send') || lower.includes('pay') || lower.includes('transfer')) {
      return 'I can propose a payment. Please specify: amount, token, and recipient address.';
    }

    if (lower.includes('policy') || lower.includes('limit') || lower.includes('budget')) {
      if (context.policies.length === 0) return 'No policy data available.';
      const lines = context.policies.map(p => `${p.rule}: ${p.remaining ?? p.status ?? 'active'}`);
      return `Policy status:\n${lines.join('\n')}`;
    }

    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      return `Hello! I'm your Oikos agent. I manage a multi-chain wallet with ${context.balances.length} asset(s) and ${context.swarmPeers} swarm peer(s). How can I help?`;
    }

    return `Understood: "${message}". I'm monitoring the wallet and swarm. Ask me about balances, swaps, payments, or policy status.`;
  }
}

// ── Factory ──

export type BrainType = 'ollama' | 'http' | 'mock';

export interface BrainConfig {
  type: BrainType;
  /** URL for Ollama API or external brain endpoint */
  chatUrl: string;
  /** Model name (for Ollama) */
  model: string;
}

export function createBrainAdapter(config: BrainConfig): BrainAdapter {
  switch (config.type) {
    case 'ollama':
      return new OllamaBrainAdapter(config.chatUrl || 'http://127.0.0.1:11434', config.model || 'qwen3:8b');
    case 'http':
      return new HttpBrainAdapter(config.chatUrl, 'external');
    case 'mock':
      return new MockBrainAdapter();
    default:
      console.error(`[brain] Unknown type "${config.type}", falling back to mock`);
      return new MockBrainAdapter();
  }
}

/** Build wallet context from services (for injection into brain calls) */
export async function buildWalletContext(services: OikosServices): Promise<WalletContext> {
  const [balances, policies, audit] = await Promise.all([
    services.wallet.queryBalanceAll().catch(() => [] as Array<{ symbol: string; chain: string; formatted: string }>),
    services.wallet.queryPolicy().catch(() => [] as Array<{ rule: string; remaining?: string; status?: string }>),
    services.wallet.queryAudit(5).catch(() => [] as Array<{ type: string; status?: string; timestamp?: string }>),
  ]);

  const swarmState = services.swarm?.getState() as {
    boardPeers?: unknown[];
    announcements?: Array<{ id: string; title: string; category: string; agentName: string; priceRange?: { min: string; max: string; symbol: string } }>;
    rooms?: Array<{ announcementId: string; status: string; bids: Array<unknown> }>;
  } | undefined;

  return {
    balances: balances as Array<{ symbol: string; chain: string; formatted: string }>,
    policies: policies as Array<{ rule: string; remaining?: string; status?: string }>,
    recentAudit: audit as Array<{ type: string; status?: string; timestamp?: string }>,
    identity: services.identity,
    swarmPeers: swarmState?.boardPeers?.length ?? 0,
    swarmAnnouncements: (swarmState?.announcements ?? []).map(a => ({
      id: a.id, title: a.title, category: a.category, agentName: a.agentName, priceRange: a.priceRange,
    })),
    swarmRooms: (swarmState?.rooms ?? []).map(r => ({
      announcementId: r.announcementId, status: r.status, bids: r.bids?.length ?? 0,
    })),
  };
}
