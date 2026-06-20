# Local sponsored (gasless) testing

This guide explains how to run the dashboard locally and exercise the new
**gasless, server-side AgentPassport mint**: creating an agent from `/create`
now mints a real on-chain `AgentPassport` without any browser wallet popup and
without the user paying gas. Enoki sponsors the gas; a server-held runtime
keypair signs the transaction.

## How it works

```
POST /api/agents
  → build AgentPassport::create PTB (sender = runtime keypair address)
  → tx.build({ onlyTransactionKind: true })
  → Enoki createSponsoredTransaction({ network, transactionKindBytes, sender })   // Enoki adds gas
  → runtimeKeypair.signTransaction(sponsoredBytes)
  → Enoki executeSponsoredTransaction({ digest, signature })                       // fully gasless
  → read effects + objectChanges from the fullnode
  → persist the new AgentPassport objectId into .agentos/registry.json
```

The shared helper is `packages/frontend/lib/sponsored-execute.ts`
(`sponsoredExecuteServer(tx)`, plus `getRuntimeKeypair()`, `getRuntimeAddress()`,
`getEnokiClient()`). The SDK builds the PTB but never touches Enoki or env vars —
it stays signer-agnostic.

If the on-chain mint cannot run (no `NEXT_PUBLIC_AGENTOS_PACKAGE_ID`, missing
`ENOKI_SECRET_KEY`/`SUI_PRIVATE_KEY`, or an RPC error), the route **falls back to
a registry-only record** so dev mode keeps working without gas.

## Prerequisites

- Node 20, pnpm 10.
- An Enoki **secret** key from <https://portal.enoki.mystenlabs.com> with gas
  sponsorship enabled for your network.
- A Sui keypair (`suiprivkey1...`) whose address is allowed by your Enoki app's
  sponsorship configuration. This is the *sender*; Enoki pays the gas, so the
  address itself does not strictly need SUI, but it must be permitted to send.
- The AgentOS Move package published on your target network (its package id).

## 1. Configure `.env`

Copy the template and fill in the secrets (the repo `.env` is gitignored — never
commit it, never print the secret values):

```bash
cp .env.example .env
# or, to run only the dashboard:
cp packages/frontend/.env.example packages/frontend/.env
```

Set at least:

```
NEXT_PUBLIC_SUI_NETWORK=testnet
NEXT_PUBLIC_AGENTOS_PACKAGE_ID=0x<published-package-id>
ENOKI_SECRET_KEY=enoki_private_...
SUI_PRIVATE_KEY=suiprivkey1...
```

`ENOKI_SECRET_KEY` and `SUI_PRIVATE_KEY` are **server-only** — they must never be
prefixed with `NEXT_PUBLIC_` and never reach the browser.

## 2. Build the SDK, then run the dashboard

The dashboard imports `@agentos/sdk/node`, so build the SDK first:

```bash
pnpm --filter @agentos/sdk build
pnpm --filter @agentos/frontend dev   # http://localhost:3000
```

## 3. Create an agent (gasless mint)

1. Open <http://localhost:3000/create>.
2. Enter a `*.sui` name and a runtime wallet address, then submit.
3. The `POST /api/agents` route mints the `AgentPassport` gasless and writes the
   real object id into `.agentos/registry.json`.

You can also hit the route directly:

```bash
curl -s http://localhost:3000/api/agents \
  -H 'content-type: application/json' \
  -d '{"suinsName":"demo.sui","runtimeWallet":"0xYOUR_RUNTIME_WALLET"}' | jq
```

A successful on-chain mint returns `"onChain": true` plus a transaction
`digest`. A registry-only fallback returns `"onChain": false` and no digest.

## 4. Verify the new passport on Suiscan

Find the minted object id in the response (`agent.passportId`) or in
`.agentos/registry.json`, then open:

```
https://suiscan.xyz/testnet/object/<passportId>
```

(Swap `testnet` for `mainnet`/`devnet` to match `NEXT_PUBLIC_SUI_NETWORK`.)
You can also look up the transaction:

```
https://suiscan.xyz/testnet/tx/<digest>
```

The object type should end in `agent_passport::AgentPassport`, and its fields
should carry the `*.sui` name and runtime wallet you submitted.

## Troubleshooting

- **`onChain: false` unexpectedly** — the route caught an error and fell back.
  Check the dev server logs for `[api/agents] gasless mint failed, ...`. Common
  causes: `NEXT_PUBLIC_AGENTOS_PACKAGE_ID` unset, missing `ENOKI_SECRET_KEY` /
  `SUI_PRIVATE_KEY`, the sender not allowed in your Enoki sponsorship config, or
  a wrong network.
- **`ENOKI_SECRET_KEY is not set` / `SUI_PRIVATE_KEY is not set`** — populate
  `.env` (step 1) and restart the dev server so the new env is loaded.
- **`409 Agent already registered`** — that `*.sui` name already exists in
  `.agentos/registry.json`; pick another name or remove the existing record.
