# Upgrade: delegated execution recording + cap caller-binding (coordinate)

> **⚠️ USER ACTION REQUIRED — funded testnet wallet + `UpgradeCap` needed.**
> This document only **prepares** the on-chain deploy. None of the commands
> below have been run for you. `sui client upgrade` / `sui client publish` spend
> gas and require keys held by the human running the deploy wallet. The CLI /
> automation agents must **not** run `sui client publish` or `sui client upgrade`.

This deploy ships the Move changes from the "A Move" phase **plus** the P4
`set_memory_namespace` work (they have not yet been published — the live package
`0xde2423929ae03dd7620744bd23e059fc77f8198941a5d9a5be595559c6eba699` predates
both). Read the compatibility analysis in §2 first — **one change forces a fresh
publish rather than an in-place upgrade.**

## 1. What changed in Move

### `packages/contracts/sources/agent_passport.move`
- `record_execution` body refactored to delegate to a new internal mutator (no
  behaviour change: still owner/`runtime_wallet`-gated, same event).
- **NEW** `public(package) fun record_execution_internal(passport: &mut AgentPassport)`
  — increments `exec_count` and emits `ExecutionRecorded`. Package-visibility so
  only sibling modules (i.e. `delegation`) can call it after their own auth check.
  Avoids a circular `agent_passport ↔ delegation` dependency.
- **(P4, not yet published)** `set_memory_namespace(...)` owner-gated setter +
  `memory_namespace(...)` getter + `create(...)` now defaults the namespace to
  the `.sui` name. See `docs/upgrade-memory-namespace.md` for the P4 detail; it
  is folded into this same deploy.

### `packages/contracts/sources/delegation.move`
- **NEW** `public fun record_subagent_execution(passport: &mut AgentPassport, cap: &DelegationCap, clock: &Clock, ctx: &TxContext)`
  — authorizes a sub-agent execution by a `DelegationCap` instead of passport
  ownership (FIX-1). Asserts: cap not revoked, cap not expired, `ctx.sender() ==
  cap.child_agent`, and `passport` is the cap's `parent_passport`. Then calls
  `agent_passport::record_execution_internal`. Lets a delegated runtime bump a
  passport's `exec_count` inside an atomic import/run PTB without being the owner
  or `runtime_wallet` — the case where plain `record_execution` would abort and
  unwind the whole chain.
- **CHANGED SIGNATURE** `consume(cap: &mut DelegationCap, amount: u64, ctx: &TxContext)`
  — was `consume(cap, amount)` with **no caller auth**. Now asserts
  `ctx.sender() == cap.child_agent` (FIX-2) so only the bound child runtime can
  draw down the budget.
- **NEW** `public fun is_expired(cap: &DelegationCap, clock: &Clock): bool` helper.
- **NEW** error codes `E_NOT_CHILD_AGENT = 7`, `E_PASSPORT_MISMATCH = 8`.

No struct layouts or struct abilities changed in this phase.

## 2. Compatibility analysis — this needs a FRESH PUBLISH

Sui's default **`compatible`** upgrade policy allows: adding functions, adding
structs, and changing function *bodies*. It **forbids** changing the signature of
an existing public function. Checking each change against the live package:

| Change | Upgrade-compatible? |
|---|---|
| `agent_passport::record_execution_internal` (new `public(package)` fn) | ✅ addition |
| `agent_passport::record_execution` (body only) | ✅ body change |
| `agent_passport::set_memory_namespace` / `memory_namespace` (P4, new fns) | ✅ addition |
| `delegation::record_subagent_execution` (new public fn) | ✅ addition |
| `delegation::is_expired` (new public fn) | ✅ addition |
| `delegation` new error consts | ✅ addition |
| **`delegation::consume` — added `&TxContext` param** | ❌ **signature change** |

`delegation::consume(cap, amount)` was published **in the live package**
`0x7feb…` (it shipped with the original `agentos::delegation` module). Adding a
parameter changes its signature, which the upgrade verifier rejects. There is no
*looser* policy than `compatible` to fall back to (the order is
`compatible > additive > dep_only > immutable`).

**Consequence:** this deploy must be a **fresh `sui client publish`** (a new
package id, leaving `0x7feb…` to keep serving already-minted objects) — the same
path this project took before ("incompatible struct changes require fresh
publish"). On testnet this is the expected pattern; existing dev passports/skills
are re-seedable.

> If you instead want a true **in-place `sui client upgrade`**, you must first
> revert the `consume` signature change in code (keep `consume(cap, amount)` and
> add a *new* function such as `consume_for(cap, amount, ctx)` carrying the
> caller binding). Then every change above is compatible and §3-B applies.
> Phase B's TS builder targets `consume(cap, amount, ctx)` as written, so doing
> this also means updating that builder. Coordinate before choosing.

## 0. Prerequisites

```bash
sui client switch --env testnet
sui client active-address     # confirm it is the deploy wallet
sui client gas                # confirm it has SUI for gas
```

## 1b. Build + test locally first (no gas)

```bash
cd packages/contracts
sui move build
sui move test
```

Expected: `Test result: OK. Total tests: 46; passed: 46`.

## 3-A. Fresh publish  (REQUIRED for this deploy — spends gas, USER ACTION)

```bash
cd packages/contracts
sui client publish \
  --gas-budget 200000000 \
  --json | tee publish-testnet.json
```

Run as a single command; do **not** paste `# …` comments onto a command line.
`publish-testnet.json` is a local artifact — do not commit it.

Capture the NEW package id and the NEW `UpgradeCap` (save the cap id for any
future *compatible* upgrade):

```bash
jq -r '.objectChanges[] | select(.type=="published") | .packageId' publish-testnet.json
jq -r '.objectChanges[] | select(.objectType=="0x2::package::UpgradeCap") | .objectId' publish-testnet.json
```

Call the package id `0xNEW_PACKAGE_ID`.

## 3-B. (Alternative) In-place upgrade — ONLY if the `consume` signature is reverted

If, and only if, you take the compatible path described in §2, the exact upgrade
command is:

```bash
cd packages/contracts
sui client upgrade \
  --upgrade-capability <UPGRADE_CAP_OBJECT_ID> \
  --gas-budget 200000000 \
  --json | tee upgrade-testnet.json
```

Find the `UpgradeCap` (minted in the original publish, owned by the deploy wallet):

```bash
sui client objects --json | \
  jq -r '.[] | select(.data.type=="0x2::package::UpgradeCap") | .data.objectId'
```

A package upgrade publishes a **new** package id (the original keeps serving
already-minted objects); read it back the same way:

```bash
jq -r '.objectChanges[] | select(.type=="published") | .packageId' upgrade-testnet.json
```

## 4. Post-deploy config — rewire `NEXT_PUBLIC_AGENTOS_PACKAGE_ID`

Point every surface at `0xNEW_PACKAGE_ID`:

1. **`.env`** (repo root) and **`packages/frontend/.env`**:

   ```env
   NEXT_PUBLIC_AGENTOS_PACKAGE_ID=0xNEW_PACKAGE_ID
   # AGENTOS_PACKAGE_ID=0xNEW_PACKAGE_ID   # if you also set the server-only fallback
   ```

2. **`.agentos/config.json`** — set `packageId`:

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

4. **Fresh publish only:** existing on-chain dev passports/skills under `0x7feb…`
   are not mutable by the new package. Re-seed any demo agents/skills you need
   under `0xNEW_PACKAGE_ID` (or fall back to the local registry).

## 5. Enoki allowlist (browser-wallet sponsor path only)

The **server-side** gasless path (Enoki secret + runtime keypair,
`sponsoredExecuteServer`) needs **no** move-target allowlist. Only the legacy
**browser-wallet** sponsor path uses one. If you rely on it, add the new targets
for `0xNEW_PACKAGE_ID`:

```
0xNEW_PACKAGE_ID::agent_passport::set_memory_namespace
0xNEW_PACKAGE_ID::delegation::record_subagent_execution
0xNEW_PACKAGE_ID::delegation::consume
0xNEW_PACKAGE_ID::delegation::grant
0xNEW_PACKAGE_ID::delegation::revoke
```

## 6. New function signatures (phase B / SDK builders depend on these)

```move
// agent_passport.move
public(package) fun record_execution_internal(passport: &mut AgentPassport)

// delegation.move
public fun record_subagent_execution(
    passport: &mut AgentPassport,   // MUST be the cap's parent_passport
    cap: &DelegationCap,
    clock: &Clock,
    ctx: &TxContext,                // sender MUST equal cap.child_agent
)
public fun consume(cap: &mut DelegationCap, amount: u64, ctx: &TxContext) // sender MUST equal cap.child_agent
public fun is_expired(cap: &DelegationCap, clock: &Clock): bool
```

**PTB / SDK-builder note:** `&TxContext` is auto-injected by the runtime and is
**not** a user-supplied PTB argument. So:
- The existing `consume` SDK builder
  (`packages/sdk/src/contracts/delegation.ts`) — `arguments: [cap, u64(amount)]`
  — needs **no argument change**; the signature change is transparent at the PTB
  layer.
- A **new** `recordSubagentExecution` builder must pass
  `arguments: [parentPassport, cap, clockObject]` (the `0x6` shared Clock), with
  the transaction signed by the cap's `child_agent` runtime keypair.
