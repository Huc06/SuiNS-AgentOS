export interface RegistryAgentRecord {
  slug: string;
  suinsName: string;
  passportId: string;
  runtimeWallet: string;
  network: "mainnet" | "testnet";
  passportVersion: string;
  status: "active" | "revoked";
  createdAt: string;
  /** Optional human-readable summary (registry-only until on-chain metadata). */
  description?: string;
  /**
   * Walrus-memory namespaces this agent has written to (deduped, most-recent
   * first). Populated by workflow `memory` (remember) runs so the canvas can
   * offer them in the namespace picker. Memwal has no list-namespaces endpoint,
   * so this registry-side ledger is the only source for known namespaces.
   */
  memoryNamespaces?: string[];
  /** Sub-agent delegations granted by this agent. */
  delegations?: Array<{
    childAgent: string;
    childName: string;
    allowedSkills: string[];
    allowedCapabilities: string[];
    spendLimit: string;
    spent: string;
    expiryMs: string;
    revoked: boolean;
    capId?: string;
    createdAt: string;
  }>;
}

export interface RegistrySkillRecord {
  agentSlug: string;
  skillId: string;
  name: string;
  mvrPackage: string;
  version: string;
  walrusManifestBlob: string;
  manifestHash: string;
  objectId: string;
  suinsName?: string;
  sealPolicyId?: string;
  network: "mainnet" | "testnet";
  status: "active" | "archived";
  resolutions: string;
  lastUpdated: string;
  icon: "token" | "wallet" | "swap";
  /** SuiNS subnames of skills this skill depends on. Empty/undefined when none. */
  dependencies?: string[];
  /**
   * Where the skill originated. `custom` = authored locally / uploaded manifest,
   * `sui-skills` = imported from the Sui Agent Skills catalog, `suiperpower` =
   * produced by a Suiperpower build. Absent records are treated as `custom`.
   */
  source?: "custom" | "sui-skills" | "suiperpower";
}

export interface RegistryFile {
  version: 1;
  agents: RegistryAgentRecord[];
  skills: RegistrySkillRecord[];
  /**
   * Published workflows (compositions of skills). Optional for back-compat with
   * registry files written before workflows existed — readers treat a missing
   * key as an empty list. A workflow is published under an agent as its own
   * SuiNS subname; its DAG lives on Walrus (referenced by `walrusManifestBlob`).
   */
  workflows?: RegistryWorkflowRecord[];
}

/**
 * A published workflow record. Mirrors {@link RegistrySkillRecord} (same
 * Walrus/on-chain/SuiNS fields) but kept in its OWN array so workflows never
 * pollute skill listings (agent skill tables, MCP `list_skills`, skill counts).
 * The workflow DAG itself is not stored here — it lives on Walrus as the blob
 * `walrusManifestBlob` (a `sui-agent-workflow/v1` manifest), loaded on demand.
 */
export interface RegistryWorkflowRecord {
  /** Owning agent's slug. */
  agentSlug: string;
  /** Stable id within the agent (the workflow name). */
  workflowId: string;
  /** Display name (== workflowId today). */
  name: string;
  /** Slug derived from the fully-qualified subname; the canvas route key. */
  slug: string;
  /** Fully-qualified SuiNS subname, e.g. `rebalance-pipeline.alpha-fund.sui`. */
  suinsName: string;
  version: string;
  /** Walrus blob holding the serialized `sui-agent-workflow/v1` manifest (graph). */
  walrusManifestBlob: string;
  /** Hex SHA-256 of the serialized manifest (empty until first publish). */
  manifestHash: string;
  /** Walrus storage end epoch for the manifest blob. Undefined until first publish. */
  endEpoch?: number;
  network: "mainnet" | "testnet";
  status: "draft" | "active" | "archived";
  /** Optional human-readable summary. */
  description?: string;
  /** SuiNS subnames of skills/sub-agents this workflow composes. */
  dependencies?: string[];
  createdAt: string;
  lastUpdated: string;
}

export interface ResolveAgentResponse {
  agent: RegistryAgentRecord;
  skills: RegistrySkillRecord[];
}
