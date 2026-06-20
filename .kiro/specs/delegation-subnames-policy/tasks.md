# Tasks: Delegation Subnames + Policy Module (via @mysten/sui-groups)

## Task 1: Move Contract — agent_delegation.move (witness + budget/expiry)

- [ ] 1.1 Create `packages/contracts/sources/agent_delegation.move` with witness type `AGENTOS_DELEGATION` and permission structs (`Operator`, `SkillPublisher`, `Delegate`, `BudgetSpender`)
- [ ] 1.2 Implement `DelegationConfig` struct (id, delegator, group_id, sub_agent, budget_cap, spent, expiry, is_active)
- [ ] 1.3 Implement `create_config` entry function that validates expiry > current clock time, creates DelegationConfig with is_active=true and spent=0
- [ ] 1.4 Implement `check_budget` public function that verifies is_active, spent + amount ≤ budget_cap, and clock < expiry
- [ ] 1.5 Implement `record_spend` public function that increments `spent` field after check_budget passes
- [ ] 1.6 Implement `revoke_config` entry function with delegator authorization check (E_NOT_DELEGATOR)
- [ ] 1.7 Implement hierarchical constraint validation: child budget ≤ parent remaining, child expiry ≤ parent expiry
- [ ] 1.8 Add `is_valid` public function that checks is_active + clock < expiry
- [ ] 1.9 Write Move unit tests in `packages/contracts/tests/agent_delegation_tests.move` covering all functions and error paths

## Task 2: Update AgentPassport to provision PermissionedGroup

- [ ] 2.1 Add `sui-groups` Move package dependency to `packages/contracts/Move.toml`
- [ ] 2.2 Update `agent_passport::create` to accept a `group_id: address` parameter and store it in `policy_root` (instead of `@0x0`)
- [ ] 2.3 Update existing `agent_passport_tests.move` to pass group_id in create calls
- [ ] 2.4 Verify `sui move build` and `sui move test` pass with the sui-groups dependency

## Task 3: SDK — Install @mysten/sui-groups + contract bindings

- [ ] 3.1 Add `@mysten/sui-groups` as peer dependency in `packages/sdk/package.json`
- [ ] 3.2 Create `packages/sdk/src/contracts/agent_delegation.ts` with `createConfig`, `revokeConfig`, `recordSpend`, and `isValid` PTB command builders
- [ ] 3.3 Export `agentDelegation` from `packages/sdk/src/contracts/index.ts`
- [ ] 3.4 Add `SubAgentRecord`, `RegistrySubAgentRecord` types to `packages/sdk/src/registry/types.ts` and `packages/sdk/src/types.ts` (including groupId, delegationConfigId fields)
- [ ] 3.5 Create `packages/sdk/src/groups.ts` utility that composes `suiGroups({ witnessType })` with the AgentOS client and exports permission type constants

## Task 4: Local Registry Sub-Agent Support

- [ ] 4.1 Add `subAgents?: RegistrySubAgentRecord[]` field to `RegistryFile` interface
- [ ] 4.2 Implement `registerSubAgent` method on `LocalRegistry` that creates a sub-agent record with parentSlug, permissions, budgetCap, expiry, groupId, and delegationConfigId
- [ ] 4.3 Implement `listSubAgents(parentName: string)` method on `LocalRegistry` that filters sub-agents by parentSlug
- [ ] 4.4 Implement `revokeSubAgent(parentName: string, subName: string)` method on `LocalRegistry` that sets status to 'revoked'
- [ ] 4.5 Implement `findSubAgent(parentName: string, subName: string)` method for single sub-agent lookup
- [ ] 4.6 Implement cascading revoke in registry: when a sub-agent is revoked, recursively revoke all its descendants

## Task 5: SDK Client — delegateSubAgent, revokeSubAgent, listSubAgents

- [ ] 5.1 Implement `delegateSubAgent` on `AgentOSClient`: build PTB that calls `groups.tx.addMembers()` + `agent_delegation::create_config` + `agent_passport::create`, execute transaction, register in local registry, return AgentPassport
- [ ] 5.2 Implement `revokeSubAgent` on `AgentOSClient`: build PTB calling `groups.tx.removeMember()` + `agent_delegation::revoke_config`, execute transaction, update registry
- [ ] 5.3 Implement `listSubAgents` on `AgentOSClient`: delegate to registry's `listSubAgents` and map to `SubAgentRecord[]`
- [ ] 5.4 Add subname formatting utility: `buildSubname(parentSuins: string, childName: string) => string` (e.g., `treasury` + `quan.sui` → `treasury.quan.sui`)
- [ ] 5.5 Add error handling: "Parent agent not found" and "Subname already exists" error cases
- [ ] 5.6 Update `tx.createAgent` to also provision a PermissionedGroup and pass its ID to passport create

## Task 6: SDK Property-Based Tests

- [ ] 6.1 Create `packages/sdk/src/delegation.property.test.ts` with fast-check setup
- [ ] 6.2 Implement Property 1 test: group creation on agent setup (random valid inputs → create → verify policy_root is non-zero)
- [ ] 6.3 Implement Property 2 test: permission grant round-trip (grant → isMember check)
- [ ] 6.4 Implement Property 3 test: budget enforcement (random spend sequences → assert budget cap respected)
- [ ] 6.5 Implement Property 4 test: expiry enforcement (random timestamps → assert expired configs rejected)
- [ ] 6.6 Implement Property 5 test: revocation via removeMember (remove → isMember false)
- [ ] 6.7 Implement Property 6 test: delegation attenuation (child budget ≤ parent remaining, child expiry ≤ parent expiry, child permissions ⊆ parent)
- [ ] 6.8 Implement Property 7 test: cascading revocation (revoke parent → all descendants inactive)
- [ ] 6.9 Implement Property 8 test: registry parentSlug correctness
- [ ] 6.10 Implement Property 9 test: listSubAgents returns exactly parent's children
- [ ] 6.11 Implement Property 10 test: subname qualification formatting

## Task 7: SDK Unit Tests

- [ ] 7.1 Create `packages/sdk/src/delegation.test.ts` with example-based tests for delegateSubAgent, revokeSubAgent, listSubAgents
- [ ] 7.2 Test error case: delegateSubAgent with non-existent parent throws "Parent agent not found: {name}"
- [ ] 7.3 Test error case: delegateSubAgent with taken subname throws "Subname already exists: {fullName}"
- [ ] 7.4 Test cascading revocation: revoking a mid-tree node marks all descendants as revoked
- [ ] 7.5 Test sui-groups integration: verify grantPermission/revokePermission calls are composed correctly in PTBs

## Task 8: CLI Delegation Commands

- [ ] 8.1 Add `agent delegate <parent>` command with `--name`, `--permissions`, `--budget`, `--expiry`, `--json`, `--dry-run` options
- [ ] 8.2 Add `agent revoke-sub <parent>` command with `--name` and `--json` options
- [ ] 8.3 Add `agent list-subs <parent>` command with `--json` option, formatted table output (name, permissions, budget, expiry, status)
- [ ] 8.4 Write CLI unit tests in `packages/cli/src/commands/agent-delegate.test.ts` for command parsing, --json output, --dry-run

## Task 9: MCP Delegation Tools

- [ ] 9.1 Register `agentos_delegate_sub_agent` tool with input schema (parentName, subName, permissions[], budget, expiry) and handler calling AgentOSClient
- [ ] 9.2 Register `agentos_revoke_sub_agent` tool with input schema (parentName, subName) and handler
- [ ] 9.3 Register `agentos_list_sub_agents` tool with input schema (parentName) and handler
- [ ] 9.4 Add error handling: invalid parent returns error object with descriptive message
- [ ] 9.5 Write MCP tool tests in `packages/mcp/src/delegation-tools.test.ts`

## Task 10: Frontend Delegation UI

- [ ] 10.1 Create API route `packages/frontend/app/api/agents/[slug]/sub-agents/route.ts` for listing sub-agents (GET) and creating sub-agents (POST)
- [ ] 10.2 Build sub-agent list component displaying name, permissions (as badges), budget (used/cap), expiry date, status badge, and revoke action button
- [ ] 10.3 Build "Create Sub-Agent" dialog with form fields: subname (text), permissions (multi-select from Operator/SkillPublisher/Delegate/BudgetSpender), budget (numeric in SUI), expiry (date picker)
- [ ] 10.4 Implement delegation transaction execution via `@mysten/dapp-kit` `useSignAndExecuteTransaction` hook — composing sui-groups addMembers + agent_delegation createConfig
- [ ] 10.5 Implement revoke flow with confirmation modal and transaction execution (removeMember + revokeConfig)
- [ ] 10.6 Add expired policy handling: "Expired" badge, disabled revoke button
- [ ] 10.7 Replace placeholder content in `packages/frontend/app/agent/[name]/delegate/page.tsx` with the full delegation UI

## Task 11: Hierarchical Delegation (Multi-Level)

- [ ] 11.1 Update `delegateSubAgent` to check parent's group membership for `Delegate` permission before allowing sub-delegation
- [ ] 11.2 Implement attenuation validation in SDK: child budget ≤ parent remaining, child expiry ≤ parent expiry, child permissions ⊆ parent permissions
- [ ] 11.3 Update frontend to display delegation tree (nested list or tree view) showing parent-child relationships
- [ ] 11.4 Write integration test for 3-level delegation: parent → child → grandchild with attenuated permissions

## Task 12: SuiNS Subname Integration

- [ ] 12.1 Add `@mysten/suins` SDK calls into `delegateSubAgent` PTB: create subname under parent name and set target address to runtime wallet
- [ ] 12.2 Store full qualified subname in sub-agent passport's `suins_name` field
- [ ] 12.3 Handle "subname already exists" error from SuiNS SDK with descriptive error message
- [ ] 12.4 Write integration test verifying SuiNS subname creation with mocked SuiNS client
