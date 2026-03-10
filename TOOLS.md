# TOOLS.md - Oikos Wallet Tools

The Oikos wallet is running locally. Use the `exec` tool with `curl` to interact with it.

## Quick Reference (REST API — use for reads)

| Command | What it does |
|---------|-------------|
| `curl -s http://127.0.0.1:3420/api/balances` | All wallet balances |
| `curl -s http://127.0.0.1:3420/api/health` | Wallet health check |
| `curl -s http://127.0.0.1:3420/api/policies` | Policy status (budgets, cooldowns) |
| `curl -s http://127.0.0.1:3420/api/valuation` | Portfolio USD valuation |
| `curl -s http://127.0.0.1:3420/api/prices` | Live asset prices |
| `curl -s http://127.0.0.1:3420/api/addresses` | Wallet addresses |
| `curl -s http://127.0.0.1:3420/api/swarm` | Swarm peers and rooms |
| `curl -s http://127.0.0.1:3420/api/audit?limit=10` | Recent transactions |
| `curl -s http://127.0.0.1:3420/api/economics` | Revenue/costs |
| `curl -s http://127.0.0.1:3420/api/identity` | ERC-8004 identity |

## Proposals (MCP JSON-RPC — use for writes)

Payment: `curl -s -X POST http://127.0.0.1:3420/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"propose_payment","arguments":{"amount":"1000000","symbol":"USDT","chain":"ethereum","to":"0xADDR","reason":"Why","confidence":0.85}}}'`

Swap: `curl -s -X POST http://127.0.0.1:3420/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"propose_swap","arguments":{"amount":"5000000","symbol":"USDT","toSymbol":"XAUT","chain":"ethereum","reason":"Rebalance","confidence":0.85}}}'`
