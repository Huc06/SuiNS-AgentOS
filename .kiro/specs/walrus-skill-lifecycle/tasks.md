# Tasks: Walrus Skill Lifecycle (Upload + Execute Pipeline)

## Task 1: Move Contract — Add `update` Entry Function + `seal_policy_id` Field

- [x] 1.1 Add `seal_policy_id: vector<u8>` field to the `SkillDescriptor` struct in `packages/contracts/sources/skill_descriptor.move`, initialized to empty vector in `create`
- [x] 1.2 Add `E_NOT_OWNER` error constant (value 1) to the module
- [x] 1.3 Implement `update` entry function that accepts `&mut SkillDescriptor`, new `walrus_manifest_blob`, `manifest_hash`, `version`, and `&TxContext`; assert sender == object owner (abort `E_NOT_OWNER` otherwise); overwrite the three fields
- [x] 1.4 Add `set_seal_policy` entry function that sets `seal_policy_id` on a SkillDescriptor (owner-only)
- [x] 1.5 Add `set_dependencies` entry function that sets `dependencies` field (owner-only)
- [x] 1.6 Write Move unit tests in `packages/contracts/tests/skill_descriptor_tests.move` covering: create with defaults, update success, update non-owner aborts, set_seal_policy, set_dependencies
- [x] 1.7 Verify `sui move build` and `sui move test` pass

## Task 2: SDK — Manifest Utilities (`packages/sdk/src/manifest.ts`)

- [x] 2.1 Create `packages/sdk/src/manifest.ts` exporting `serializeManifest(manifest: SkillManifest): Uint8Array` (deterministic JSON serialization with sorted keys)
- [x] 2.2 Implement `deserializeManifest(data: Uint8Array): SkillManifest` with JSON parse and schema validation
- [x] 2.3 Implement `computeManifestHash(data: Uint8Array): string` returning hex-encoded SHA-256 using Web Crypto API (node:crypto fallback)
- [x] 2.4 Implement `validateManifest(manifest: SkillManifest): void` that throws if `manifestType !== 'sui-agent-skill/v1'` or required fields missing
- [x] 2.5 Export all functions from `packages/sdk/src/index.ts`

## Task 3: SDK — Harbor Client (`packages/sdk/src/harbor.ts`)

- [x] 3.1 Create `packages/sdk/src/harbor.ts` with `HarborClient` class accepting `{ apiKey, baseUrl? }` options
- [x] 3.2 Implement `uploadBlob(spaceId, bucketId, content: Uint8Array, filename)` that POSTs to `/api/v1/spaces/{spaceId}/buckets/{bucketId}/files` with Bearer auth and returns `{ blobId }`
- [x] 3.3 Implement `downloadBlob(blobId)` that GETs the blob content and returns `Uint8Array`
- [x] 3.4 Implement error handling: throw `"Walrus upload failed: {status} {body}"` on non-2xx, throw `"Manifest blob not found: {blobId}"` on 404
- [x] 3.5 Implement `getApiKey()` static helper that reads from `HARBOR_API_KEY` env or config, throws `"Harbor API key not configured..."` if neither exists
- [x] 3.6 Export `HarborClient` and types from `packages/sdk/src/index.ts`

## Task 4: SDK — Dependency Resolver (`packages/sdk/src/dependency-resolver.ts`)

- [x] 4.1 Create `packages/sdk/src/dependency-resolver.ts` with `DependencyResolver` class
- [x] 4.2 Implement `detectCycle(adjacencyList: Map<string, string[]>): string[] | null` using DFS with coloring (white/gray/black); return cycle path or null
- [x] 4.3 Implement `topologicalSort(adjacencyList: Map<string, string[]>): string[]` using Kahn's algorithm or reverse post-order DFS
- [x] 4.4 Implement `resolve(manifest: SkillManifest): Promise<ResolvedDependency[]>` that recursively resolves SuiNS names, builds adjacency list, checks for cycles, returns topologically ordered dependencies
- [x] 4.5 Handle error cases: throw `"Circular dependency detected: {cycle}"` with formatted cycle path, throw `"Failed to resolve dependency: {name}"` on resolution failure
- [x] 4.6 Export from `packages/sdk/src/index.ts`

## Task 5: SDK — Update Contract Bindings

- [x] 5.1 Add `update` function to `packages/sdk/src/contracts/skill_descriptor.ts` that builds a Move call to `skill_descriptor::update` with encoded arguments
- [x] 5.2 Add `setSealPolicy` function for setting seal_policy_id
- [x] 5.3 Add `setDependencies` function for setting dependencies
- [x] 5.4 Update `AgentOSClient.tx` object to include `updateSkillDescriptor` builder
- [x] 5.5 Update `AgentOSClient.call` object to include new contract functions

## Task 6: SDK — Update Types + SkillDescriptor

- [x] 6.1 Add `sealPolicyId?: string` field to `SkillDescriptor` interface in `packages/sdk/src/types.ts`
- [x] 6.2 Add `suinsName?: string` and `sealPolicyId?: string` to the local registry skill record type
- [x] 6.3 Update `descriptorFromRecord` helper to map the new fields

## Task 7: SDK — AgentOSClient Lifecycle Methods

- [x] 7.1 Implement `uploadManifest(bucketId, manifest, options?)`: validate manifest, serialize, compute hash, optionally Seal-encrypt, call HarborClient.uploadBlob, return `{ blobId, manifestHash }`
- [x] 7.2 Implement `downloadManifest(blobId, expectedHash, options?)`: call HarborClient.downloadBlob, optionally Seal-decrypt, compute hash, verify against expectedHash, deserialize, return SkillManifest
- [x] 7.3 Implement `resolveSkill(suinsName)`: resolve SuiNS name via Sui client, fetch object fields, validate SkillDescriptor shape, return populated interface
- [x] 7.4 Implement `publishSkill(options)`: orchestrate upload → build PTB (create or update based on registry lookup) → execute → update local registry → return SkillDescriptor
- [x] 7.5 Implement `executeSkill(options)`: resolve skill → download manifest → resolve dependencies → verify capabilities → build PTB → execute → return digest + effects
- [x] 7.6 Implement SuiNS subname creation in publishSkill flow: format `{skillName}.{agentName}.sui`, create subname pointing to SkillDescriptor object

## Task 8: SDK — Subname Formatting Utility

- [x] 8.1 Create `packages/sdk/src/suins-utils.ts` with `formatSkillSubname(skillName: string, agentName: string): string` that produces `{skill}.{agent}.sui` (handling cases where agent already ends with `.sui`)
- [x] 8.2 Export from SDK index

## Task 9: SDK — Property-Based Tests

- [x] 9.1 Create `packages/sdk/src/manifest.property.test.ts` with fast-check setup
- [x] 9.2 Implement Property 1 test: manifest serialization round-trip (generate random valid manifests → serialize → deserialize → deep equal; hash consistency across repeated serializations)
- [x] 9.3 Implement Property 2 test: manifestType validation (generate random strings → validateManifest accepts only 'sui-agent-skill/v1')
- [x] 9.4 Implement Property 3 test: dependency encoding round-trip (generate random UTF-8 string arrays → encode to vector<vector<u8>> → decode → equal)
- [x] 9.5 Create `packages/sdk/src/dependency-resolver.property.test.ts`
- [x] 9.6 Implement Property 6 test: topological sort (generate random DAGs → sort → verify all edges go from earlier to later in output)
- [x] 9.7 Implement Property 7 test: cycle detection (generate random graphs with/without cycles → verify correct detection)
- [x] 9.8 Create `packages/sdk/src/skill-lifecycle.property.test.ts`
- [x] 9.9 Implement Property 4 test: publish registry correctness (generate random manifests → mock publish → verify registry record fields match)
- [x] 9.10 Implement Property 8 test: capability gate (generate random policy arrays and capability sets → verify P ⊆ C iff execution allowed)
- [x] 9.11 Implement Property 9 test: PTB construction (generate random manifests → build PTB → verify target matches manifest fields)
- [x] 9.12 Implement Property 10 test: subname formatting (generate random skill/agent names → verify correct qualified subname)

## Task 10: SDK — Unit Tests

- [x] 10.1 Create `packages/sdk/src/harbor.test.ts` with mocked fetch: upload success, upload non-2xx error, download success, download 404, missing API key
- [x] 10.2 Create `packages/sdk/src/manifest.test.ts` with example-based tests: valid manifest, invalid manifestType, missing fields, hash computation
- [x] 10.3 Create `packages/sdk/src/dependency-resolver.test.ts` with example tests: empty deps, linear chain, diamond graph, cycle graph, single-node
- [x] 10.4 Create `packages/sdk/src/skill-lifecycle.test.ts` with mocked client: publishSkill creates new, publishSkill updates existing, resolveSkill success/error, executeSkill with capabilities

## Task 11: CLI — Skill Publish Command (Walrus + On-Chain)

- [x] 11.1 Refactor `packages/cli/src/commands/skill.ts` publish command to use `AgentOSClient.publishSkill` when Harbor API key is available (fall back to local-only when no key)
- [x] 11.2 Print blobId, manifestHash, SkillDescriptor object ID, and SuiNS subname on successful publish
- [x] 11.3 Add `--private` flag that passes `sealPolicyId` option to publishSkill
- [x] 11.4 Update `--dry-run` to show Walrus upload parameters and serialized PTB bytes without executing
- [x] 11.5 Ensure `--json` output includes all fields: `{ blobId, manifestHash, objectId, suinsName }`

## Task 12: CLI — Skill Execute Command

- [x] 12.1 Add `skill execute <suinsName>` command to `packages/cli/src/commands/skill.ts`
- [x] 12.2 Implement execution flow: resolve → download → resolve deps → build PTB → execute
- [x] 12.3 Add `--params <json>` option for providing entry function parameters
- [x] 12.4 Add `--dry-run` flag that builds PTB and prints serialized transaction bytes
- [x] 12.5 Add `--json` flag for structured output of digest and effects
- [x] 12.6 Print dependency resolution order when dependencies exist

## Task 13: CLI — Skill Resolve Command

- [x] 13.1 Add `skill resolve <suinsName>` command to `packages/cli/src/commands/skill.ts`
- [x] 13.2 Print SkillDescriptor fields: skillId, blobId, hash, version, dependencies, sealPolicyId
- [x] 13.3 Add `--manifest` flag that downloads and prints the full SkillManifest JSON
- [x] 13.4 Add `--json` flag for structured output

## Task 14: CLI — Tests

- [x] 14.1 Create `packages/cli/src/commands/skill.test.ts` with unit tests for publish command parsing, --dry-run output, --json output, --private flag
- [x] 14.2 Add tests for execute command: --params parsing, --dry-run, --json, dependency order output
- [x] 14.3 Add tests for resolve command: default output, --manifest, --json, error cases

## Task 15: MCP — Publish Skill Tool (Walrus + On-Chain)

- [x] 15.1 Update `agentos_publish_skill` tool in `packages/mcp/src/server.ts` to call `AgentOSClient.publishSkill` (upload to Walrus + on-chain) when Harbor API key is configured
- [x] 15.2 If `walrusBlob` parameter is provided, skip upload and use provided blobId directly
- [x] 15.3 Return structured result: `{ blobId, objectId, suinsName, manifestHash }`
- [x] 15.4 Add input validation: parse manifestJson, verify `sui-agent-skill/v1` type
- [x] 15.5 Return error object if Harbor API key not configured

## Task 16: MCP — Execute + Resolve Skill Tools

- [x] 16.1 Register `agentos_execute_skill` tool with input schema `{ suinsName: string, params?: string }` and handler that calls `AgentOSClient.executeSkill`
- [x] 16.2 Return `{ digest, effects }` on success, `{ error }` on failure (capability missing, dependency unresolved)
- [x] 16.3 Register `agentos_resolve_manifest` tool with input schema `{ suinsName: string }` and handler that resolves descriptor + downloads manifest
- [x] 16.4 Return `{ descriptor, manifest }` on success

## Task 17: MCP — Tests

- [x] 17.1 Create `packages/mcp/src/skill-tools.test.ts` with tests for agentos_publish_skill (success, missing key, invalid manifest)
- [x] 17.2 Add tests for agentos_execute_skill (success, missing capability, dependency error)
- [x] 17.3 Add tests for agentos_resolve_manifest (success, not found)

## Task 18: Frontend — Skill Display with Walrus Links + Dependency Graph

- [x] 18.1 Update `packages/frontend/app/agent/[name]/skills/page.tsx` to fetch skills from registry/API and display as card list
- [x] 18.2 Render each skill with: name, version, blobId as clickable Walrus explorer link, objectId as Sui explorer link, status badge
- [x] 18.3 Add "Private" badge with group name for skills with non-empty `sealPolicyId`
- [x] 18.4 Create dependency graph visualization component using SVG/Canvas DAG rendering (or integrate a library like `dagre`/`reactflow`)
- [x] 18.5 Add "Publish Upgrade" button that triggers manifest upload + SkillDescriptor update via `@mysten/dapp-kit` `useSignAndExecuteTransaction`
- [x] 18.6 Add warning indicator for unreachable Walrus blobs (fetch blob HEAD, show "Manifest blob unavailable" if 404)

## Task 19: SDK — Private Skill (Seal Encryption) Integration

- [x] 19.1 Create `packages/sdk/src/seal.ts` with `sealEncrypt(data: Uint8Array, policyId: string): Promise<Uint8Array>` and `sealDecrypt(data: Uint8Array, policyId: string, membershipProof: unknown): Promise<Uint8Array>`
- [x] 19.2 Integrate Seal encrypt into `uploadManifest` when `sealPolicyId` option is provided
- [x] 19.3 Integrate Seal decrypt into `downloadManifest` when `sealPolicyId` option is provided
- [x] 19.4 Add access denial error: throw `"Access denied: not a member of group {groupId}"` when decryption fails due to membership
- [x] 19.5 Update `resolveSkill` to include `sealPolicyId` in returned descriptor and indicate decryption required

## Task 20: Integration Tests

- [x] 20.1 Create `packages/sdk/src/skill-lifecycle.integration.test.ts` testing full publish → resolve → download → execute flow with mocked Harbor + Sui client
- [x] 20.2 Test upgrade flow: publish v1, then publish v2 of same skill, verify update path taken
- [x] 20.3 Test dependency resolution flow: publish skill with deps, execute, verify topological order
- [x] 20.4 Test private skill flow: encrypt → upload → download → decrypt with mocked Seal

## Task 21: SDK — Sui Agent Skills Parser (SKILL.md → AgentOS Manifest)

- [x] 21.1 Create `packages/sdk/src/skill-md-parser.ts` with `parseSkillMd(content: string): SkillMdMetadata` that extracts frontmatter (name, description, version, tags) and instruction body from SKILL.md format
- [x] 21.2 Implement `convertToAgentOSManifest(metadata: SkillMdMetadata, options: { publisher: string, movePackage?: string }): SkillManifest` that converts SKILL.md metadata into `sui-agent-skill/v1` format, mapping description to MCP tool definition, and setting `sui.entry` based on available scripts
- [x] 21.3 Implement `scanSkillsDirectory(dirPath: string): SkillMdMetadata[]` that recursively finds all SKILL.md files in `.agents/skills/` and `~/.agents/skills/` directories
- [x] 21.4 Handle partial conversion: if SKILL.md has no Move package reference, generate manifest with `sui.movePackage: ""` and `sui.entry: ""` (instruction-only skill — agent uses instructions directly, no PTB execution)
- [x] 21.5 Export parser and converter from `packages/sdk/src/index.ts`
- [x] 21.6 Write unit tests in `packages/sdk/src/skill-md-parser.test.ts` covering: valid SKILL.md parse, missing frontmatter fields, conversion to manifest, instruction-only vs Move-backed skills

## Task 22: CLI — Skill Import Command (Sui Agent Skills → AgentOS)

- [x] 22.1 Add `skill import <name-or-path>` command to `packages/cli/src/commands/skill.ts` that imports a Sui Agent Skill (SKILL.md) into AgentOS registry
- [x] 22.2 Implement `--from-sui-skills` flag: run `npx skills add mystenlabs/skills --skill <name>` to download the skill, then parse and convert the resulting SKILL.md
- [x] 22.3 Implement path-based import: `agentos skill import ./path/to/SKILL.md --agent alpha.sui` for local SKILL.md files
- [x] 22.4 After conversion, call `AgentOSClient.publishSkill` to upload to Walrus + register on-chain (same pipeline as custom skills)
- [x] 22.5 Print result: skill name, converted manifest summary, blobId, SuiNS subname
- [ ] 22.6 Add `--dry-run` flag that shows the converted manifest JSON without publishing
- [x] 22.7 Add `--json` flag for structured output

## Task 23: CLI — Skill Scan Command (Bulk Import)

- [x] 23.1 Add `skill scan --agent <name>` command that scans `.agents/skills/` and `~/.agents/skills/` directories for all SKILL.md files
- [x] 23.2 For each discovered skill: parse → convert → check if already in registry (by name) → skip if exists, publish if new
- [x] 23.3 Print summary: N skills found, M new, K skipped (already registered)
- [x] 23.4 Add `--force` flag to re-publish even if already registered (triggers upgrade flow)
- [x] 23.5 Add `--json` flag for structured output

## Task 24: SDK — Suiperpower Integration Bridge

- [x] 24.1 Create `packages/sdk/src/suiperpower.ts` with `parseSuiperpowerOutput(outputDir: string): SuiperpowerBuildResult` that reads Suiperpower build artifacts (packageId, skill.manifest.json, optional Walrus blobId)
- [x] 24.2 Implement `buildManifestFromSuperpowerOutput(result: SuiperpowerBuildResult, options: { agentName: string }): SkillManifest` that assembles a full `sui-agent-skill/v1` manifest from Suiperpower's output — filling `sui.movePackage` with packageId, `publisher` with agent name
- [x] 24.3 Implement `detectSuperpowerProject(cwd: string): boolean` that checks for `.suiperpower/` directory or `suiperpower.config.*` file indicating a Suiperpower workspace
- [x] 24.4 Export from `packages/sdk/src/index.ts`
- [x] 24.5 Write unit tests in `packages/sdk/src/suiperpower.test.ts` covering: parse build output, generate manifest, detect project

## Task 25: CLI — Suiperpower Post-Build Publish Flow

- [x] 25.1 Update `skill publish` to auto-detect Suiperpower project: if `detectSuperpowerProject()` is true and no manifest file argument given, read from Suiperpower output directory and assemble manifest automatically
- [x] 25.2 Add `--from-suiperpower [outputDir]` flag to explicitly specify Suiperpower build output directory (defaults to `.suiperpower/output/`)
- [x] 25.3 Print combined flow: "Detected Suiperpower build → packageId: 0x... → manifest generated → uploading to Walrus → registering on-chain"
- [x] 25.4 If `skill.manifest.json` already exists in Suiperpower output, use it directly (no assembly needed)
- [x] 25.5 If Suiperpower output includes a Walrus blobId (pre-uploaded), use it directly and skip Harbor upload

## Task 26: MCP — Import Skill Tool

- [x] 26.1 Register `agentos_import_skill` tool with input schema `{ skillName: string, agentName: string, source: 'sui-skills' | 'local', path?: string }` that imports and publishes a Sui Agent Skill
- [x] 26.2 For `source: 'sui-skills'`: invoke skill download, parse SKILL.md, convert, publish
- [x] 26.3 For `source: 'local'`: read SKILL.md from path, convert, publish
- [x] 26.4 Return `{ manifest, blobId, objectId, suinsName }` on success
- [x] 26.5 Return error if skill not found or conversion fails

## Task 27: Frontend — Skill Source Indicators + Import UI

- [x] 27.1 Add `source` field to registry skill record type: `'custom' | 'sui-skills' | 'suiperpower'`
- [x] 27.2 Display source badge on each skill card in the dashboard (e.g., "Suiperpower", "Sui Skills", "Custom")
- [x] 27.3 Add "Import Skill" button on `/agent/[name]/skills` page that opens a dialog with two tabs: "From Sui Agent Skills" (searchable list) and "Upload Manifest" (file upload)
- [x] 27.4 "From Sui Agent Skills" tab: list available skills from `docs.sui.io/skills` catalog, one-click import → triggers publish flow via API route

## Task 28: Tests — Skill Import + Suiperpower Integration

- [x] 28.1 Create `packages/sdk/src/skill-md-parser.test.ts` with tests for SKILL.md parsing (valid frontmatter, missing fields, multi-line instructions)
- [x] 28.2 Create `packages/sdk/src/suiperpower.test.ts` with tests for build output parsing and manifest generation
- [x] 28.3 Add CLI tests for `skill import` command: --from-sui-skills, local path, --dry-run, --json
- [x] 28.4 Add CLI tests for `skill scan` command: scan directory, skip existing, --force re-publish
- [x] 28.5 Add integration test: Suiperpower output → auto-detect → publish → resolve → verify manifest matches build output
