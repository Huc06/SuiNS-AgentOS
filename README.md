# SuiNS AgentOS

Sui-native identity, wallet, skill discovery, and delegation layer for AI agents.

[![CI](https://github.com/Huc06/SuiNS-AgentOS/actions/workflows/ci.yml/badge.svg)](https://github.com/Huc06/SuiNS-AgentOS/actions/workflows/ci.yml)

## Monorepo

| Package | Description |
|---------|-------------|
| `packages/contracts` | Move 2024 on-chain types — AgentPassport, SkillDescriptor, BucketPolicy |
| `packages/sdk` | TypeScript SDK (`agentOS()` client extension for `@mysten/sui`) |
| `packages/cli` | `agentos` CLI — init, agent, skill, bucket, `mcp` |
| `packages/mcp` | MCP server for Cursor / Claude Code / Codex |
| `packages/frontend` | Next.js app — agent explorer and creation flows (MVR-style dashboard) |

## Prerequisites

- Node.js 20
- pnpm 10
- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) ≥ 1.70

## Distribution (with [Suiperpower](https://www.suiperpower.dev/) — no extra skill pack)

Build with **Suiperpower** (`/suiper:*` in Claude Code, or bare names in Cursor). Register with **AgentOS** via CLI or MCP only:

```bash
agentos init
agentos agent create my-agent.sui --wallet 0xYOUR_ADDRESS
agentos skill publish ./examples/skill.manifest.json --agent my-agent.sui
```

In Cursor, add the `agentos` MCP server (`agentos init` prints the snippet) so the same agent can invoke `agentos_register_agent` after Suiperpower deploy — see [docs/suiperpower.md](./docs/suiperpower.md).

## Development

```bash
pnpm install
pnpm build          # sdk → mcp → cli → frontend
pnpm test           # SDK unit tests
pnpm contracts:test # Move unit tests
pnpm dev            # watch mode (sdk + frontend)
```

### Workspace registry (local core)

CLI, MCP, and the Next.js app share **`.agentos/registry.json`** at the repo root (see `.agentos/config.json.example`).

```bash
cp .agentos/config.json.example .agentos/config.json   # optional
pnpm --filter @agentos/frontend dev                     # http://localhost:3000
```

| Surface | Flow |
|---------|------|
| Dashboard `/create` | New Agent / Import Skill → writes registry |
| Explorer `/` | Resolve → `/agent/[slug]` |
| CLI | `agentos agent create`, `agentos skill publish`, `agentos agent list` |
| API | `GET/POST /api/agents`, `GET /api/resolve`, `POST /api/skills` |

Enoki sponsored mint is optional — set keys in `packages/frontend/.env.local` only when needed.

## CI / CD

- **CI** (`ci.yml`) — runs on every push/PR to `main`: `pnpm build`, `pnpm test`, `pnpm lint`, `sui move test`
- **CD** (`cd.yml`) — manual or on GitHub Release:
  - `contracts-testnet` — publish Move package (requires `SUI_PRIVATE_KEY`, `SUI_RPC_URL` secrets)
  - `frontend-build` — upload Next.js build artifact

Configure GitHub Environment `testnet` with secrets before contract deploy.

## Contributing

`main` is protected — all changes must go through a **Pull Request**. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Roadmap

Track implementation progress via [GitHub Issues](https://github.com/Huc06/SuiNS-AgentOS/issues).
