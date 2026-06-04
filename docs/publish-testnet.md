# Publish contracts to testnet

Core on-chain flows need a published Move package id in config.

## GitHub Actions (team)

1. Add secrets to environment **testnet**: `SUI_PRIVATE_KEY`, `SUI_RPC_URL`
2. Actions → **CD** → Run workflow → `contracts-testnet`
3. Copy `packageId` from job logs

## Local publish

```bash
cd packages/contracts
sui client publish --gas-budget 200000000 --json | tee publish.json
```

Record `packageId` from the JSON output, then:

```bash
# repo root
pnpm exec agentos init   # if needed
```

Edit `.agentos/config.json`:

```json
{
  "network": "testnet",
  "packageId": "0xYOUR_PACKAGE_ID",
  "registryPath": ".agentos/registry.json",
  "dashboardUrl": "http://localhost:3000"
}
```

Frontend (optional on-chain mint from UI):

```env
# packages/frontend/.env.local
NEXT_PUBLIC_AGENTOS_PACKAGE_ID=0xYOUR_PACKAGE_ID
```

## Verify CLI on-chain create

```bash
export SUI_PRIVATE_KEY=suiprivkey1...
agentos agent create my-agent.sui --wallet 0xYOUR_ADDRESS --on-chain
```

## Enoki sponsor (later)

Default UI mint uses **wallet gas** when `NEXT_PUBLIC_AGENTOS_PACKAGE_ID` is set.  
Enable sponsor only with `NEXT_PUBLIC_ENOKI_SPONSOR=true` plus server `ENOKI_SECRET_KEY`.
