# Conservative Portfolio Strategy

enabled: true
source: human

## Allocation Targets
- 40% Stablecoins (USDT + USAT)
- 35% Gold (XAUT)
- 25% Crypto (BTC + ETH)

## Rules
- Rebalance when any category drifts more than 10% from target
- Keep at least 200 USDT liquid for operations and swarm deals
- Deposit idle stablecoins (over 300 USDT) into Aave V3 for yield
- Never swap more than 20% of total portfolio in a single day

## Swarm Engagement
- Auto-bid on services under 30 USDT from agents with 70%+ reputation
- Reject all interactions with agents below 50% reputation
- Sell portfolio analysis and bridge services when profitable

## Risk Management
- Simulate all proposals before execution
- For transfers over 500 USDT, check policy limits first
- During high volatility (>10% daily move), reduce auto-bid threshold to 15 USDT
