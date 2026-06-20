# Requirements Document

## Introduction

This feature implements Delegation Subnames and a Policy Module for the SuiNS AgentOS platform. It enables agents to delegate authority to sub-agents identified by SuiNS subnames (e.g., `treasury.quan.sui`, `trader.treasury.quan.sui`), each governed by a Move-level permissions engine enforcing budget caps, expiry timestamps, and capability constraints. The system supports hierarchical delegation trees with full lifecycle management (create, delegate, revoke).

## Glossary

- **Delegation_Tree**: A hierarchical structure of parent-child agent relationships where each node is a sub-agent identified by a SuiNS subname
- **Sub_Agent**: An agent created under a parent agent's namespace with its own permissions, budget, and expiry constraints
- **Policy_Object**: A Move on-chain object storing the permission set, budget cap, expiry timestamp, and active status for a delegated sub-agent
- **Delegation_Policy_Module**: The Move smart contract (`delegation_policy.move`) that manages creation, enforcement, and revocation of Policy_Objects
- **Parent_Agent**: An agent that delegates authority to one or more Sub_Agents within its subname namespace
- **Budget_Cap**: The maximum amount of SUI (in MIST) a Sub_Agent is permitted to spend during its lifetime
- **Capability_Set**: The list of named permissions (strings) granted to a Sub_Agent defining which operations the Sub_Agent may perform
- **Subname**: A SuiNS child name under a parent name (e.g., `treasury` under `quan.sui` yields `treasury.quan.sui`)
- **AgentOS_Client**: The TypeScript SDK class (`AgentOSClient`) providing programmatic access to agent lifecycle operations
- **Local_Registry**: The JSON file (`.agentos/registry.json`) tracking agent and skill records locally
- **CLI**: The Commander.js-based command-line interface (`@agentos/cli`) for agent management
- **MCP_Server**: The Model Context Protocol server (`@agentos/mcp`) exposing agent operations as LLM-callable tools
- **Delegation_Frontend**: The Next.js page at `/agent/[name]/delegate` providing a UI for delegation management

## Requirements

### Requirement 1: Create Delegation Policy Object On-Chain

**User Story:** As an agent owner, I want to create a Policy_Object on-chain for a Sub_Agent, so that the Sub_Agent's permissions are enforced at the Move level.

#### Acceptance Criteria

1. WHEN a Parent_Agent owner calls the `create_policy` entry function with a Capability_Set, Budget_Cap, and expiry timestamp, THE Delegation_Policy_Module SHALL create a new Policy_Object and return its object ID
2. THE Delegation_Policy_Module SHALL store the Capability_Set as a `vector<String>` field in the Policy_Object
3. THE Delegation_Policy_Module SHALL store the Budget_Cap as a `u64` field (MIST units) in the Policy_Object
4. THE Delegation_Policy_Module SHALL store the expiry as a `u64` epoch-millisecond timestamp in the Policy_Object
5. THE Delegation_Policy_Module SHALL set the `is_active` field to `true` upon Policy_Object creation
6. THE Delegation_Policy_Module SHALL record the parent agent's address as the `delegator` field in the Policy_Object
7. IF the expiry timestamp is less than or equal to the current epoch timestamp, THEN THE Delegation_Policy_Module SHALL abort the transaction with error code `E_INVALID_EXPIRY`

### Requirement 2: Enforce Policy Constraints

**User Story:** As an agent owner, I want the policy to enforce budget and capability constraints on sub-agents, so that delegated authority cannot be exceeded.

#### Acceptance Criteria

1. WHEN a Sub_Agent attempts an operation requiring a capability, THE Delegation_Policy_Module SHALL verify that the capability exists in the Policy_Object's Capability_Set before allowing the operation
2. IF a requested capability is not present in the Policy_Object's Capability_Set, THEN THE Delegation_Policy_Module SHALL abort with error code `E_UNAUTHORIZED_CAPABILITY`
3. WHEN a Sub_Agent spends funds, THE Delegation_Policy_Module SHALL track cumulative spend in a `spent` field on the Policy_Object
4. IF cumulative spend plus the requested amount exceeds the Budget_Cap, THEN THE Delegation_Policy_Module SHALL abort with error code `E_BUDGET_EXCEEDED`
5. IF the current epoch timestamp exceeds the Policy_Object's expiry, THEN THE Delegation_Policy_Module SHALL abort with error code `E_POLICY_EXPIRED`
6. THE Delegation_Policy_Module SHALL provide a `check_policy` public function that returns `true` only when all three constraints (capability, budget, expiry) are satisfied

### Requirement 3: Revoke Delegation Policy

**User Story:** As an agent owner, I want to revoke a Sub_Agent's policy, so that the Sub_Agent immediately loses all delegated permissions.

#### Acceptance Criteria

1. WHEN the delegator calls the `revoke_policy` entry function on a Policy_Object, THE Delegation_Policy_Module SHALL set `is_active` to `false`
2. IF a caller other than the delegator attempts to call `revoke_policy`, THEN THE Delegation_Policy_Module SHALL abort with error code `E_NOT_DELEGATOR`
3. WHILE a Policy_Object has `is_active` set to `false`, THE Delegation_Policy_Module SHALL reject all `check_policy` calls with error code `E_POLICY_REVOKED`

### Requirement 4: Link Policy to Agent Passport

**User Story:** As an agent owner, I want the Policy_Object linked to the Sub_Agent's passport, so that the delegation relationship is discoverable on-chain.

#### Acceptance Criteria

1. WHEN a Sub_Agent passport is created with an associated Policy_Object, THE Delegation_Policy_Module SHALL set the passport's `policy_root` field to the Policy_Object's address
2. THE Delegation_Policy_Module SHALL provide a `get_policy` public function that returns a reference to the Policy_Object given a passport reference
3. IF the passport's `policy_root` is `@0x0`, THEN THE Delegation_Policy_Module SHALL treat the agent as having no delegation constraints (root agent)

### Requirement 5: SDK Delegation Methods

**User Story:** As a developer, I want TypeScript SDK methods to create and manage Sub_Agents, so that I can programmatically build delegation trees.

#### Acceptance Criteria

1. WHEN `delegateSubAgent` is called on AgentOS_Client with a valid parent name, SubAgentConfig, and signer, THE AgentOS_Client SHALL create a SuiNS subname under the parent, create a Policy_Object, create a child passport linking to the Policy_Object, and return the child AgentPassport
2. WHEN `delegateSubAgent` is called, THE AgentOS_Client SHALL register the Sub_Agent in the Local_Registry with a `parentSlug` field referencing the Parent_Agent
3. THE AgentOS_Client SHALL provide a `revokeSubAgent` method that revokes the Policy_Object and sets the child passport status to `revoked`
4. THE AgentOS_Client SHALL provide a `listSubAgents` method that returns all Sub_Agents for a given parent name from the Local_Registry
5. IF the parent name does not exist in the Local_Registry, THEN THE AgentOS_Client SHALL throw an error with message "Parent agent not found: {name}"

### Requirement 6: CLI Delegation Commands

**User Story:** As a developer, I want CLI commands to delegate and manage sub-agents from the terminal, so that I can script delegation workflows.

#### Acceptance Criteria

1. WHEN `agentos agent delegate <parent> --name <subname> --permissions <list> --budget <amount> --expiry <timestamp>` is executed, THE CLI SHALL call `delegateSubAgent` on the AgentOS_Client and print the resulting Sub_Agent passport details
2. WHEN `agentos agent revoke-sub <parent> --name <subname>` is executed, THE CLI SHALL call `revokeSubAgent` on the AgentOS_Client and print a confirmation message
3. WHEN `agentos agent list-subs <parent>` is executed, THE CLI SHALL call `listSubAgents` on the AgentOS_Client and print a formatted table of Sub_Agents with their name, permissions, budget, expiry, and status
4. THE CLI SHALL support a `--json` flag on all delegation commands to output structured JSON instead of human-readable text
5. THE CLI SHALL support a `--dry-run` flag on `agent delegate` to print the Move transaction bytes without executing

### Requirement 7: MCP Delegation Tools

**User Story:** As an LLM agent, I want MCP tools for delegation management, so that I can create and manage Sub_Agents through the Model Context Protocol.

#### Acceptance Criteria

1. THE MCP_Server SHALL expose an `agentos_delegate_sub_agent` tool that accepts `parentName`, `subName`, `permissions` (array), `budget` (number), and `expiry` (number) and returns the created Sub_Agent record
2. THE MCP_Server SHALL expose an `agentos_revoke_sub_agent` tool that accepts `parentName` and `subName` and returns a confirmation object
3. THE MCP_Server SHALL expose an `agentos_list_sub_agents` tool that accepts `parentName` and returns an array of Sub_Agent records with their policy status
4. IF any MCP delegation tool receives an invalid parent name, THEN THE MCP_Server SHALL return an error object with a descriptive message

### Requirement 8: Frontend Delegation UI

**User Story:** As an agent owner, I want a web interface to view and manage my Sub_Agents, so that I can delegate authority without using the CLI.

#### Acceptance Criteria

1. WHEN a user navigates to `/agent/[name]/delegate`, THE Delegation_Frontend SHALL display a list of existing Sub_Agents for that agent with their name, permissions, budget remaining, expiry date, and active status
2. WHEN a user clicks "Create Sub-Agent", THE Delegation_Frontend SHALL display a form with fields for subname, permissions (multi-select), budget (numeric input in SUI), and expiry (date picker)
3. WHEN the user submits the delegation form with valid inputs, THE Delegation_Frontend SHALL execute the delegation transaction via dapp-kit and display the new Sub_Agent in the list
4. WHEN a user clicks "Revoke" on a Sub_Agent row, THE Delegation_Frontend SHALL prompt for confirmation and then execute the revoke transaction via dapp-kit
5. IF a Sub_Agent's policy is expired, THEN THE Delegation_Frontend SHALL display an "Expired" badge and disable the Revoke button for that Sub_Agent

### Requirement 9: Hierarchical Delegation (Multi-Level)

**User Story:** As an agent owner, I want Sub_Agents to delegate further to their own Sub_Agents, so that I can build multi-level delegation trees.

#### Acceptance Criteria

1. WHEN a Sub_Agent with the `delegate` capability in its Capability_Set calls `delegateSubAgent`, THE AgentOS_Client SHALL allow creation of a grandchild Sub_Agent under the Sub_Agent's subname
2. THE Delegation_Policy_Module SHALL enforce that a child's Budget_Cap does not exceed the parent's remaining budget (Budget_Cap minus spent)
3. THE Delegation_Policy_Module SHALL enforce that a child's expiry does not exceed the parent's expiry
4. THE Delegation_Policy_Module SHALL enforce that a child's Capability_Set is a subset of the parent's Capability_Set
5. WHEN a parent Policy_Object is revoked, THE Delegation_Policy_Module SHALL recursively mark all descendant Policy_Objects as inactive

### Requirement 10: SuiNS Subname Integration

**User Story:** As a developer, I want delegation to use real SuiNS subnames, so that Sub_Agents are resolvable via the standard SuiNS protocol.

#### Acceptance Criteria

1. WHEN `delegateSubAgent` creates a Sub_Agent, THE AgentOS_Client SHALL call the `@mysten/suins` SDK to create a subname under the parent's SuiNS name
2. THE AgentOS_Client SHALL set the subname's target address to the Sub_Agent's runtime wallet address
3. THE AgentOS_Client SHALL store the full qualified subname (e.g., `treasury.quan.sui`) in the Sub_Agent's passport `suins_name` field
4. IF subname creation fails due to the name already being taken, THEN THE AgentOS_Client SHALL throw an error with message "Subname already exists: {fullName}"
