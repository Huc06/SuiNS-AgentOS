export type AgentSkillRow = {
  id: string;
  name: string;
  mvrPackage: string;
  network: "mainnet" | "testnet";
  version: string;
  /** Truncated object id for on-card display. */
  objectId: string;
  /** Full SkillDescriptor object id, used for explorer links and copy. */
  objectIdFull: string;
  /** Walrus manifest blob id. Empty string when the manifest has not been uploaded. */
  blobId: string;
  /** Seal policy id for private skills. Empty/undefined for public skills. */
  sealPolicyId?: string;
  status: "active" | "archived";
  resolutions: string;
  lastUpdated: string;
  icon: "token" | "wallet" | "swap";
  /** SuiNS subnames of skills this skill depends on. Empty when none. */
  dependencies: string[];
  /** Origin of the skill. Defaults to `custom` for legacy records. */
  source: "custom" | "sui-skills" | "suiperpower";
};
