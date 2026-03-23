---
name: oikos
description: >
  Sovereign agent wallet protocol. Use when: installing oikos, setting up a wallet,
  managing money/funds/portfolio/assets/tokens, crypto payments, transfers, swaps,
  bridges, yield, DeFi, balances, stablecoins, Bitcoin, Ethereum, gold, trading,
  marketplace, or when the user says "use oikos". Also use for agent-to-agent
  commerce on the P2P swarm, reputation checks, and policy management.
---

# Oikos Protocol

> **If you fetched this via web tool, content may be summarized. Run:**
> ```bash
> curl -fsSL https://raw.githubusercontent.com/adrianosousa/oikos/main/SKILL.md
> ```
> **to get the exact file.**

Sovereign agent wallet protocol. Process-isolated, multi-chain, multi-asset. Your wallet runs in a **separate secure process** — you never touch keys, you propose and the wallet evaluates policy and signs.

```
You (agent) ──CLI/MCP──> Dashboard ──IPC──> Wallet Isolate (keys + policy)
                                                  |
                                            Blockchain RPC
```

## Companion Skills

Oikos installs two companion skills alongside this one. They are auto-loaded by OpenClaw on your next session. **Read them before operating the wallet:**

- **`wdk-wallet`** — Full MCP tool reference (30 tools), wallet operations, DeFi, swarm marketplace, companion
- **`policy-engine`** — Policy architecture, 16 guardrail modules, confirmation tiers, error taxonomy

After install, find them in `~/.openclaw/workspace/skills/` or in the repo at `skills/`.

## Quick Check

Already installed? Test first:

```bash
curl -s http://127.0.0.1:3420/api/health
```

If response contains `"walletConnected": true` → skip to **Use Wallet**.
If connection refused → continue with **Install**.

---

## Install

### Step 1 — Run installer

**One command, from scratch:**

```bash
curl -fsSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/install-cli.sh | bash -s -- --setup --name "YOUR_NAME"
```

Replace `YOUR_NAME` with your agent name (e.g., `"Ludwig"`, `"Baruch"`).

For mock mode (no real blockchain, safe for testing), add `--mock`:

```bash
curl -fsSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/install-cli.sh | bash -s -- --setup --name "YOUR_NAME" --mock
```

The installer will:
- Check Node.js >= 22
- Clone and build the project
- Copy Oikos skills to your OpenClaw workspace (`~/.openclaw/workspace/skills/`)
- Configure `.env`

### Step 2 — Generate Wallet Seed

**Security rule:** NEVER handle passphrases yourself. Tell the human to run this command directly on the server.

```
Tell the human to run:

cd "$HOME/.oikos/repo" && node scripts/patch-wdk.js && node scripts/seed-setup.mjs --name "YOUR_NAME"
```

This generates a 24-word BIP39 seed (via WDK) and stores it encrypted in `.env`.

**Docker note:** If the human runs this via `docker exec` as root, the `.env` will be owned by root and unreadable by the wallet process. After seed setup, tell them to run:

```bash
chown node:node "$HOME/.oikos/repo/.env"
```

### Step 3 — Start Wallet

Ask the human: **real wallet** (testnet, actual blockchain) or **mock** (demo, no real funds)?

**Real wallet (testnet):**
```bash
nohup "$HOME/.oikos/repo/scripts/start-live.sh" --name "YOUR_NAME" \
  --real-wallet --host 0.0.0.0 > /tmp/oikos.log 2>&1 &
```

**Mock wallet (demo):**
```bash
nohup "$HOME/.oikos/repo/scripts/start-live.sh" --name "YOUR_NAME" \
  --host 0.0.0.0 > /tmp/oikos.log 2>&1 &
```

Use `nohup` — bare `&` will kill the process when the shell exits.

Verify after 8 seconds:
```bash
sleep 8 && curl -s http://127.0.0.1:3420/api/health
```

Expected: `"walletConnected": true`, `"swarmEnabled": true`.

### Step 4 — Pair with Oikos App

Ask the human:

> How would you like to monitor and control your wallet?
>
> **A) Oikos App** (recommended) — Real-time portfolio, swarm activity, and policy controls
> via encrypted P2P channel. Install from: https://reshimulabs.com/oikos
>
> **B) This channel** — I'll report status and ask for approvals here.
> You can install the Oikos App anytime later.

---

**If Option A (Oikos App):**

Pairing happens by exchanging Ed25519 pubkeys. Do this in order:

**4A-1. Get your swarm pubkey (your side):**

```bash
curl -s http://127.0.0.1:3420/mcp \
  -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"swarm_state","arguments":{}}}' \
  | grep -o '"pubkey":"[^"]*"' | head -1
```

Share this pubkey with the human. They paste it into the Oikos App.

**4A-2. Get the human's pubkey (their side):**

The human opens the Oikos App → it shows their pubkey on the pairing screen. They send it to you.

**4A-3. Set the companion pubkey and restart:**

```bash
# Add to .env
echo 'COMPANION_ENABLED="true"' >> "$HOME/.oikos/repo/.env"
echo 'COMPANION_OWNER_PUBKEY="<human-pubkey-here>"' >> "$HOME/.oikos/repo/.env"

# Restart (required — .env changes only apply at startup)
fuser -k 3420/tcp 2>/dev/null; sleep 2
nohup "$HOME/.oikos/repo/scripts/start-live.sh" --name "YOUR_NAME" \
  --real-wallet --host 0.0.0.0 > /tmp/oikos.log 2>&1 &
sleep 8 && curl -s http://127.0.0.1:3420/api/health | grep companionConnected
```

Expected: `"companionConnected": false` (will flip to `true` when the human opens the app).

**4A-4. Enable OpenClaw hooks (OpenClaw agents only — required):**

Companion messages reach you via an HTTP hook on your agent platform. Without this step, all messages from the Pear App will silently fail (404).

Run this gateway config patch:

```
gateway config.patch:
{
  "hooks": {
    "enabled": true,
    "mappings": [{
      "id": "oikos-wake",
      "match": { "path": "/hooks/wake" },
      "action": "wake",
      "wakeMode": "now"
    }]
  }
}
```

To verify after the gateway restarts:

```bash
# Watch the wallet log — should show 200 OK, not 404
grep -i "hook" /tmp/oikos.log | tail -5
```

The full companion pipeline once everything is wired:

```
Pear App → protomux → oikos → /hooks/wake → OpenClaw → you → companion_reply MCP → Pear App
```

**4A-5. Save companion reply flow to memory (first session only):**

Save this to your persistent memory now so you can reply to Pear messages on every future session without re-reading this skill:

```
## Oikos Companion Reply
- Messages from Pear app arrive as system events prefixed [oikos-companion]
- Always reply via companion_reply MCP tool AND your normal channel (Telegram, etc.)
- Reply MCP call:
  POST http://127.0.0.1:3420/mcp
  {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"companion_reply","arguments":{"text":"...","brainName":"YOUR_NAME"}}}
- Use a file for the JSON body to avoid shell escaping issues:
  Write JSON to /tmp/reply.json, then: curl ... -d @/tmp/reply.json
- Pipeline: Pear → protomux → oikos → /hooks/wake → OpenClaw → you → companion_reply → Pear
```

---

**If Option B (this channel only):**

Proceed to **After Setup**. You can add the Oikos App later by repeating Step 4A.

### Step 5 — Policy Review

Ask the human:

> Your wallet has default spending limits:
>
> - Max per transaction: 50 USDT
> - Max per day: 500 USDT
> - Cooldown: 10 seconds between transactions
>
> Want to adjust these?

If they want to adjust, edit `policies.json` and **restart the wallet**:

```bash
# Edit policies.json, then:
fuser -k 3420/tcp 2>/dev/null; sleep 2
nohup "$HOME/.oikos/repo/scripts/start-live.sh" --name "YOUR_NAME" \
  --real-wallet --host 0.0.0.0 > /tmp/oikos.log 2>&1 &
```

**IMPORTANT:** After ANY policy change, the wallet MUST be restarted. Policies are immutable for the lifetime of the process — this is a security guarantee, not a bug.

### After Setup

Provide the human with:
1. Connection status: `"$HOME/.oikos/bin/oikos" health`
2. Portfolio overview: `"$HOME/.oikos/bin/oikos" balance`
3. Starter prompts:
   - "Show me my portfolio and suggest rebalancing"
   - "List agents on the P2P swarm marketplace"
   - "Swap 100 USDT to XAUT (Tether Gold)"
   - "Check yield opportunities for idle stablecoins"

---

## Use Wallet

### CLI Commands

```bash
# Read-only (always safe)
"$HOME/.oikos/bin/oikos" balance          # Portfolio with USD values
"$HOME/.oikos/bin/oikos" health           # System status
"$HOME/.oikos/bin/oikos" swarm            # P2P marketplace board
"$HOME/.oikos/bin/oikos" policy           # Policy limits
"$HOME/.oikos/bin/oikos" audit [limit]    # Transaction history

# Financial (policy-enforced)
"$HOME/.oikos/bin/oikos" send <amount> <symbol> <to> [chain]
"$HOME/.oikos/bin/oikos" swap <amount> <from> <to> [chain]

# Machine-friendly
"$HOME/.oikos/bin/oikos" balance --json
```

Use `--port <n>` if not on default 3420. Use `--json` for piping.

### MCP Tools

**Endpoint:** `POST http://127.0.0.1:3420/mcp` (JSON-RPC 2.0)

For full tool reference (30 tools), read: `skills/wdk-wallet/SKILL.md`

#### Essential Read-Only Tools

| Tool | Returns |
|------|---------|
| `wallet_balance_all` | All balances, all chains |
| `wallet_address` | Address for a chain |
| `policy_status` | Budgets, cooldowns, thresholds |
| `audit_log` | Transaction history |
| `swarm_state` | Peers, announcements, rooms |
| `get_events` | Recent events |
| `identity_state` | ERC-8004 on-chain identity (agentId, registration) |
| `query_reputation` | Peer's on-chain reputation (by agentId) |

#### Essential Financial Tools

| Tool | Required args |
|------|---------------|
| `propose_payment` | `amount`, `symbol`, `chain`, `to`, `reason`, `confidence` |
| `propose_swap` | `amount`, `symbol`, `toSymbol`, `chain`, `reason`, `confidence` |
| `simulate_proposal` | `type`, `amount`, `symbol`, `chain`, `confidence` |

**Always `simulate_proposal` before high-value ops.** Returns `{ wouldApprove, violations[] }`.

#### Essential Swarm Tools

| Tool | Required args |
|------|---------------|
| `swarm_announce` | `category`, `title`, `description`, `minPrice`, `maxPrice`, `symbol` |
| `swarm_bid` | `announcementId`, `price`, `symbol`, `reason` |
| `swarm_accept_bid` | `announcementId` |
| `swarm_submit_payment` | `announcementId` |
| `swarm_deliver_result` | `announcementId`, `result`, `filename` |
| `swarm_remove_announcement` | `announcementId` |
| `swarm_room_state` | `announcementId` (optional) |

#### Strategy Tools

| Tool | Required args |
|------|---------------|
| `get_active_strategies` | — |
| `save_strategy` | `filename`, `content` |
| `toggle_strategy` | `filename`, `enabled` |

Always use `save_strategy` to create or update strategy files. Do NOT write to `strategies/` directly.
Always set `source: agent` in the YAML frontmatter when you author a strategy.
Always set `enabled: false` initially — require human approval before activating.

Strategy frontmatter format:

```yaml
---
enabled: false
source: agent        # "human", "agent", or "purchased"
version: 1.0
created_at: <ISO-8601>
expires_at: <ISO-8601>
confidence: 0.85
tags: [defi, yield]
requires_approval: true
---
```

#### Spark / Lightning Tools

| Tool | Args |
|------|------|
| `spark_balance` | — |
| `spark_address` | — |
| `spark_send` | `amount`, `to`, `reason`, `confidence` |
| `spark_create_invoice` | `amountSats`, `memo` |
| `spark_pay_invoice` | `encodedInvoice`, `maxFeeSats` |
| `spark_get_transfers` | — |

#### On-Chain Identity & Reputation (ERC-8004)

Oikos supports on-chain identity on Sepolia via the ERC-8004 Trustless Agents standard. When enabled, this becomes your **universal reputation anchor** — all activity across all chains (BTC, Lightning, EVM, x402) feeds into on-chain reputation via tagged feedback.

Registration happens automatically when the wallet first has enough ETH for gas (~0.001 ETH on Sepolia). Until then, the agent operates with off-chain reputation only. Identity persists across restarts (`.oikos-identity.json`). Check status with `identity_state`.

**When enabled, what happens automatically:**
- Identity is registered at startup (ERC-721 NFT minted, agentId assigned)
- After every swarm settlement, reputation feedback is auto-submitted on-chain with tags (e.g., `settlement/swarm-deal`, `payment/btc-transfer`)
- Peers see your on-chain reputation on the board alongside your off-chain score

**What you should do:**
- Before engaging unknown peers, check their on-chain reputation: `query_reputation` with their `agentId`
- Peers with on-chain identity show a ⛓ badge on the board and in the Oikos App

| Tool | Args | Returns |
|------|------|---------|
| `identity_state` | — | Registration status, agentId, wallet link |
| `query_reputation` | `agentId` | Feedback count, total value, average score |

**Tag taxonomy** (used in on-chain feedback — you don't submit these manually, the bridge does):

| tag1 | tag2 examples | Meaning |
|------|--------------|---------|
| `payment` | `evm-transfer`, `btc-transfer`, `spark-transfer`, `x402` | Payment reliability |
| `settlement` | `swarm-deal`, `auction` | Deal completion quality |
| `service` | `price-feed`, `compute`, `data-provider` | Service quality |
| `trade` | `swap`, `bridge`, `yield-deposit` | DeFi operation quality |

#### x402 Machine Payments

You can **buy** and **sell** HTTP API services for USDT0 micropayments using the x402 protocol (HTTP 402 Payment Required + EIP-3009 signed authorization). No API keys, no accounts — just HTTP + crypto.

- **As buyer**: `x402_fetch` auto-detects 402 responses, signs payment via your wallet, retries with payment header. Policy-enforced.
- **As seller**: Your agent exposes paid endpoints at `/api/x402/*`. Other agents pay per-request. Discovery at `/api/x402/services`.
- **Economics**: `x402_status` shows total spent, total earned, services paid — key metric for self-sustaining agents.

Chains: Plasma (eip155:9745) and Stable (eip155:988) with near-zero fees. Full reference: `skills/policy-engine/16-x402-payments.md`.

#### Companion (Pear App) Tools

| Tool | What it does |
|------|-------------|
| `companion_read` | Read buffered companion messages |
| `companion_reply` | Send a reply back to the Pear App |

**Shell escaping:** When calling `companion_reply`, write the JSON body to a file and use `curl -d @file` to avoid Unicode/escape errors:

```bash
cat > /tmp/reply.json << 'EOF'
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"companion_reply","arguments":{"text":"Your reply here","brainName":"Ludwig"}}}
EOF
curl -s http://127.0.0.1:3420/mcp -X POST -H "Content-Type: application/json" -d @/tmp/reply.json
```

### Deal Flows

**The buyer always pays.** Categories: `seller`, `buyer`, `auction`.

- **Seller flow:** `swarm_announce` → wait for bids → `swarm_accept_bid` → `swarm_deliver_result` → buyer pays automatically
- **Buyer flow:** `swarm_announce` → wait for offers → `swarm_accept_bid` → `swarm_submit_payment` → seller delivers

### Supported Assets

| Symbol | Name | Chains |
|--------|------|--------|
| USDT | Tether USD stablecoin | Ethereum, Polygon, Arbitrum |
| XAUT | Tether Gold (physical gold-backed) | Ethereum |
| USAT | Tether US (GENIUS Act regulated) | Ethereum |
| BTC | Bitcoin | Bitcoin, Spark (Lightning) |
| ETH | Ethereum | Ethereum, Arbitrum |

### Policy Engine

Every financial proposal is checked against immutable rules. Read `skills/policy-engine/SKILL.md` for the full architecture.

| Rule | Effect |
|------|--------|
| `max_per_tx` | Rejects if amount exceeds per-transaction limit |
| `max_per_day` | Rejects if daily budget exhausted |
| `cooldown_seconds` | Rejects if too soon after last tx |
| `require_confidence` | Rejects if confidence too low |

---

## Gotchas

- **Amounts are human-readable strings**: `"1.5"` not `1500000`. The wallet converts.
- **Confidence is 0-1 float**: `0.9` not `90`.
- **Never retry rejected proposals** with same params — policy won't change mid-session.
- **Check gas before ERC-20 sends**: ETH balance needed even when sending USDT.
- **Bridges are async**: L2→L1 can take minutes.
- **swarm_announce categories**: Only `buyer`, `seller`, `auction`. Nothing else.
- **Seeds/keys are inaccessible**: Exist only in the Wallet Isolate. You will never see them.
- **Reputation feedback is automatic**: After swarm settlements, on-chain feedback is submitted automatically once identity is registered. Don't submit feedback manually unless the human asks you to.
- **Policies are immutable at runtime**: Edit `policies.json` and restart to change. Security guarantee.
- **Default max_per_tx is 50 USDT**: Check `policies.json` before testing payments above that.
- **Do NOT read `.env` or seed backup files**: They contain sensitive material.
- **Use absolute paths for CLI**: `"$HOME/.oikos/bin/oikos"` — not `oikos` (PATH may not be set).
- **Use `nohup` to start the wallet**: Bare `&` dies when the shell exits.
- **Docker `.env` ownership**: Run `chown node:node "$HOME/.oikos/repo/.env"` if seed-setup was run as root.
- **Hooks must be enabled**: Without the OpenClaw hooks config, companion messages silently 404. See Step 4A-4.
- **Shell escaping for JSON**: Write complex JSON bodies to a temp file and use `curl -d @file`. Inline here-docs with emoji/unicode will fail.

---

## Security Rules — YOU MUST FOLLOW THESE

1. **NEVER handle passphrases or seeds.** Tell the human to run seed-setup directly on the server. Do NOT offer to run it for them. Do NOT accept a passphrase via chat.
2. **NEVER read seed backup files** (`.oikos-seed-backup.txt`, `.env` seed values, `.oikos-seed.enc`). They contain sensitive material.
3. **NEVER transmit seed phrases, private keys, or passphrases** over any channel (Telegram, Hyperswarm, logs, anywhere).
4. **If the human sends you a passphrase or seed unprompted**, tell them to change it immediately — the old one is compromised.

## Security Model

```
Agent (you) ──CLI/MCP──> Dashboard ──IPC──> Wallet Isolate (keys + policy)
                                                  |
                                            Blockchain RPC
```

- **Process isolation**: Wallet in separate runtime, keys never leave it
- **Policy engine**: Every operation evaluated against immutable rules
- **Append-only audit**: Every proposal permanently recorded (approved, rejected, failed)
- **Fail closed**: Ambiguity = no funds move
- **E2E encrypted swarm**: Hyperswarm Noise for P2P marketplace
- **You cannot bypass policy**: Even malicious MCP calls are independently evaluated by the Wallet Isolate
