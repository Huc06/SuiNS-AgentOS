# Design Document: Delegation Subnames + Policy Module

## Overview

This feature adds a hierarchical delegation system to AgentOS where parent agents can delegate authority to sub-agents identified by SuiNS subnames. Instead of building a custom ACL module from scratch, the system uses [`@mysten/sui-groups`](https://github.com/MystenLabs/sui-groups) (`PermissionedGroup<T>`) as the on-chain permission and membership layer (per [Epic #7](https://github.com/Huc06/SuiNS-AgentOS/issues/7)).

Each agent's `AgentPassport.policy_root` stores a `PermissionedGroup` object ID. Sub-agents are added as members with typed permissions (e.g., `Operator`, `SkillPublisher`, `DelegateBudget`). Budget and expiry constraints are tracked in a thin companion Move module (`agent_delegation.move`).

### Key Design Decisions

1. **Use sui-groups for permissions** — No custom ACL graph. `PermissionedGroup` provides grant/revoke, events, pause/unpause out of the box. Aligns with Mysten SDK building guidelines.
2. **Thin companion module for budget/expiry** — sui-groups handles membership + typed permissions; a small `agent_delegation` module adds budget cap, spent tracking, and expiry enforcement on top.
3. **`$extend()` composition** — SDK uses `client.$extend(agentOS()).$extend(suiGroups(...))` for composable client access.
4. **Local registry augmentation** — Sub-agent records are stored in the local registry with a `parentSlug` field for fast offline lookups.
5. **SuiNS subname as identity** — Each sub-agent gets a real SuiNS subname resolvable via standard SuiNS infrastructure.
6. **Recursive delegation with attenuation** — Sub-agents holding the `Delegate` permission can further delegate, but only with a subset of their own permissions, budget, and expiry.

## Architecture

```mermaid
graph TD
    subgraph On-Chain [Sui Blockchain]
        PP[AgentPassport] -->|policy_root| PG[PermissionedGroup]
        PG -->|members| M1[Sub-Agent Address + Permissions]
        PG -->|members| M2[Sub-Agent Address + Permissions]
        PP -->|companion| DC[DelegationConfig - budget/expiry]
        SN[SuiNS Name] -->|subname| CSN[SuiNS Subname]
    end

    subgraph SDK [@agentos/sdk]
        Client[AgentOSClient] -->|$extend| SG[suiGroups client]
        Client -->|delegateSubAgent| TXB[Transaction Builder]
        Client -->|revokeSubAgent| TXB
        Client -->|listSubAgents| REG[LocalRegistry]
        SG -->|grantPermission / revokePermission| OnChain[Sui RPC]
        TXB -->|PTB| OnChain
    end

    subgraph CLI [@agentos/cli]
        CMD[agent delegate / revoke-sub / list-subs] --> Client
    end

    subgraph MCP [@agentos/mcp]
        Tools[agentos_delegate_sub_agent / revoke / list] --> Client
    end

    subgraph Frontend [Next.js]
        UI[/agent/name/delegate] -->|dapp-kit| TXB
        UI -->|API route| REG
    end
```

### Flow: Create Agent (with Group)

1. During `agent_passport::create`, a `PermissionedGroup` is provisioned
2. The group's object ID is stored in `AgentPassport.policy_root`
3. The agent owner is automatically the group admin (can grant/revoke)

### Flow: Create Sub-Agent (Delegate)

1. User invokes `delegateSubAgent` (via SDK, CLI, MCP, or Frontend)
2. SDK creates a PTB that:
   a. Creates a SuiNS subname under the parent's name
   b. Calls `client.groups.addMembers()` to add sub-agent address with typed permissions
   c. Creates a `DelegationConfig` object with budget_cap and expiry
   d. Calls `agent_passport::create` for the child passport, linking `policy_root` to the parent group
   e. Transfers passport to the sub-agent's runtime wallet
3. SDK registers the sub-agent in the local registry with `parentSlug`
4. Returns the child `AgentPassport`

### Flow: Enforce Permission

1. Sub-agent attempts an operation requiring a specific permission type
2. Caller checks group membership: `client.groups.view.isMember(groupId, address)`
3. Caller checks specific permission: verify the typed permission struct is granted
4. If budget-gated: `agent_delegation::check_budget` verifies `spent + amount ≤ cap` and `clock < expiry`
5. If all pass, proceeds; otherwise aborts

### Flow: Revoke

1. Parent calls `client.groups.revokePermission()` or `client.groups.removeMember()`
2. sui-groups removes the permission/membership on-chain
3. For cascading revocation, SDK iterates children in the registry and issues remove for each descendant
4. `DelegationConfig.is_active` set to `false`

## Components and Interfaces

### 1. Move Module: `agent_delegation.move` (companion to sui-groups)

This module does **not** replicate ACL logic. It only adds budget/expiry constraints that sui-groups doesn't handle natively.

```move
module agentos::agent_delegation {
    use std::string::String;
    use sui::clock::Clock;

    // Error codes
    const E_INVALID_EXPIRY: u64 = 1;
    const E_BUDGET_EXCEEDED: u64 = 2;
    const E_POLICY_EXPIRED: u64 = 3;
    const E_NOT_DELEGATOR: u64 = 4;
    const E_BUDGET_EXCEEDS_PARENT: u64 = 5;
    const E_EXPIRY_EXCEEDS_PARENT: u64 = 6;

    /// Budget + expiry constraints for a delegated sub-agent.
    /// Membership/permissions are managed by sui-groups PermissionedGroup.
    public struct DelegationConfig has key, store {
        id: UID,
        delegator: address,
        group_id: address,       // PermissionedGroup object ID
        sub_agent: address,      // sub-agent runtime wallet
        budget_cap: u64,         // max spend in MIST
        spent: u64,              // cumulative spend
        expiry: u64,             // epoch-ms timestamp
        is_active: bool,
    }

    // Witness type for our permission structs
    public struct AGENTOS_DELEGATION has drop {}

    // Permission struct types (used as type params in sui-groups)
    public struct Operator has store, drop {}
    public struct SkillPublisher has store, drop {}
    public struct Delegate has store, drop {}
    public struct BudgetSpender has store, drop {}

    // Entry functions
    public entry fun create_config(
        group_id: address,
        sub_agent: address,
        budget_cap: u64,
        expiry: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    );

    public entry fun revoke_config(config: &mut DelegationConfig, ctx: &TxContext);

    // Public functions
    public fun check_budget(config: &DelegationConfig, amount: u64, clock: &Clock);
    public fun record_spend(config: &mut DelegationConfig, amount: u64, clock: &Clock);
    public fun is_valid(config: &DelegationConfig, clock: &Clock): bool;
}
```

### 2. Move: Permission Struct Integration with sui-groups

The witness type `AGENTOS_DELEGATION` is used when creating a `PermissionedGroup`:

```
PermissionedGroup<AGENTOS_DELEGATION>
```

Permission structs (`Operator`, `SkillPublisher`, `Delegate`, `BudgetSpender`) are granted to group members via `client.groups.grantPermission()` using their full type path:

```
0xPACKAGE::agent_delegation::Operator
0xPACKAGE::agent_delegation::SkillPublisher
0xPACKAGE::agent_delegation::Delegate
0xPACKAGE::agent_delegation::BudgetSpender
```

### 3. SDK: Composed Client

```typescript
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { suiGroups } from "@mysten/sui-groups";
import { agentOS } from "@agentos/sdk";

const client = new SuiGrpcClient({ network: "testnet" })
  .$extend(agentOS({ packageId: "0x..." }))
  .$extend(
    suiGroups({
      witnessType: "0xPACKAGE::agent_delegation::AGENTOS_DELEGATION",
    }),
  );

// Now available:
// client.groups.addMembers(...)
// client.groups.grantPermission(...)
// client.groups.revokePermission(...)
// client.groups.removeMember(...)
// client.groups.tx.addMembers(...)  // transaction builders
// client.groups.view.isMember(...)  // read-only queries
```

### 4. SDK: AgentOSClient Extensions

New methods on `AgentOSClient`:

```typescript
async delegateSubAgent(options: {
  signer: Signer;
  parent: string;        // parent SuiNS name
  child: SubAgentConfig; // name, permissions, budget, expiry
}): Promise<AgentPassport>;

async revokeSubAgent(options: {
  signer: Signer;
  parentName: string;
  subName: string;
}): Promise<void>;

async listSubAgents(parentName: string): Promise<SubAgentRecord[]>;
```

### 5. SDK: Contract Bindings (`packages/sdk/src/contracts/agent_delegation.ts`)

```typescript
export function createConfig(options: {
  packageId?: string;
  groupId: string;
  subAgent: string;
  budgetCap: bigint;
  expiry: number;
  clock: TransactionObjectArgument;
}): Commands;

export function revokeConfig(options: {
  packageId?: string;
  config: TransactionObjectArgument;
}): Commands;

export function recordSpend(options: {
  packageId?: string;
  config: TransactionObjectArgument;
  amount: bigint;
  clock: TransactionObjectArgument;
}): Commands;
```

### 6. Registry Extensions

New type added to `packages/sdk/src/registry/types.ts`:

```typescript
export interface RegistrySubAgentRecord extends RegistryAgentRecord {
  parentSlug: string;
  permissions: string[]; // permission type names
  budgetCap: string; // stringified bigint (MIST)
  budgetSpent: string; // stringified bigint (MIST)
  expiry: number; // epoch-ms timestamp
  groupId: string; // PermissionedGroup object ID
  delegationConfigId: string; // DelegationConfig object ID
}
```

New field on `RegistryFile`:

```typescript
export interface RegistryFile {
  version: 1;
  agents: RegistryAgentRecord[];
  skills: RegistrySkillRecord[];
  subAgents?: RegistrySubAgentRecord[];
}
```

### 7. CLI Commands (`packages/cli/src/commands/agent.ts`)

| Command                                                                                  | Description      |
| ---------------------------------------------------------------------------------------- | ---------------- |
| `agent delegate <parent> --name <sub> --permissions <list> --budget <amt> --expiry <ts>` | Create sub-agent |
| `agent revoke-sub <parent> --name <sub>`                                                 | Revoke sub-agent |
| `agent list-subs <parent>`                                                               | List sub-agents  |

All support `--json` and `agent delegate` supports `--dry-run`.

### 8. MCP Tools (`packages/mcp/src/server.ts`)

| Tool                         | Input                                                  | Output           |
| ---------------------------- | ------------------------------------------------------ | ---------------- |
| `agentos_delegate_sub_agent` | `{parentName, subName, permissions[], budget, expiry}` | Sub-agent record |
| `agentos_revoke_sub_agent`   | `{parentName, subName}`                                | Confirmation     |
| `agentos_list_sub_agents`    | `{parentName}`                                         | Sub-agent array  |

### 9. Frontend Page (`packages/frontend/app/agent/[name]/delegate/page.tsx`)

- Server component fetches sub-agents from API route
- Client component for delegation form using `@mysten/dapp-kit` for transaction signing
- Columns: Name, Permissions, Budget (used/cap), Expiry, Status, Actions
- Create dialog with form validation (permission multi-select maps to sui-groups permission types)
- Revoke confirmation modal

## Data Models

### On-Chain: PermissionedGroup (from sui-groups)

Managed entirely by `@mysten/sui-groups`. AgentOS only stores the group object ID and interacts via the sui-groups SDK.

### On-Chain: DelegationConfig (companion object)

| Field        | Type      | Description                                                |
| ------------ | --------- | ---------------------------------------------------------- |
| `id`         | `UID`     | Unique object ID                                           |
| `delegator`  | `address` | Parent agent's address                                     |
| `group_id`   | `address` | PermissionedGroup object ID this config belongs to         |
| `sub_agent`  | `address` | Sub-agent runtime wallet address                           |
| `budget_cap` | `u64`     | Maximum spend in MIST                                      |
| `spent`      | `u64`     | Cumulative spend in MIST                                   |
| `expiry`     | `u64`     | Epoch-millisecond timestamp after which delegation is void |
| `is_active`  | `bool`    | Whether this delegation config is currently active         |

### Local Registry: SubAgentRecord

| Field                | Type                                 | Description                                        |
| -------------------- | ------------------------------------ | -------------------------------------------------- |
| `slug`               | `string`                             | URL-friendly identifier                            |
| `suinsName`          | `string`                             | Full qualified subname (e.g., `treasury.quan.sui`) |
| `passportId`         | `string`                             | On-chain passport object ID                        |
| `runtimeWallet`      | `string`                             | Sub-agent's wallet address                         |
| `parentSlug`         | `string`                             | Parent agent's slug                                |
| `permissions`        | `string[]`                           | Permission type names                              |
| `budgetCap`          | `string`                             | Budget cap in MIST (stringified bigint)            |
| `budgetSpent`        | `string`                             | Amount spent (stringified bigint)                  |
| `expiry`             | `number`                             | Expiry epoch-ms                                    |
| `groupId`            | `string`                             | PermissionedGroup object ID                        |
| `delegationConfigId` | `string`                             | DelegationConfig object ID                         |
| `network`            | `'mainnet' \| 'testnet'`             | Network                                            |
| `status`             | `'active' \| 'revoked' \| 'expired'` | Current status                                     |
| `createdAt`          | `string`                             | ISO timestamp                                      |

### SDK Types

```typescript
// Already exists in types.ts — augment permissions to use type strings
export interface SubAgentConfig {
  name: string;
  permissions: string[]; // e.g., ['Operator', 'SkillPublisher']
  budget: bigint;
  expiry: number;
}

// New type for list results
export interface SubAgentRecord {
  slug: string;
  suinsName: string;
  passportId: string;
  runtimeWallet: string;
  parentSlug: string;
  permissions: string[];
  budgetCap: bigint;
  budgetSpent: bigint;
  expiry: number;
  groupId: string;
  delegationConfigId: string;
  status: "active" | "revoked" | "expired";
}
```

## Correctness Properties

### Property 1: Group creation on agent setup

_For any_ newly created AgentPassport, the passport's `policy_root` field SHALL contain a valid `PermissionedGroup` object ID (not `@0x0`), and the group's admin SHALL be the passport owner.

**Validates: Requirements 4.1, Issue #7 acceptance criteria**

### Property 2: Permission grant round-trip

_For any_ valid permission type and member address, calling `grantPermission` followed by `view.isMember` SHALL confirm the member has the granted permission.

**Validates: Requirements 1.1, 2.1**

### Property 3: Budget enforcement

_For any_ DelegationConfig with budget_cap B and any sequence of valid spend amounts [a1, a2, ..., an], `record_spend` SHALL succeed when partial sums ≤ B, and abort with `E_BUDGET_EXCEEDED` when the next spend would exceed B.

**Validates: Requirements 2.3, 2.4**

### Property 4: Expiry enforcement

_For any_ DelegationConfig with expiry E, `check_budget` SHALL abort with `E_POLICY_EXPIRED` when `clock_time ≥ E`.

**Validates: Requirements 2.5**

### Property 5: Revocation via removeMember

_For any_ active group member, calling `removeMember` SHALL result in `view.isMember` returning false, and `DelegationConfig.is_active` being set to `false`.

**Validates: Requirements 3.1, 3.2**

### Property 6: Delegation attenuation

_For any_ parent DelegationConfig with budget_cap B_p (remaining = B_p - spent_p) and expiry E_p, creating a child config with budget B_c and expiry E_c SHALL succeed if and only if B_c ≤ remaining AND E_c ≤ E_p. Child permissions must be subset of parent's.

**Validates: Requirements 9.2, 9.3, 9.4**

### Property 7: Cascading revocation

_For any_ delegation tree, revoking a parent's membership SHALL result in all descendants being removed from the group and their DelegationConfigs marked inactive.

**Validates: Requirements 9.5**

### Property 8: Registry parentSlug correctness

_For any_ successful `delegateSubAgent` call, the resulting sub-agent record SHALL have `parentSlug` equal to the slug derived from the parent name.

**Validates: Requirements 5.2**

### Property 9: listSubAgents returns exactly parent's children

_For any_ registry state, `listSubAgents(parentName)` SHALL return exactly the sub-agents whose `parentSlug` matches the resolved slug of `parentName`.

**Validates: Requirements 5.4**

### Property 10: Subname qualification

_For any_ parent SuiNS name `{parent}.sui` and sub-agent name `{sub}`, the full qualified subname SHALL equal `{sub}.{parent}.sui`.

**Validates: Requirements 10.3**

## Error Handling

### Move Contract Errors (agent_delegation.move)

| Error Code | Constant                  | Trigger                               |
| ---------- | ------------------------- | ------------------------------------- |
| 1          | `E_INVALID_EXPIRY`        | Expiry timestamp ≤ current epoch time |
| 2          | `E_BUDGET_EXCEEDED`       | spent + amount > budget_cap           |
| 3          | `E_POLICY_EXPIRED`        | Current time ≥ expiry                 |
| 4          | `E_NOT_DELEGATOR`         | Non-delegator attempts revoke         |
| 5          | `E_BUDGET_EXCEEDS_PARENT` | Child budget > parent remaining       |
| 6          | `E_EXPIRY_EXCEEDS_PARENT` | Child expiry > parent expiry          |

### sui-groups Errors

Handled by the `@mysten/sui-groups` library — errors propagate as transaction abort codes. AgentOS wraps them with descriptive messages.

### SDK Error Handling

- `delegateSubAgent`: Throws `"Parent agent not found: {name}"` if parent doesn't exist in registry
- `delegateSubAgent`: Throws `"Subname already exists: {fullName}"` if SuiNS subname is taken
- `revokeSubAgent`: Throws `"Sub-agent not found: {name}"` if sub-agent doesn't exist
- `listSubAgents`: Returns empty array (not error) if parent has no sub-agents
- Transaction failures propagate as `Error` with abort code in message

### CLI / MCP / Frontend Error Handling

Same patterns as existing AgentOS error handling (see existing docs).

## Testing Strategy

### Property-Based Tests (PBT)

**Library**: `fast-check` via `vitest`

**Configuration**: Minimum 100 iterations per property test.

Properties 3-4 (budget/expiry logic) and 6-10 (SDK/registry) tested directly against `DelegationConfig` model and `LocalRegistry`.

Properties 1-2, 5 (group membership) tested via mocked sui-groups client interactions.

**Tag format**: `Feature: delegation-subnames-policy, Property {N}: {title}`

#### PBT Test Files

- `packages/sdk/src/delegation.property.test.ts` — Properties 1-10
- `packages/contracts/tests/agent_delegation_tests.move` — Move-level unit tests for budget/expiry logic

### Unit Tests

- `packages/sdk/src/delegation.test.ts` — SDK method behavior, error cases
- `packages/cli/src/commands/agent-delegate.test.ts` — CLI command parsing
- `packages/mcp/src/delegation-tools.test.ts` — MCP tool registration

### Integration Tests

- `packages/sdk/src/delegation.integration.test.ts` — Full delegation flow with mocked Sui + sui-groups client
- Move tests: `packages/contracts/tests/agent_delegation_tests.move`

### Test Coverage Goals

| Layer                   | Coverage Target                                     |
| ----------------------- | --------------------------------------------------- |
| Move (agent_delegation) | All entry/public functions, all error paths         |
| SDK delegation methods  | All public methods, error paths, registry mutations |
| sui-groups integration  | Grant, revoke, remove, pause interactions           |
| CLI commands            | Command parsing, output formats                     |
| MCP tools               | Tool registration, input validation                 |
| Frontend                | Component rendering, form validation                |
