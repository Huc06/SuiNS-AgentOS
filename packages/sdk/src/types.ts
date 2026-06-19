export type AgentStatus = "active" | "revoked";

export interface AgentPassport {
  id: string;
  owner: string;
  suinsName: string;
  runtimeWallet: string;
  policyRoot: string;
  skillRoot: string;
  memoryNamespace: string;
  activityLogPointer: string;
  status: AgentStatus;
}

export interface SkillDescriptor {
  skillId: string;
  walrusManifestBlob: string;
  manifestHash: string;
  mvrPackageName: string;
  version: string;
  requiredCapabilities: string[];
  dependencies: string[];
  sealPolicyId?: string;
  /**
   * True when the skill's manifest is Seal-encrypted (i.e. `sealPolicyId` is
   * present and non-empty). Callers must supply a sui-groups membership proof
   * to `downloadManifest` in order to decrypt the manifest.
   */
  decryptionRequired?: boolean;
}

export interface SkillManifestTool {
  name: string;
  description: string;
}

export interface SkillManifest {
  name: string;
  version: string;
  publisher: string;
  manifestType: "sui-agent-skill/v1";
  mcp: {
    compatible: boolean;
    tools: SkillManifestTool[];
  };
  sui: {
    movePackage: string;
    entry: string;
    policyRequired: string[];
  };
  dependencies: string[];
}

export interface SubAgentConfig {
  name: string;
  permissions: string[];
  budget: bigint;
  expiry: number;
}

export interface AgentOptions {
  network: "mainnet" | "testnet" | "devnet";
}

export interface Bucket {
  bucketId: string;
  sealPolicyId: string;
  state: "pending_policy" | "active";
}

/** On-chain reputation data from AgentPassport. */
export interface AgentReputation {
  execCount: number;
  score: number;
  attestations: number;
  isActive: boolean;
}

/** Result of buildExecuteSkillTx — separates build from sign+execute. */
export interface BuildExecuteSkillTxResult {
  descriptor: SkillDescriptor;
  manifest: SkillManifest;
  transaction: unknown; // Transaction from @mysten/sui/transactions
  manifestHash: string;
  verified: boolean;
}

/** Result of a delegation grant operation. */
export interface DelegationResult {
  /** Transaction digest (if executed on-chain). */
  digest?: string;
  /** DelegationCap object ID (if created on-chain). */
  capId?: string;
  /** Whether the delegation was persisted to local registry as fallback. */
  registryFallback: boolean;
}

/** A sub-agent delegation record stored in the registry. */
export interface RegistrySubAgentRecord {
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
}

/** Resolved name result with source information. */
export interface ResolveNameResult {
  address: string;
  name: string;
  kind: "agent" | "skill" | "unknown";
  source: "onchain" | "registry";
}
