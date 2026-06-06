# Suiperpower + AgentOS

**Suiperpower** — build lane ([suiperpower.dev](https://www.suiperpower.dev/)): `build-with-move`, `deploy-to-testnet`, `verify-against-intent`.

**AgentOS** — register + discover. Không skill pack riêng trong repo; dùng CLI hoặc MCP.

Docs: [README](./README.md) · UX tạo agent: [create-agent-ux.md](./create-agent-ux.md) · Pipeline: [post-suiperpower-flow.md](./post-suiperpower-flow.md).

---

## Flow tổng quát

```
Suiperpower (terminal)     →  Move deploy, skill manifest
        ↓
agentos init               →  .agentos/config.json + registry
        ↓
Web /create (browser)      →  SuiNS bind + mint passport + registry
        ↓
agentos skill publish      →  registry (+ Walrus / on-chain sau)
        ↓
Dashboard /api/resolve     →  discover
```

**SuiNS không làm trong terminal** — Claude Code / MCP in link web:  
`{dashboardUrl}/create?bind=suins&runtime=0x…` — chi tiết [create-agent-ux.md](./create-agent-ux.md).

---

## CLI

```bash
agentos init
# Sau Suiperpower deploy + cấu hình packageId:
agentos skill publish ./examples/skill.manifest.json --agent my-agent.sui
agentos agent resolve my-agent.sui
```

Tạo agent + gắn SuiNS: **web** `/create`. CLI `agent create` dùng cho script/dev khi đã có name + wallet.

---

## MCP

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agentos": {
      "command": "npx",
      "args": ["-y", "@agentos/mcp"],
      "env": { "AGENTOS_REGISTRY_PATH": ".agentos/registry.json" }
    }
  }
}
```

| Tool | Khi nào |
|------|---------|
| `agentos_resolve` | Sau user bind trên web |
| `agentos_dashboard_url` | Link `/agent/{slug}` |
| `agentos_publish_skill` | Sau build skill |
| `agentos_register_agent` | Dev/metadata — **không** thay SuiNS bind trên web |

Agent dùng **Suiperpower** cho Move; khi cần identity, mở **dashboard** (không chỉ `register_agent` trong terminal).
