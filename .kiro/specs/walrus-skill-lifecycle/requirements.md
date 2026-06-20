# Requirements Document

## Introduction

This feature implements the full end-to-end Skill Lifecycle for SuiNS AgentOS: uploading skill manifests to Walrus via the Harbor API, registering SkillDescriptor objects on-chain with linked SuiNS subnames, and enabling agents to resolve, download, and execute skills by name. The system replaces the current local-only registry flow with a decentralized pipeline where skills are stored on Walrus, referenced on-chain, and executable through Programmable Transaction Blocks (PTBs). Private skills are gated by Seal encryption with sui-groups membership checks.

## Glossary

- **Harbor_API**: The Walrus storage gateway at `https://api.testnet.harbor.walrus.xyz` used to upload and download blobs via REST endpoints
- **Harbor_API_Key**: An authentication token (prefixed `hbr_`) stored in `.agentos/config.json` or the `HARBOR_API_KEY` environment variable
- **Walrus_Blob**: A content-addressable storage object on the Walrus network identified by a unique `blobId`
- **Skill_Manifest**: A JSON document conforming to the `sui-agent-skill/v1` schema describing a skill's name, version, publisher, MCP tools, Move entry point, policy requirements, and dependencies
- **SkillDescriptor**: A Move on-chain object linking a skill's identity to its Walrus blob, manifest hash, MVR package name, version, required capabilities, and dependencies
- **Manifest_Hash**: A SHA-256 digest of the Skill_Manifest JSON used to verify integrity after download
- **Upload_Pipeline**: The sequence of operations that uploads a Skill_Manifest to Walrus and creates or updates a SkillDescriptor on-chain
- **Execution_Pipeline**: The sequence of operations that resolves a skill by SuiNS name, downloads its manifest from Walrus, builds a PTB, and executes it on-chain
- **SuiNS_Skill_Subname**: A SuiNS child name under an agent's namespace that resolves to a SkillDescriptor object (e.g., `trade.alpha-agent.sui`)
- **PTB**: A Programmable Transaction Block on the Sui network that composes multiple Move calls into a single atomic transaction
- **Dependency_Tree**: The directed acyclic graph of skill dependencies that must be resolved before execution
- **Seal_Encryption**: The Mysten Seal protocol used to encrypt private skill manifests, requiring group membership verification before decryption
- **Sui_Groups**: The on-chain group membership primitive used by Seal to gate access to private skill blobs
- **AgentOS_Client**: The TypeScript SDK class (`AgentOSClient`) providing programmatic access to skill lifecycle operations
- **Local_Registry**: The JSON file (`.agentos/registry.json`) tracking agent and skill records locally
- **CLI**: The Commander.js-based command-line interface (`@agentos/cli`) for skill management
- **MCP_Server**: The Model Context Protocol server (`@agentos/mcp`) exposing skill operations as LLM-callable tools
- **MVR_Package_Name**: The Move Verified Registry human-readable name for a Move package (e.g., `@org/pkg`)
- **Skill_Frontend**: The Next.js page at `/agent/[name]/skills` displaying skill metadata and dependency graphs

## Requirements

### Requirement 1: Upload Skill Manifest to Walrus

**User Story:** As a skill developer, I want to upload my skill manifest to Walrus via Harbor, so that the manifest is stored on decentralized storage and accessible by any agent.

#### Acceptance Criteria

1. WHEN `uploadManifest` is called on AgentOS_Client with a valid `bucketId` and Skill_Manifest, THE AgentOS_Client SHALL serialize the Skill_Manifest to JSON, POST it to `Harbor_API /api/v1/spaces/{spaceId}/buckets/{bucketId}/files` using the Harbor_API_Key, and return the resulting `blobId`
2. THE AgentOS_Client SHALL compute a SHA-256 Manifest_Hash of the serialized JSON before upload and include the hash in the returned result
3. IF the Harbor_API returns a non-2xx HTTP status, THEN THE AgentOS_Client SHALL throw an error with message "Walrus upload failed: {statusCode} {responseBody}"
4. IF no Harbor_API_Key is configured in `.agentos/config.json` or `HARBOR_API_KEY` environment variable, THEN THE AgentOS_Client SHALL throw an error with message "Harbor API key not configured. Set HARBOR_API_KEY or add harborApiKey to .agentos/config.json"
5. THE AgentOS_Client SHALL validate that the Skill_Manifest's `manifestType` field equals `sui-agent-skill/v1` before upload
6. IF the `manifestType` field is not `sui-agent-skill/v1`, THEN THE AgentOS_Client SHALL throw an error with message "Invalid manifestType: {value}. Expected sui-agent-skill/v1"

### Requirement 2: Create SkillDescriptor On-Chain

**User Story:** As a skill developer, I want to register my skill on-chain after uploading to Walrus, so that the skill is discoverable and verifiable via Sui.

#### Acceptance Criteria

1. WHEN `publishSkill` is called with a signer, Skill_Manifest, bucketId, and agentName, THE AgentOS_Client SHALL first upload the manifest to Walrus, then execute a Move transaction calling `skill_descriptor::create` with the resulting blobId, Manifest_Hash, skill name, MVR_Package_Name, and version
2. THE AgentOS_Client SHALL set the SkillDescriptor's `walrus_manifest_blob` field to the blobId returned by the Harbor_API upload
3. THE AgentOS_Client SHALL set the SkillDescriptor's `manifest_hash` field to the SHA-256 digest of the uploaded manifest JSON
4. THE AgentOS_Client SHALL set the SkillDescriptor's `dependencies` field to the Skill_Manifest's `dependencies` array encoded as `vector<vector<u8>>`
5. WHEN the on-chain transaction succeeds, THE AgentOS_Client SHALL update the Local_Registry with the new skill record including the SkillDescriptor object ID, blobId, and manifest hash
6. IF the on-chain transaction fails, THEN THE AgentOS_Client SHALL throw an error with message "On-chain registration failed: {errorDetails}"

### Requirement 3: Update SkillDescriptor (Upgrade Flow)

**User Story:** As a skill developer, I want to update an existing skill's manifest, so that I can publish new versions without losing the skill's identity and SuiNS binding.

#### Acceptance Criteria

1. THE SkillDescriptor Move module SHALL provide an `update` entry function that accepts a mutable reference to an existing SkillDescriptor and new values for `walrus_manifest_blob`, `manifest_hash`, and `version`
2. WHEN the `update` function is called, THE SkillDescriptor module SHALL overwrite the `walrus_manifest_blob`, `manifest_hash`, and `version` fields with the provided values
3. WHEN `publishSkill` is called for a skill that already has a SkillDescriptor object ID in the Local_Registry, THE AgentOS_Client SHALL upload the new manifest to Walrus and call `update` on the existing SkillDescriptor instead of creating a new one
4. THE SkillDescriptor module SHALL only allow the object owner to call `update`
5. IF a non-owner attempts to call `update`, THEN THE SkillDescriptor module SHALL abort the transaction with error code `E_NOT_OWNER`

### Requirement 4: SuiNS Subname Per Skill

**User Story:** As a skill developer, I want each skill to have a SuiNS subname under my agent's namespace, so that other agents can resolve skills by human-readable names.

#### Acceptance Criteria

1. WHEN a new SkillDescriptor is created via `publishSkill`, THE AgentOS_Client SHALL create a SuiNS subname `{skillName}.{agentName}.sui` pointing to the SkillDescriptor object address
2. WHEN a SkillDescriptor is updated (upgrade flow), THE AgentOS_Client SHALL retain the existing SuiNS subname binding without modification
3. IF the SuiNS subname already exists and points to a different object, THEN THE AgentOS_Client SHALL throw an error with message "Skill subname already bound to different descriptor: {subname}"
4. THE AgentOS_Client SHALL store the full qualified SuiNS_Skill_Subname in the Local_Registry skill record

### Requirement 5: Resolve Skill by SuiNS Name

**User Story:** As an agent, I want to resolve a skill by its SuiNS subname, so that I can discover and fetch skill metadata without knowing the on-chain object ID.

#### Acceptance Criteria

1. WHEN `resolveSkill` is called with a SuiNS_Skill_Subname (e.g., `trade.alpha-agent.sui`), THE AgentOS_Client SHALL resolve the SuiNS name to the SkillDescriptor object address using the Sui client
2. WHEN the SkillDescriptor address is resolved, THE AgentOS_Client SHALL fetch the SkillDescriptor object fields from on-chain and return a populated SkillDescriptor interface
3. IF the SuiNS name does not resolve to any address, THEN THE AgentOS_Client SHALL throw an error with message "Skill not found: {suinsName}"
4. IF the resolved object is not a valid SkillDescriptor, THEN THE AgentOS_Client SHALL throw an error with message "Invalid SkillDescriptor at {address}"

### Requirement 6: Download Manifest from Walrus

**User Story:** As an agent, I want to download a skill manifest from Walrus given a blobId, so that I can inspect the skill's entry point, parameters, and dependencies.

#### Acceptance Criteria

1. WHEN `downloadManifest` is called with a `blobId`, THE AgentOS_Client SHALL fetch the blob content from the Harbor_API or Walrus aggregator and parse it as JSON into a Skill_Manifest object
2. THE AgentOS_Client SHALL compute the SHA-256 hash of the downloaded content and compare it against the expected Manifest_Hash from the SkillDescriptor
3. IF the computed hash does not match the expected Manifest_Hash, THEN THE AgentOS_Client SHALL throw an error with message "Manifest integrity check failed: expected {expected}, got {actual}"
4. IF the blob is not found on Walrus, THEN THE AgentOS_Client SHALL throw an error with message "Manifest blob not found: {blobId}"
5. FOR ALL valid Skill_Manifest objects, downloading then re-uploading SHALL produce a blob whose hash matches the original Manifest_Hash (round-trip property)

### Requirement 7: Build and Execute PTB from Manifest

**User Story:** As an agent, I want to execute a skill by building a PTB from its manifest, so that I can invoke on-chain skill logic without manually constructing transactions.

#### Acceptance Criteria

1. WHEN `executeSkill` is called with a Skill_Manifest and transaction parameters, THE AgentOS_Client SHALL construct a PTB that calls the Move function specified by `sui.movePackage` and `sui.entry` with the provided parameters
2. THE AgentOS_Client SHALL resolve all skill dependencies in the Dependency_Tree before constructing the primary skill's PTB
3. IF a dependency cannot be resolved (SuiNS name not found or manifest download fails), THEN THE AgentOS_Client SHALL throw an error with message "Failed to resolve dependency: {dependencyName}"
4. WHEN the Skill_Manifest's `sui.policyRequired` array is non-empty, THE AgentOS_Client SHALL verify that the executing agent's passport has the required capabilities before building the PTB
5. IF the executing agent lacks a required policy capability, THEN THE AgentOS_Client SHALL throw an error with message "Missing required capability: {capability}"
6. WHEN the PTB is executed successfully, THE AgentOS_Client SHALL return the transaction digest and execution effects

### Requirement 8: Dependency Resolution

**User Story:** As a skill developer, I want to declare dependencies in my manifest, so that required skills are automatically resolved and available during execution.

#### Acceptance Criteria

1. THE Skill_Manifest SHALL declare dependencies as an array of SuiNS_Skill_Subnames in the `dependencies` field
2. WHEN executing a skill with dependencies, THE AgentOS_Client SHALL recursively resolve each dependency's SuiNS subname to a SkillDescriptor and download its manifest
3. IF a circular dependency is detected in the Dependency_Tree, THEN THE AgentOS_Client SHALL throw an error with message "Circular dependency detected: {cycle}"
4. THE AgentOS_Client SHALL resolve dependencies in topological order so that a dependency is resolved before any skill that depends on it
5. THE SkillDescriptor on-chain `dependencies` field SHALL store the SuiNS_Skill_Subnames of all direct dependencies

### Requirement 9: Private Skill Access Control

**User Story:** As a skill developer, I want to restrict access to my skill manifest using Seal encryption, so that only authorized group members can download and execute the skill.

#### Acceptance Criteria

1. WHEN `uploadManifest` is called with a `sealPolicyId` option, THE AgentOS_Client SHALL encrypt the manifest JSON using Seal before uploading the encrypted blob to Walrus
2. WHEN `downloadManifest` is called with a `sealPolicyId` parameter, THE AgentOS_Client SHALL perform a Seal decryption using the caller's group membership proof before returning the manifest
3. IF the caller is not a member of the Sui_Groups group referenced by the seal policy, THEN THE AgentOS_Client SHALL throw an error with message "Access denied: not a member of group {groupId}"
4. THE SkillDescriptor on-chain object SHALL include a `seal_policy_id` field that is empty for public skills and set to the policy object address for private skills
5. WHEN resolving a SkillDescriptor with a non-empty `seal_policy_id`, THE AgentOS_Client SHALL indicate to the caller that decryption credentials are required

### Requirement 10: CLI Skill Publish Command (Walrus + On-Chain)

**User Story:** As a developer, I want the `agentos skill publish` CLI command to upload to Walrus and register on-chain, so that publishing a skill is a single command.

#### Acceptance Criteria

1. WHEN `agentos skill publish <file> --agent <name>` is executed without `--dry-run`, THE CLI SHALL upload the manifest to Walrus via Harbor_API and create a SkillDescriptor on-chain in a single operation
2. THE CLI SHALL print the resulting blobId, Manifest_Hash, SkillDescriptor object ID, and SuiNS_Skill_Subname after successful publish
3. WHEN `--dry-run` is specified, THE CLI SHALL print the serialized transaction bytes and Walrus upload parameters without executing
4. THE CLI SHALL read the Harbor_API_Key from `HARBOR_API_KEY` environment variable or `.agentos/config.json` `harborApiKey` field
5. IF neither the environment variable nor config field provides a Harbor_API_Key, THEN THE CLI SHALL exit with error message "Harbor API key not configured. Set HARBOR_API_KEY or add harborApiKey to .agentos/config.json"
6. THE CLI SHALL support a `--private` flag that triggers Seal encryption before upload and sets the `seal_policy_id` on the SkillDescriptor

### Requirement 11: CLI Skill Execute Command

**User Story:** As a developer, I want a CLI command to resolve and execute a skill by name, so that I can test skill execution from the terminal.

#### Acceptance Criteria

1. WHEN `agentos skill execute <suinsName>` is executed, THE CLI SHALL resolve the SuiNS_Skill_Subname, download the manifest from Walrus, build a PTB, and execute it on-chain
2. THE CLI SHALL accept `--params <json>` to provide parameters for the skill's entry function
3. THE CLI SHALL print the transaction digest and execution effects after successful execution
4. WHEN `--dry-run` is specified, THE CLI SHALL build the PTB and print the serialized transaction bytes without executing
5. IF the skill has dependencies, THEN THE CLI SHALL resolve all dependencies before execution and print the dependency resolution order
6. THE CLI SHALL support `--json` flag for structured JSON output of all execution results

### Requirement 12: CLI Skill Resolve Command

**User Story:** As a developer, I want a CLI command to resolve a skill and display its metadata, so that I can inspect skills without executing them.

#### Acceptance Criteria

1. WHEN `agentos skill resolve <suinsName>` is executed, THE CLI SHALL resolve the SuiNS_Skill_Subname to its SkillDescriptor and print the descriptor fields (skillId, blobId, hash, version, dependencies)
2. WHEN `--manifest` flag is provided, THE CLI SHALL also download and print the full Skill_Manifest JSON from Walrus
3. THE CLI SHALL support `--json` flag for structured JSON output
4. IF the SuiNS name does not resolve, THEN THE CLI SHALL exit with error message "Skill not found: {suinsName}"

### Requirement 13: MCP Publish Skill Tool (Walrus + On-Chain)

**User Story:** As an LLM agent, I want an MCP tool to publish skills to Walrus and on-chain, so that I can publish skills through the Model Context Protocol.

#### Acceptance Criteria

1. THE MCP_Server SHALL expose an `agentos_publish_skill` tool that accepts `agentName`, `manifestJson`, and optional `walrusBlob` parameters, uploads the manifest to Walrus when `walrusBlob` is not provided, creates a SkillDescriptor on-chain, and returns the resulting skill record including blobId and object ID
2. IF `walrusBlob` is provided, THEN THE MCP_Server SHALL skip the Walrus upload and use the provided blobId directly for the SkillDescriptor
3. IF the Harbor_API_Key is not configured, THEN THE MCP_Server SHALL return an error object with message "Harbor API key not configured"
4. THE MCP_Server SHALL validate that `manifestJson` parses to a valid `sui-agent-skill/v1` manifest before proceeding

### Requirement 14: MCP Execute Skill Tool

**User Story:** As an LLM agent, I want an MCP tool to resolve and execute skills by name, so that I can invoke skills through the Model Context Protocol.

#### Acceptance Criteria

1. THE MCP_Server SHALL expose an `agentos_execute_skill` tool that accepts `suinsName` and optional `params` (JSON string), resolves the skill, downloads the manifest, builds a PTB, executes it, and returns the transaction digest and effects
2. THE MCP_Server SHALL expose an `agentos_resolve_manifest` tool that accepts `suinsName`, resolves the SkillDescriptor, downloads the manifest from Walrus, and returns the parsed Skill_Manifest JSON
3. IF the skill requires capabilities the agent does not have, THEN THE MCP_Server SHALL return an error object with message "Missing required capability: {capability}"
4. IF dependency resolution fails, THEN THE MCP_Server SHALL return an error object listing which dependencies could not be resolved

### Requirement 15: Frontend Skill Display

**User Story:** As an agent owner, I want the dashboard to show real Walrus blob links and a dependency graph for my skills, so that I can verify deployment status visually.

#### Acceptance Criteria

1. WHEN a user navigates to `/agent/[name]/skills`, THE Skill_Frontend SHALL display each skill's name, version, blobId as a clickable Walrus explorer link, SkillDescriptor object ID as a clickable Sui explorer link, and status
2. THE Skill_Frontend SHALL render a visual dependency graph showing relationships between skills using the `dependencies` field from each SkillDescriptor
3. WHEN a skill has a non-empty `seal_policy_id`, THE Skill_Frontend SHALL display a "Private" badge and the associated group name
4. THE Skill_Frontend SHALL provide a "Publish Upgrade" button that triggers the upgrade flow (new manifest upload + SkillDescriptor update) via dapp-kit wallet transaction
5. IF a skill's Walrus blob is unreachable, THEN THE Skill_Frontend SHALL display a warning indicator with message "Manifest blob unavailable"
