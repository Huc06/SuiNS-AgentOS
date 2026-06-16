# DeFi Portfolio Rebalancer — AgentOS Skill Example

A fully autonomous trading agent skill for Sui, built with Suiperpower and publishable via AgentOS.

## Structure

```
sources/             Move smart contract (portfolio + trade management)
scripts/             TypeScript demo and agent runner
skill.manifest.json  AgentOS skill manifest (sui-agent-skill/v1)
Move.toml            Sui Move package manifest
```

## Features

- **Spending limits**: per-trade and daily caps enforced on-chain
- **Hybrid control**: agent proposes, user approves large trades
- **Kill switch**: user can deactivate portfolio at any time
- **Audit trail**: all trades emitted as Sui events
- **AgentOS integration**: publishable as a discoverable skill via SuiNS

## Usage with AgentOS

```bash
# 1. Deploy the Move package
cd examples/defi-rebalancer
sui client publish --gas-budget 200000000

# 2. Publish the skill manifest to Walrus + on-chain
agentos skill publish ./skill.manifest.json --agent my-first-agent.sui

# 3. Another agent can now discover and use this skill
agentos skill resolve defi-rebalancer.my-first-agent.sui --manifest
```

## Built with

- [Suiperpower](https://suiperpower.dev) — Move development + deployment
- [SuiNS AgentOS](https://github.com/Huc06/SuiNS-AgentOS) — Skill registry + discovery
