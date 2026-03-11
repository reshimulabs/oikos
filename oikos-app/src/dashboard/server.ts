/**
 * Dashboard Server — localhost-only monitoring UI + REST API.
 *
 * Serves a static HTML dashboard and REST API for wallet state.
 * Uses OikosServices for direct access to all infrastructure.
 * NEVER exposed to the internet. Binds to 127.0.0.1 only.
 *
 * @security All proposals flow through the Wallet Isolate's PolicyEngine.
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { OikosServices } from '../types.js';
import type { TokenSymbol, Chain } from '../ipc/types.js';
import { mountMCP } from '../mcp/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createDashboard(
  services: OikosServices,
  port: number,
): void {
  const app = express();
  const { wallet } = services;

  // Serve static files
  const projectRoot = join(__dirname, '..', '..', '..');
  const publicDir = join(projectRoot, 'src', 'dashboard', 'public');
  app.use(express.static(publicDir));
  app.use(express.json());

  // -- MCP Endpoint --
  mountMCP(app, services);

  // -- API Routes --

  /** Agent state — stub for agent-agnostic mode */
  app.get('/api/state', (_req, res) => {
    res.json({ status: 'connect_your_agent_via_mcp', hint: 'Use MCP tools at POST /mcp or REST API endpoints' });
  });

  /** Wallet balances — all assets across all chains */
  app.get('/api/balances', async (_req, res) => {
    try {
      const balances = await wallet.queryBalanceAll();
      res.json({ balances });
    } catch {
      res.status(500).json({ error: 'Failed to query balances' });
    }
  });

  /** Wallet addresses */
  app.get('/api/addresses', async (_req, res) => {
    try {
      const eth = await wallet.queryAddress('ethereum').catch(() => null);
      res.json({ addresses: [eth].filter(Boolean) });
    } catch {
      res.status(500).json({ error: 'Failed to query addresses' });
    }
  });

  /** Policy status */
  app.get('/api/policies', async (_req, res) => {
    try {
      const policies = await wallet.queryPolicy();
      res.json({ policies });
    } catch {
      res.status(500).json({ error: 'Failed to query policies' });
    }
  });

  /** Audit log entries */
  app.get('/api/audit', async (req, res) => {
    try {
      const limit = parseInt(String(req.query['limit'] ?? '50'), 10);
      const entries = await wallet.queryAudit(limit);
      res.json({ entries });
    } catch {
      res.status(500).json({ error: 'Failed to query audit log' });
    }
  });

  /** Swarm state — peers, announcements, rooms */
  app.get('/api/swarm', (_req, res) => {
    if (!services.swarm) {
      res.json({ enabled: false });
      return;
    }
    res.json({ enabled: true, ...services.swarm.getState() });
  });

  /** Swarm economics — revenue, costs, sustainability */
  app.get('/api/economics', (_req, res) => {
    if (!services.swarm) {
      res.json({ enabled: false });
      return;
    }
    const state = services.swarm.getState();
    res.json({ enabled: true, economics: (state as Record<string, unknown>)['economics'] });
  });

  // ── ERC-8004 Identity & Reputation ──

  app.get('/agent-card.json', (_req, res) => {
    res.json({
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name: 'Oikos Agent',
      description: 'Autonomous AI agent with process-isolated multi-chain wallet.',
      services: [
        { name: 'MCP', endpoint: `http://127.0.0.1:${port}/mcp`, version: '2025-06-18' },
        { name: 'web', endpoint: `http://127.0.0.1:${port}/` },
      ],
      x402Support: true,
      active: true,
      registrations: services.identity.agentId
        ? [{ agentId: Number(services.identity.agentId), agentRegistry: 'eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e' }]
        : [],
      supportedTrust: ['reputation'],
    });
  });

  app.get('/api/identity', (_req, res) => {
    res.json(services.identity);
  });

  app.get('/api/reputation/onchain', async (_req, res) => {
    if (!services.identity.registered || !services.identity.agentId) {
      res.json({ registered: false });
      return;
    }
    try {
      const rep = await wallet.queryReputation(services.identity.agentId);
      res.json({ registered: true, ...rep });
    } catch {
      res.status(500).json({ error: 'Failed to query on-chain reputation' });
    }
  });

  // ── Pricing & Portfolio Valuation ──

  app.get('/api/prices', async (_req, res) => {
    if (!services.pricing) {
      res.json({ source: 'unavailable', prices: [] });
      return;
    }
    try {
      const prices = await services.pricing.getAllPrices();
      res.json({ prices });
    } catch {
      res.status(500).json({ error: 'Failed to fetch prices' });
    }
  });

  app.get('/api/valuation', async (_req, res) => {
    try {
      const balances = await wallet.queryBalanceAll();
      if (services.pricing) {
        const valuation = await services.pricing.valuatePortfolio(balances);
        res.json(valuation);
      } else {
        res.json({ totalUsd: 0, assets: [], prices: [], updatedAt: Date.now() });
      }
    } catch {
      res.status(500).json({ error: 'Failed to compute valuation' });
    }
  });

  app.get('/api/prices/history/:symbol', async (req, res) => {
    if (!services.pricing) {
      res.json({ symbol: req.params['symbol'], history: [] });
      return;
    }
    const symbol = (req.params['symbol'] ?? '').toUpperCase();
    try {
      const history = await services.pricing.getHistoricalPrices(symbol);
      res.json({ symbol, history });
    } catch {
      res.status(500).json({ error: `Failed to fetch history for ${symbol}` });
    }
  });

  // ── Dry-Run Policy Check ──

  app.post('/api/simulate', async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const proposal = {
        amount: String(body['amount'] ?? '0'),
        symbol: String(body['symbol'] ?? 'USDT') as TokenSymbol,
        chain: String(body['chain'] ?? 'ethereum') as Chain,
        reason: String(body['reason'] ?? 'dry-run'),
        confidence: Number(body['confidence'] ?? 0.85),
        strategy: String(body['strategy'] ?? 'simulate'),
        timestamp: Date.now(),
        ...(body['to'] ? { to: String(body['to']) } : {}),
        ...(body['toSymbol'] ? { toSymbol: String(body['toSymbol']) } : {}),
      };
      const result = await wallet.simulateProposal(proposal);
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Failed to simulate proposal' });
    }
  });

  // ── RGB Asset Endpoints ──

  app.get('/api/rgb/assets', async (_req, res) => {
    try {
      const assets = await wallet.queryRGBAssets();
      res.json({ assets });
    } catch {
      res.status(500).json({ error: 'Failed to query RGB assets' });
    }
  });

  // ── Events (for connected agents) ──

  app.get('/api/events', (req, res) => {
    if (!services.eventBus) {
      res.json({ events: [] });
      return;
    }
    const limit = parseInt(String(req.query['limit'] ?? '50'), 10);
    res.json({ events: services.eventBus.getRecent(limit) });
  });

  // ── Companion Instructions (for connected agents to read) ──

  app.get('/api/companion/instructions', (req, res) => {
    const limit = parseInt(String(req.query['limit'] ?? '50'), 10);
    res.json({ instructions: services.instructions.slice(-limit) });
  });

  /** Health check */
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      walletConnected: wallet.isRunning(),
      swarmEnabled: !!services.swarm,
      companionConnected: services.companionConnected,
      eventsBuffered: services.eventBus?.count ?? 0,
    });
  });

  // Bind to localhost only — never expose to network
  app.listen(port, '127.0.0.1', () => {
    console.error(`[dashboard] Listening on http://127.0.0.1:${port}`);
  });
}
