# AgentOS docs

| Doc | Contents |
|-----|----------|
| [post-suiperpower-flow.md](./post-suiperpower-flow.md) | **Full pipeline** — Suiperpower ↔ AgentOS, publish, CLI/MCP, MVR, Walrus |
| [create-agent-ux.md](./create-agent-ux.md) | **Create agent + SuiNS UX** — two paths, terminal→web, two wallets |
| [setup-env-auth-deploy.md](./setup-env-auth-deploy.md) | Enoki, Google OAuth, Cloudflare, GitHub secrets |
| [storage-adapter.md](./storage-adapter.md) | **Pluggable persistence** — the registry/runs data-loss fix, `RegistryStore`/`RunsStore`, file/memory/DB backends, `STORAGE_BACKEND`, SQL schema, wiring Vercel Postgres / CF D1 |
| [cloudflare-deploy-plan.md](./cloudflare-deploy-plan.md) | Deploy the frontend to Cloudflare Workers (D1 storage, bindings, phased rollout) |

**Read by role**

- **Product / UX** → [create-agent-ux.md](./create-agent-ux.md)
- **Dev after Suiperpower** → [post-suiperpower-flow.md](./post-suiperpower-flow.md)
- **Ops / deploy** → [setup-env-auth-deploy.md](./setup-env-auth-deploy.md)
- **Persistence / DB migration** → [storage-adapter.md](./storage-adapter.md), [cloudflare-deploy-plan.md](./cloudflare-deploy-plan.md)
