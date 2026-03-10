---
name: wdk-wallet
description: Process-isolated, multi-chain, multi-asset crypto wallet with policy-enforced spending limits. Supports USDt, XAUt, USAt, BTC, ETH. Handles payments, swaps, bridges, yield, and on-chain reputation.
version: 0.2.0
author: Oikos Protocol
tags:
  - wallet
  - crypto
  - payments
  - wdk
  - tether
  - defi
  - multi-chain
  - multi-asset
  - swarm
  - reputation
---

# WDK Wallet Skill

You have access to a self-custodial cryptocurrency wallet powered by Tether's WDK (Wallet Development Kit). The wallet runs in a **separate isolated process** with its own policy engine — even if you are compromised, the wallet enforces constraints independently.

## How to Call Wallet Tools

The wallet exposes an MCP (Model Context Protocol) endpoint at `http://127.0.0.1:3420/mcp`. All operations use JSON-RPC 2.0 via POST requests.

**To call any wallet tool, use curl:**

```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"TOOL_NAME","arguments":{ARGS}}}'
```

Replace `TOOL_NAME` and `ARGS` with one of the tools below.

## Available Tools

### Query Tools (read-only, always safe)

**Check all balances:**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"wallet_balance_all","arguments":{}}}'
```

**Check single asset balance:**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"wallet_balance","arguments":{"chain":"ethereum","symbol":"USDT"}}}'
```
- `chain`: "ethereum" | "polygon" | "bitcoin" | "arbitrum"
- `symbol`: "USDT" | "XAUT" | "USAT" | "BTC" | "ETH"

**Get wallet address:**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"wallet_address","arguments":{"chain":"ethereum"}}}'
```

**Check policy status (remaining budgets, cooldowns):**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"policy_status","arguments":{}}}'
```

**Query audit log (recent transactions):**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"audit_log","arguments":{"limit":10}}}'
```

**Get agent state:**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"agent_state","arguments":{}}}'
```

**Get swarm state (peers, rooms, announcements):**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"swarm_state","arguments":{}}}'
```

**Get ERC-8004 identity state:**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"identity_state","arguments":{}}}'
```

**Query on-chain reputation:**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_reputation","arguments":{"agentId":"1"}}}'
```

### Proposal Tools (write — all go through PolicyEngine)

**Propose a payment:**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"propose_payment","arguments":{"amount":"1000000","symbol":"USDT","chain":"ethereum","to":"0xRecipientAddress","reason":"Why this payment","confidence":0.85}}}'
```

**Propose a swap:**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"propose_swap","arguments":{"amount":"5000000","symbol":"USDT","toSymbol":"XAUT","chain":"ethereum","reason":"Portfolio rebalance","confidence":0.85}}}'
```

**Propose a bridge:**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"propose_bridge","arguments":{"amount":"1000000","symbol":"USDT","fromChain":"ethereum","toChain":"arbitrum","reason":"Lower gas fees","confidence":0.9}}}'
```

**Propose yield deposit/withdrawal:**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"propose_yield","arguments":{"amount":"2000000","symbol":"USDT","chain":"ethereum","protocol":"aave-v3","action":"deposit","reason":"Earn yield on idle USDT","confidence":0.8}}}'
```

**Post swarm announcement:**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"swarm_announce","arguments":{"category":"service","title":"Data Feed","description":"Live price data","minPrice":"100000","maxPrice":"500000","symbol":"USDT"}}}'
```

## REST API (alternative)

The dashboard also exposes REST endpoints at `http://127.0.0.1:3420`:

- `GET /api/health` — health check
- `GET /api/balances` — all balances
- `GET /api/addresses` — wallet addresses
- `GET /api/state` — agent brain state
- `GET /api/policies` — policy status
- `GET /api/audit?limit=20` — audit log
- `GET /api/swarm` — swarm state
- `GET /api/economics` — revenue/costs/sustainability
- `GET /api/prices` — live asset prices
- `GET /api/valuation` — portfolio USD valuation
- `GET /api/identity` — ERC-8004 identity
- `GET /api/reputation/onchain` — on-chain reputation
- `GET /agent-card.json` — ERC-8004 agent card

Example: `curl -s http://127.0.0.1:3420/api/balances | jq .`

## Supported Assets

| Symbol | Name | Type | Chains |
|--------|------|------|--------|
| USDT | Tether USD | ERC-20 stablecoin | Ethereum, Polygon, Arbitrum |
| XAUT | Tether Gold | ERC-20 gold-backed | Ethereum |
| USAT | Tether US | ERC-20 regulated stable | Ethereum |
| BTC | Bitcoin | Native | Bitcoin |
| ETH | Ethereum | Native | Ethereum |

## Policy Rules

Proposals are checked against:

| Rule | Description |
|------|-------------|
| `max_per_tx` | Maximum amount per single transaction |
| `max_per_session` | Total spending limit for the session |
| `max_per_day` | Daily spending cap |
| `cooldown_seconds` | Minimum time between transactions |
| `require_confidence` | Minimum confidence score required |
| `whitelist_recipients` | Only approved recipient addresses |

If **any** rule is violated, the proposal is rejected and no funds move.

## What You CANNOT Do

- Modify wallet policies (immutable for process lifetime)
- Access private keys or seed phrases (wallet isolate only)
- Bypass spending limits or cooldowns
- Send funds without policy approval
- Retry failed transactions (submit a new proposal instead)

## Security Model

- **Process isolation**: Wallet runs in a separate Bare Runtime process
- **Structured IPC**: JSON-lines over stdin/stdout
- **Append-only audit**: Every proposal permanently recorded
- **Fail closed**: Ambiguity = no funds move
- **Deterministic policy**: Same proposal + same state = same decision
