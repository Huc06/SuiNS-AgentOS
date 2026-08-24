# @agentos-sui/mcp

MCP server for **SuiNS AgentOS** — exposes agent identity, skill publishing, and on-chain execution as tools for Cursor, Claude Code, Kiro, and any MCP-compatible AI assistant.

[![npm](https://img.shields.io/npm/v/@agentos-sui/mcp)](https://www.npmjs.com/package/@agentos-sui/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)

---

## What it does

Your AI assistant can:
- Resolve any `.sui` agent name to its passport, wallet, and skills
- Publish skills to Walrus and mint SkillDescriptors on-chain
- Execute skills on Sui testnet via gasless PTBs
- Import skill manifests from a local file
- Open the AgentOS dashboard for wallet-based flows

---

## Quick start (2 minutes)

### 1 — Create `.agentos/config.json` in your project root

```json
{
  "network": "testnet",
  "rpcUrl": "https://sui-testnet-rpc.publicnode.com",
  "packageId": "0xde2423929ae03dd7620744bd23e059fc77f8198941a5d9a5be595559c6eba699",
  "dashboardUrl": "https://sui-ns-agent-os-frontend.vercel.app"
}
```

> The registry auto-loads from `.agentos/registry.json` in the same directory. If you don't have one, the server starts in read-only mode (resolve + list only).

### 2 — Add to your AI assistant (pick one below)

---

## Cursor

Create or edit `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agentos": {
      "command": "npx",
      "args": ["-y", "@agentos-sui/mcp"],
      "env": {
        "AGENTOS_PACKAGE_ID": "0xde2423929ae03dd7620744bd23e059fc77f8198941a5d9a5be595559c6eba699",
        "SUI_RPC_URL": "https://sui-testnet-rpc.publicnode.com",
        "SUI_PRIVATE_KEY": "YOUR_SUI_PRIVATE_KEY"
      }
    }
  }
}
```

Restart Cursor → the `agentos_*` tools appear in the MCP panel.

---

## Claude Code

```bash
claude mcp add agentos \
  -e AGENTOS_PACKAGE_ID=0xde2423929ae03dd7620744bd23e059fc77f8198941a5d9a5be595559c6eba699 \
  -e SUI_RPC_URL=https://sui-testnet-rpc.publicnode.com \
  -e SUI_PRIVATE_KEY=YOUR_SUI_PRIVATE_KEY \
  -- npx -y @agentos-sui/mcp
```

Or add manually to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentos": {
      "command": "npx",
      "args": ["-y", "@agentos-sui/mcp"],
      "env": {
        "AGENTOS_PACKAGE_ID": "0xde2423929ae03dd7620744bd23e059fc77f8198941a5d9a5be595559c6eba699",
        "SUI_RPC_URL": "https://sui-testnet-rpc.publicnode.com",
        "SUI_PRIVATE_KEY": "YOUR_SUI_PRIVATE_KEY"
      }
    }
  }
}
```

---

## Kiro

Create or edit `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "agentos": {
      "command": "npx",
      "args": ["-y", "@agentos-sui/mcp"],
      "env": {
        "AGENTOS_PACKAGE_ID": "0xde2423929ae03dd7620744bd23e059fc77f8198941a5d9a5be595559c6eba699",
        "SUI_RPC_URL": "https://sui-testnet-rpc.publicnode.com",
        "SUI_PRIVATE_KEY": "YOUR_SUI_PRIVATE_KEY"
      }
    }
  }
}
```

---

## Using a local build (monorepo / development)

Replace `npx -y @agentos-sui/mcp` with the built binary:

```json
{
  "mcpServers": {
    "agentos": {
      "command": "node",
      "args": ["/absolute/path/to/AgentOS/packages/mcp/dist/index.js"],
      "env": {
        "AGENTOS_PACKAGE_ID": "0xde2423929ae03dd7620744bd23e059fc77f8198941a5d9a5be595559c6eba699",
        "SUI_RPC_URL": "https://sui-testnet-rpc.publicnode.com",
        "SUI_PRIVATE_KEY": "YOUR_SUI_PRIVATE_KEY"
      }
    }
  }
}
```

Build first: `pnpm --filter @agentos-sui/mcp build`

---

## Environment variables

| Variable                  | Required for        | Notes                                              |
| ------------------------- | ------------------- | -------------------------------------------------- |
| `AGENTOS_PACKAGE_ID`      | everything          | On-chain package address                           |
| `SUI_RPC_URL`             | all RPC calls       | Default: `https://sui-testnet-rpc.publicnode.com`  |
| `SUI_PRIVATE_KEY`         | write operations    | Bech32 (`suiprivkey1…`) or hex. Omit for read-only / demo mode |
| `AGENTOS_REGISTRY_PATH`   | custom registry     | Default: `.agentos/registry.json` in working dir  |
| `HARBOR_API_KEY`          | Harbor storage      | Optional — falls back to public Walrus             |
| `HARBOR_SPACE_ID`         | Harbor storage      | Required with `HARBOR_API_KEY`                     |
| `HARBOR_BUCKET_ID`        | Harbor storage      | Required with `HARBOR_API_KEY`                     |
| `AGENTOS_STORAGE_BACKEND` | Harbor mode         | Set to `harbor` to prefer Harbor over Walrus       |

> **Demo mode**: if `SUI_PRIVATE_KEY` is not set, `agentos_execute_skill` returns a simulated result and `agentos_publish_skill` uploads to public Walrus without minting on-chain. All read tools (`agentos_resolve`, `agentos_list_skills`, `agentos_resolve_manifest`) work without a key.

---

## Available tools

| Tool                       | Description                                                        |
| -------------------------- | ------------------------------------------------------------------ |
| `agentos_resolve`          | Resolve a `.sui` name → passport ID, runtime wallet, skills        |
| `agentos_register_agent`   | Register an agent locally in the registry (dev/headless mode)      |
| `agentos_publish_skill`    | Upload manifest to Walrus + mint SkillDescriptor on-chain          |
| `agentos_execute_skill`    | Resolve, verify integrity, and execute a skill on Sui              |
| `agentos_resolve_manifest` | Download + SHA-256 verify a skill manifest from Walrus             |
| `agentos_list_skills`      | List all skills registered under an agent                          |
| `agentos_import_skill`     | Import a local `SKILL.md` and publish it                           |
| `agentos_dashboard_url`    | Get the browser dashboard URL for wallet-connected flows           |

---

## Example prompts

Once connected, try these in your AI assistant:

```
Resolve alpha.sui and list its skills
```
```
Publish the manifest at ./SKILL.md for my-first-agent.sui
```
```
Execute web-search.alpha.sui with query "Sui Overflow 2026"
```
```
What is the dashboard URL for my-first-agent.sui?
```
```
Register a new agent called my-bot.sui with runtime wallet 0xabc...
```

---

## Verify the connection

After setup, ask your assistant:

> "Use agentos_resolve to look up alpha.sui"

Expected response includes `passportId`, `runtimeWallet`, and a list of registered skills.

---

## License

MIT
