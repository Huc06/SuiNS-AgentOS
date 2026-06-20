# Demo Runbook — SuiNS AgentOS

One continuous on-chain flow covering all 4 hero moments.

## Prerequisites

```bash
pnpm install
pnpm build
pnpm seed          # Seeds 5 demo agents to registry
pnpm dev           # Or use the deployed Vercel URL
```

## The Flow (~3 minutes)

### Hero 1 — Live Agent Explorer

1. Open `/explore` — see the seeded agents grid with verified badges
2. Use the filter chips: Network (All / Mainnet / Testnet), "Has skills"
3. Click an agent card → lands on `/agent/alpha` passport page

### Hero 2 — 1-click Create Agent

1. Navigate to `/create` → click "New Agent"
2. **Connect step**: "Continue with Google" (zkLogin, zero seed phrase) OR connect wallet
3. **Name step**: type a name → "Check" availability → "Claim" mints the .sui name in-app
4. **Review step**: verify SuiNS, runtime wallet, description → "Mint Passport"
5. **Success**: shareable URL + Suiscan tx link + "⚡ Gas sponsored" badge

### Hero 3 — Skill Execution Console

1. Go to `/agent/alpha` → click "Run →" on a skill
2. Console opens: VERIFYING → ✓ INTEGRITY VERIFIED (SHA-256 matches on-chain hash)
3. Add parameters if needed → "Run Skill"
4. Wallet prompt → sign → digest + Suiscan link

### Hero 4 — Agent-to-Agent Delegation

1. Go to `/agent/alpha/delegate`
2. Fill the grant form: sub-agent name, capabilities, spend limit (1 SUI), expiry (7d)
3. "Grant Delegation" → sign → Suiscan link
4. Delegation graph updates: parent→child edge with capabilities + spend limit
5. Click "Revoke" on a delegation → confirms → edge turns dashed/red

## Proof Artifacts

| Artifact            | Link                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Live URL**        | https://suins-agentos.vercel.app                                                                                      |
| **Testnet Package** | `0x7febcab96302fc0917b3f0443e2b29779ca8fc802a6407edfa857604fa6ad9ef`                                                  |
| **Suiscan**         | [View package](https://suiscan.xyz/testnet/object/0x7febcab96302fc0917b3f0443e2b29779ca8fc802a6407edfa857604fa6ad9ef) |
| **Tx Digest**       | `DiAks5zr85tZt2XtwsZL7wtFCSyGwskMoAMLoRDWkyyj`                                                                        |
| **Modules**         | agent_passport, attestation, bucket_policy, delegation, skill_descriptor                                              |

## Tracks

- **Primary**: Agentic Web (AI) — agents that act, transact, coordinate
- **Secondary**: Infra & DevX — MCP server + SDK + CLI
- **Pool**: Walrus — every skill manifest stored on Walrus
