# Upgrade: memory namespace on `AgentPassport`

> **⚠️ USER ACTION REQUIRED — funded testnet wallet needed.**
> This document only **prepares** the on-chain upgrade. None of the commands
> below have been run for you. An on-chain `sui client upgrade` spends gas and
> requires the **`UpgradeCap`** that was minted when the package was first
> published, so it must be run by the human holding the deploy wallet. The CLI /
> automation agents must **not** run `sui client publish` or `sui client upgrade`.

## What changed in Move

`packages/contracts/sources/agent_passport.move` gained, **without changing the
`AgentPassport` struct layout** (so this is a compatibility-preserving upgrade):

- `public fun set_memory_namespace(passport: &mut AgentPassport, namespace: vector<u8>, ctx: &TxContext)`
  — owner-gated (`E_NOT_OWNER`) setter for the existing `memory_namespace` field.
- `public fun memory_namespace(passport: &AgentPassport): vector<u8>` — getter.
- `create(...)` now defaults `memory_namespace` to the `suins_name` (the `.sui`
  name anchors the namespace) instead of an empty vector.

Because the struct's fields are unchanged (the `memory_namespace` field already
existed), only function bodies were modified and new functions added — both are
allowed by Sui's package upgrade compatibility rules.

> Note: existing `AgentPassport` objects minted **before** this upgrade keep
> their previously-stored `memory_namespace` (an empty vector). Their owners can
> backfill it by calling `set_memory_namespace`. Passports minted **after** the
> upgrade get the `suins_name` default automatically.

## 0. Prerequisites

```bash
sui client switch --env testnet
sui client active-address     # confirm it is the deploy wallet
sui client gas                # confirm it has SUI for gas
```

The current published package id (from `.agentos/config.json`) is:

```
0x6cc3fb480fd82972f4996b4b18240b0fe56407e26070690ad538862ef26e1e71
```

## 1. Build + test locally first (no gas)

```bash
cd packages/contracts
sui move build
sui move test
```

## 2. Find the `UpgradeCap`

The `UpgradeCap` object was created in the **original publish** transaction and
is owned by the deploy wallet. Find its object id:

```bash
sui client objects --json | \
  jq -r '.[] | select(.data.type=="0x2::package::UpgradeCap") | .data.objectId'
```

(or read it from the original `publish-testnet.json` artifact, under
`objectChanges[] | select(.objectType | endswith("::package::UpgradeCap"))`).

## 3. Run the upgrade  (spends gas — USER ACTION)

```bash
cd packages/contracts
sui client upgrade \
  --upgrade-capability <UPGRADE_CAP_OBJECT_ID> \
  --gas-budget 200000000 \
  --json | tee upgrade-testnet.json
```

Run each line separately; do **not** paste `# ...` comments on a command line.
`upgrade-testnet.json` is a local artifact — do not commit it.

## 4. Capture the NEW package id

A package upgrade publishes a **new** package id (the original id keeps serving
already-minted objects). Read the new id from the upgrade output:

```bash
jq -r '.objectChanges[] | select(.type=="published") | .packageId' upgrade-testnet.json
```

Call this `0xNEW_PACKAGE_ID`.

## 5. Post-upgrade config updates

Point every surface at `0xNEW_PACKAGE_ID`:

1. **`.env`** (repo root) and **`packages/frontend/.env`** — update:

   ```env
   NEXT_PUBLIC_AGENTOS_PACKAGE_ID=0xNEW_PACKAGE_ID
   # AGENTOS_PACKAGE_ID=0xNEW_PACKAGE_ID   # if you also set the server-only fallback
   ```

2. **`.agentos/config.json`** — set the `packageId`:

   ```json
   {
     "network": "testnet",
     "rpcUrl": "https://fullnode.testnet.sui.io:443",
     "packageId": "0xNEW_PACKAGE_ID",
     "registryPath": ".agentos/registry.json",
     "dashboardUrl": "https://sui-ns-agent-os-frontend.vercel.app"
   }
   ```

3. **Vercel** (and any other deploy env) — update `NEXT_PUBLIC_AGENTOS_PACKAGE_ID`
   to `0xNEW_PACKAGE_ID` and redeploy the frontend.

## 6. Notes

- **Enoki allowlist:** the server-side gasless path (Enoki secret + runtime
  keypair) does **not** require a move-target allowlist, so no Enoki change is
  needed for `set_memory_namespace`. Only the legacy browser-wallet sponsor
  path uses an allowlist; if you rely on that, add
  `0xNEW_PACKAGE_ID::agent_passport::set_memory_namespace`.
- **Memwal relayer:** wiring the workflow Memory step to a real backend needs
  `MEMWAL_RELAYER_URL` and `MEMWAL_API_KEY` (see `.env.example`). These are
  user-supplied; when unset, the memory step is skipped and the run still
  succeeds.
