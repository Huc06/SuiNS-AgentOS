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
