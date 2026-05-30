# SuiNS AgentOS

Sui-native identity, wallet, skill discovery, and delegation layer for AI agents.

[![CI](https://github.com/Huc06/SuiNS-AgentOS/actions/workflows/ci.yml/badge.svg)](https://github.com/Huc06/SuiNS-AgentOS/actions/workflows/ci.yml)

## Monorepo

| Package | Description |
|---------|-------------|
| `packages/contracts` | Move 2024 on-chain types — AgentPassport, SkillDescriptor, BucketPolicy |
| `packages/sdk` | TypeScript SDK (`agentOS()` client extension for `@mysten/sui`) |
| `packages/cli` | `agentos` CLI — agent, skill, bucket commands |
| `packages/frontend` | Next.js app — agent explorer and creation flows |

## Prerequisites

- Node.js 20
- pnpm 10
- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) ≥ 1.70

## Development

```bash
pnpm install
pnpm build          # sdk → cli + frontend
pnpm test           # SDK unit tests
pnpm contracts:test # Move unit tests
pnpm dev            # watch mode (sdk + frontend)
```

## CI / CD

- **CI** (`ci.yml`) — runs on every push/PR to `main`: `pnpm build`, `pnpm test`, `pnpm lint`, `sui move test`
- **CD** (`cd.yml`) — manual or on GitHub Release:
  - `contracts-testnet` — publish Move package (requires `SUI_PRIVATE_KEY`, `SUI_RPC_URL` secrets)
  - `frontend-build` — upload Next.js build artifact

Configure GitHub Environment `testnet` with secrets before contract deploy.

## Roadmap

Track implementation progress via [GitHub Issues](https://github.com/Huc06/SuiNS-AgentOS/issues).
