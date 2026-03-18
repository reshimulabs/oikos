# BUILD-LOG-2.md — Oikos Protocol (continued from BUILD-LOG.md)

> BUILD-LOG.md reached 2552 lines. This file continues from 2026-03-18.
> Previous log covers: project setup, architecture, WDK integration, IPC protocol,
> policy engine, swarm coordinator, companion channel, dashboard, Pear app v1,
> Ollama optimization, MCP bridges, VPS deployment, market tab.

---

## 2026-03-18 — QVAC Integration + LoRA Fine-Tuning + UI Refactor Phase 2

### QVAC Fabric (Tether's LLM Engine)
- Downloaded QVAC Fabric pre-built binaries (b7336) for macOS ARM64
- Tested llama-server with Qwen3 8B GGUF — **41.8 tok/s on M4 Pro** (20% faster than Ollama)
- OpenAI-compatible `/v1/chat/completions` confirmed working
- `/no_think` in system prompt disables Qwen3 thinking mode
- **Swap is one env var**: `LLM_BASE_URL=http://localhost:8090/v1`
- BitNet 1B TQ2_0 model downloaded and tested for inference (works)
- `llama-finetune-lora` crashes on both Q4_K_M and TQ2_0 backward pass — `ggml_build_backward_expand` SIGABRT. Posted to QVAC Discord.

### LoRA Fine-Tuning (Unsloth on Colab)
- Built training dataset: `training/oikos-finetune.jsonl` — **204 examples**
- Coverage: wallet ops, DeFi, swarm marketplace, autonomous events, policy conflicts, scam detection, failure recovery, file exchange, portfolio strategies
- Reviewed by Nemotron 3 Super and Gemini 2.5 Pro — both approved with enhancement suggestions (all implemented)
- Fine-tuned **Qwen3-1.7B** with Unsloth on Google Colab (free T4 GPU):
  - 15 epochs, LoRA rank 16, cosine LR schedule
  - Training loss: 5.53 → **0.044** (99.2% reduction)
  - Runtime: 9 minutes
  - Exported as GGUF: Q4_K_M (1.03 GB) and Q8_0 (~1.8 GB)
- Model name in GGUF metadata: "Oikos Agent Gguf"
- Tested all 6 critical scenarios: balance check, payment, knowledge, policy refusal, swarm announce, scam detection — **6/6 passed**
- Running on QVAC at ~100 tok/s — instant responses in Pear app

### UI Refactor Phase 2 (Pear App)
- **Tabs**: 7 → 4 (Feed, Wealth, Swarm, Policy Engine)
- **Feed**: Status strip + activity stream from audit/swarm events + [Activity]/[Audit Trail] toggle
- **Wealth**: Pie chart + holdings + recent transactions + live prices (Bitfinex)
- **Swarm**: KPI strip + search + tag cloud + full-width announcement board (gateway-style)
- **Policy Engine** tab (NEW):
  - Guardrails: budget bars (daily/session) + compact rules one-liner + Edit modal
  - Strategies: list with source badges (Human/Purchased/Agent), enable/disable, edit
  - Capabilities: collapsible WDK modules (13 skills)
  - Policy edit writes to `policies.json` and signals wallet restart
  - Strategies saved to `/strategies/*.md`, loaded by brain on every chat
- **Chat**: markdown rendering, two-pass interpretation (ACTION → execute → LLM explains result)
- **Bottom bar**: Reshimu Labs logo, clock, settings gear (feather icon)
- **Chat echo bug fixed**: `chatMessageCount++` after optimistic append
- **Bare Runtime fetch bug fixed**: added `httpPost()` helper (Bare doesn't have global `fetch`)

### Remote MCP (Claude iOS)
- Cloudflare Tunnel deployed on VPS: `https://were-retailer-expect-charging.trycloudflare.com`
- Claude iOS connected via Settings → Connectors → Custom
- Full demo: posted BTC buy announcement from iPhone → Ludwig (OpenClaw) bid → settled
- Three brain tiers demonstrated: Ollama local, OpenClaw VPS, Claude iOS remote

### Architecture Decisions
- QVAC for inference, Unsloth for training (QVAC fine-tune binary broken in b7336)
- 1.7B specialist model > 8B generalist for wallet operations (speed + precision)
- Two-pass chat: model generates ACTION → Brain executes → model interprets result for human
- Strategy files as behavioral guidance injected into LLM context (not system prompt, not few-shot)
- Policy = LIMITS (Wallet Isolate, immutable), Strategy = GUIDANCE (Brain, flexible)

### Files Changed
- `oikos-wallet/src/brain/adapter.ts` — added activeStrategies to WalletContext, loads from /strategies/*.md
- `oikos-wallet/src/brain/actions.ts` — unchanged (ACTION parser)
- `oikos-wallet/src/dashboard/server.ts` — POST /api/policies, GET/POST /api/strategies, policy merge with config rules, two-pass interpretation
- `oikos-wallet/src/main.ts` — two-pass interpretation for companion channel
- `oikos-wallet/src/mcp/server.ts` — swarm_remove_announcement tool
- `oikos-wallet/src/config/env.ts` — path resolution from script location
- `index.html` — full UI refactor (Policy Engine tab, chat markdown, bottom bar)
- `app.js` — full JS refactor (feed, wealth pie chart, swarm board, policy engine, strategy edit)
- `index.js` — httpPost helper, policy/strategy proxy routes
- `training/oikos-finetune.jsonl` — 204 training examples
- `training/oikos_finetune_colab.ipynb` — Unsloth fine-tuning notebook
- `training/oikos-agent-q4.gguf` — fine-tuned model (Q4_K_M, 1.03 GB)
- `strategies/conservative-portfolio.md` — sample strategy file
- `scripts/mcp-bridge.mjs` — Claude Code MCP stdio proxy
- `scripts/claude-brain.mjs` — Claude API brain bridge
- `.mcp.json` — Claude Code MCP config
- `Modelfile` — Ollama custom model config

---

## NEXT: Tonight Session Plan

### 1. Strategy Marketplace (File Exchange)
- Wire `swarm_sell_strategy` flow: agent reads strategy .md → posts announcement → after payment, shares content in room
- Add protomux file transfer messages (FileTransfer, FileAck) to room channels
- For hackathon: simple base64 in JSON message (files are <5KB)

### 2. More Training Data
- DeFi protocol knowledge (Aave lending, Uniswap swaps, yield mechanics)
- Strategy marketplace examples (sell/buy/deliver skill files)
- Multi-step reasoning chains (check balance → check policy → execute → interpret)
- Live price awareness (agent checks prices before swaps)
- ~100 more examples → target 300+ total

### 3. Retrain Model
- Run Unsloth overnight with expanded dataset
- Try Qwen3-4B if Colab Pro available (better reasoning, still fast)
- Export Q4_K_M + Q8_0 for QVAC

### 4. Final Polish
- Wealth screen: maybe bring back the portfolio chart
- Feed screen: improve activity descriptions
- Demo video recording: 3 segments (QVAC local, OpenClaw swarm, Claude iOS)
