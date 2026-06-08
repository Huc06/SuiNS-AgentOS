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
}

export interface RegistryFile {
  version: 1;
  agents: RegistryAgentRecord[];
  skills: RegistrySkillRecord[];
}

export interface ResolveAgentResponse {
  agent: RegistryAgentRecord;
  skills: RegistrySkillRecord[];
}
