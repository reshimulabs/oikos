#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# test-mcp.sh — MCP endpoint smoke test for Oikos Protocol
#
# Tests all 14 MCP tools + lifecycle methods against a running
# Oikos instance. Assumes the dashboard is running on localhost.
#
# Usage:
#   ./scripts/test-mcp.sh              # default port 3420
#   ./scripts/test-mcp.sh 3421         # custom port
#
# Prerequisites:
#   npm run demo   (in another terminal)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

PORT="${1:-3420}"
BASE="http://127.0.0.1:${PORT}"
MCP="${BASE}/mcp"
PASS=0
FAIL=0
TOTAL=0

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Helpers ──

rpc() {
  local method="$1"
  local params="${2:-{}}"
  local id="${3:-$TOTAL}"
  curl -s -X POST "${MCP}" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":${id},\"method\":\"${method}\",\"params\":${params}}"
}

tool_call() {
  local name="$1"
  local args="${2:-{}}"
  local id="${TOTAL}"
  curl -s -X POST "${MCP}" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":${id},\"method\":\"tools/call\",\"params\":{\"name\":\"${name}\",\"arguments\":${args}}}"
}

check() {
  local label="$1"
  local response="$2"
  local expect_field="${3:-result}"
  TOTAL=$((TOTAL + 1))

  if echo "$response" | grep -q "\"${expect_field}\""; then
    PASS=$((PASS + 1))
    printf "  ${GREEN}✔${NC} %s\n" "$label"
  else
    FAIL=$((FAIL + 1))
    printf "  ${RED}✘${NC} %s\n" "$label"
    printf "    ${RED}Response: %s${NC}\n" "$(echo "$response" | head -c 200)"
  fi
}

check_no_error() {
  local label="$1"
  local response="$2"
  TOTAL=$((TOTAL + 1))

  if echo "$response" | grep -q '"error"'; then
    FAIL=$((FAIL + 1))
    printf "  ${RED}✘${NC} %s\n" "$label"
    printf "    ${RED}Error: %s${NC}\n" "$(echo "$response" | grep -o '"message":"[^"]*"' | head -1)"
  else
    PASS=$((PASS + 1))
    printf "  ${GREEN}✔${NC} %s\n" "$label"
  fi
}

# ── Pre-flight ──

printf "\n${CYAN}╔══════════════════════════════════════════════╗${NC}\n"
printf "${CYAN}║   Oikos Protocol — MCP Smoke Test            ║${NC}\n"
printf "${CYAN}╚══════════════════════════════════════════════╝${NC}\n\n"

printf "${YELLOW}Target:${NC} ${MCP}\n\n"

# Check server is up
if ! curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/health" | grep -q "200"; then
  printf "${RED}ERROR: Oikos dashboard not running on port ${PORT}${NC}\n"
  printf "Start it first:  npm run demo\n"
  exit 1
fi
printf "${GREEN}Server is running.${NC}\n\n"

# ── 1. MCP Lifecycle ──

printf "${CYAN}▸ MCP Lifecycle${NC}\n"

resp=$(rpc "initialize")
check "initialize → protocolVersion" "$resp" "protocolVersion"

resp=$(rpc "tools/list")
check "tools/list → returns tools array" "$resp" "tools"
tool_count=$(echo "$resp" | grep -o '"name"' | wc -l | tr -d ' ')
printf "    (${tool_count} tools registered)\n"

resp=$(rpc "notifications/initialized")
check "notifications/initialized → acknowledged" "$resp" "result"

# ── 2. Query Tools (read-only, safe) ──

printf "\n${CYAN}▸ Query Tools (read-only)${NC}\n"

resp=$(tool_call "wallet_balance_all")
check_no_error "wallet_balance_all" "$resp"

resp=$(tool_call "wallet_balance" '{"chain":"ethereum","symbol":"USDT"}')
check_no_error "wallet_balance (ETH/USDT)" "$resp"

resp=$(tool_call "wallet_address" '{"chain":"ethereum"}')
check_no_error "wallet_address (ethereum)" "$resp"

resp=$(tool_call "wallet_address" '{"chain":"bitcoin"}')
check_no_error "wallet_address (bitcoin)" "$resp"

resp=$(tool_call "policy_status")
check_no_error "policy_status" "$resp"

resp=$(tool_call "audit_log" '{"limit":5}')
check_no_error "audit_log (limit=5)" "$resp"

resp=$(tool_call "agent_state")
check_no_error "agent_state" "$resp"

resp=$(tool_call "swarm_state")
check_no_error "swarm_state" "$resp"

resp=$(tool_call "identity_state")
check_no_error "identity_state" "$resp"

# ── 3. Proposal Tools (write — go through PolicyEngine) ──

printf "\n${CYAN}▸ Proposal Tools (write, policy-enforced)${NC}\n"

resp=$(tool_call "propose_payment" '{"amount":"1000000","symbol":"USDT","chain":"ethereum","to":"0x1234567890abcdef1234567890abcdef12345678","reason":"MCP smoke test payment","confidence":0.9}')
check_no_error "propose_payment (USDT)" "$resp"

resp=$(tool_call "propose_swap" '{"amount":"500000","symbol":"USDT","toSymbol":"XAUT","chain":"ethereum","reason":"MCP smoke test swap","confidence":0.85}')
check_no_error "propose_swap (USDT→XAUT)" "$resp"

resp=$(tool_call "propose_bridge" '{"amount":"1000000","symbol":"USDT","fromChain":"ethereum","toChain":"arbitrum","reason":"MCP smoke test bridge","confidence":0.9}')
check_no_error "propose_bridge (ETH→ARB)" "$resp"

resp=$(tool_call "propose_yield" '{"amount":"2000000","symbol":"USDT","chain":"ethereum","protocol":"aave-v3","action":"deposit","reason":"MCP smoke test yield","confidence":0.8}')
check_no_error "propose_yield (USDT deposit)" "$resp"

# ── 4. Swarm Tools ──

printf "\n${CYAN}▸ Swarm Tools${NC}\n"

resp=$(tool_call "swarm_announce" '{"category":"service","title":"MCP Test Service","description":"Smoke test announcement","minPrice":"100000","maxPrice":"500000","symbol":"USDT"}')
check_no_error "swarm_announce (service)" "$resp"

# ── 5. Reputation Tools ──

printf "\n${CYAN}▸ Reputation Tools${NC}\n"

resp=$(tool_call "query_reputation" '{"agentId":"1"}')
check_no_error "query_reputation (agentId=1)" "$resp"

# ── 6. Error Handling ──

printf "\n${CYAN}▸ Error Handling${NC}\n"

resp=$(rpc "nonexistent/method")
check "unknown method → returns error" "$resp" "error"

resp=$(tool_call "fake_tool_that_doesnt_exist")
check "unknown tool → returns error" "$resp" "error"

resp=$(curl -s -X POST "${MCP}" -H "Content-Type: application/json" -d '{"bad":"request"}')
check "malformed JSON-RPC → returns error" "$resp" "error"

# ── 7. Dashboard REST API (bonus) ──

printf "\n${CYAN}▸ Dashboard REST API${NC}\n"

for endpoint in health state balances addresses policies audit swarm economics identity prices valuation "reputation/onchain" "prices/history/BTC"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/${endpoint}")
  TOTAL=$((TOTAL + 1))
  if [ "$code" = "200" ]; then
    PASS=$((PASS + 1))
    printf "  ${GREEN}✔${NC} GET /api/%s → %s\n" "$endpoint" "$code"
  else
    FAIL=$((FAIL + 1))
    printf "  ${RED}✘${NC} GET /api/%s → %s\n" "$endpoint" "$code"
  fi
done

# Agent card
code=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/agent-card.json")
TOTAL=$((TOTAL + 1))
if [ "$code" = "200" ]; then
  PASS=$((PASS + 1))
  printf "  ${GREEN}✔${NC} GET /agent-card.json → %s\n" "$code"
else
  FAIL=$((FAIL + 1))
  printf "  ${RED}✘${NC} GET /agent-card.json → %s\n" "$code"
fi

# ── Summary ──

printf "\n${CYAN}══════════════════════════════════════════════${NC}\n"
if [ "$FAIL" -eq 0 ]; then
  printf "${GREEN}  ALL PASSED: ${PASS}/${TOTAL} tests ✔${NC}\n"
else
  printf "${RED}  FAILED: ${FAIL}/${TOTAL} tests ✘${NC}\n"
  printf "${GREEN}  PASSED: ${PASS}/${TOTAL}${NC}\n"
fi
printf "${CYAN}══════════════════════════════════════════════${NC}\n\n"

exit "$FAIL"
