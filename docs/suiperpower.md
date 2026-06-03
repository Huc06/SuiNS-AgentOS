# Suiperpower + AgentOS

**Suiperpower** owns the build lane ([suiperpower.dev](https://www.suiperpower.dev/) — `/suiper:validate-idea`, `build-with-move`, `deploy-to-testnet`, `verify-against-intent`).

**AgentOS** owns register + discover — **no separate Cursor skill pack**. Reuse Suiperpower in the IDE; bind on-chain identity via CLI or MCP.

## Flow

```
Suiperpower (skills)  →  deploy / verify
        ↓
agentos init          →  .agentos/registry.json
        ↓
agentos agent create / skill publish   OR   MCP tools (agentos_register_agent, …)
        ↓
Dashboard /api/resolve  →  MVR-style viewer
```

## CLI (terminal or agent tool shell)

```bash
agentos init
# … after Suiperpower deploy …
agentos agent create my-agent.sui --wallet 0xYOUR_ADDRESS
agentos skill publish ./examples/skill.manifest.json --agent my-agent.sui
```

## MCP (same session as Suiperpower)

Add to `.cursor/mcp.json`:

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

Tools: `agentos_resolve`, `agentos_register_agent`, `agentos_publish_skill`, `agentos_list_skills`, `agentos_dashboard_url`.

The coding agent continues using **Suiperpower** for Move; when the user asks to register the agent, it calls **AgentOS MCP** or suggests the CLI commands above — no `skills/agentos/` rules required.
