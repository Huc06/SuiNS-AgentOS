import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

import type { SkillManifest } from "../types.js";
import * as logic from "./registry-logic.js";
import { SEED_REGISTRY } from "./seed.js";
import type {
  RegistryAgentRecord,
  RegistryFile,
  RegistrySkillRecord,
  ResolveAgentResponse,
} from "./types.js";

export class LocalRegistry {
  #filePath: string;
  #data: RegistryFile;

  constructor(filePath: string, data?: RegistryFile) {
    this.#filePath = filePath;
    this.#data = data ?? LocalRegistry.loadFromDisk(filePath);
  }

  static loadFromDisk(filePath: string): RegistryFile {
    if (!existsSync(filePath)) {
      return structuredClone(SEED_REGISTRY);
    }
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as RegistryFile;
    if (raw.version !== 1) {
      throw new Error(
        `Unsupported registry version: ${String((raw as { version?: unknown }).version)}`,
      );
    }
    return raw;
  }

  static open(filePath: string): LocalRegistry {
    return new LocalRegistry(filePath);
  }

  get filePath(): string {
    return this.#filePath;
  }

  get snapshot(): RegistryFile {
    return structuredClone(this.#data);
  }

  save(): void {
    mkdirSync(dirname(this.#filePath), { recursive: true });
    writeFileSync(
      this.#filePath,
      `${JSON.stringify(this.#data, null, 2)}\n`,
      "utf8",
    );
  }

  findAgentBySuins(suinsName: string): RegistryAgentRecord | undefined {
    return logic.findAgentBySuins(this.#data, suinsName);
  }

  findAgentBySlug(slug: string): RegistryAgentRecord | undefined {
    return logic.findAgentBySlug(this.#data, slug);
  }

  resolveAgent(name: string): ResolveAgentResponse | null {
    return logic.resolveAgent(this.#data, name);
  }

  listSkills(agentName: string): RegistrySkillRecord[] {
    return logic.listSkills(this.#data, agentName);
  }

  listAgents(): RegistryAgentRecord[] {
    return logic.listAgents(this.#data);
  }

  registerAgent(input: {
    suinsName: string;
    runtimeWallet: string;
    network?: "mainnet" | "testnet";
    passportVersion?: string;
    description?: string;
    /** Real on-chain AgentPassport object id, when minted. Falls back to a synthetic id. */
    passportId?: string;
  }): RegistryAgentRecord {
    const { value } = logic.registerAgent(this.#data, input);
    this.save();
    return value;
  }

  /** Remove agent and its skills from the local registry (does not revoke on-chain passport). */
  removeAgent(name: string): RegistryAgentRecord {
    const { value } = logic.removeAgent(this.#data, name);
    this.save();
    return value;
  }

  /** Add a delegation record to the local registry for an agent. */
  addDelegation(
    agentName: string,
    delegation: {
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
    },
  ): void {
    logic.addDelegation(this.#data, agentName, delegation);
    this.save();
  }

  /** List delegations for an agent from the registry. */
  listDelegations(agentName: string): Array<{
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
  }> {
    return logic.listDelegations(this.#data, agentName);
  }

  /**
   * Record a Walrus-memory namespace an agent has written to, so it can later
   * be offered in the canvas namespace picker. Deduped and kept most-recent
   * first; capped to avoid unbounded growth. No-op (returns the current list)
   * when the agent is unknown or the namespace is blank. Memwal has no
   * list-namespaces endpoint, so this registry ledger is the only known source.
   */
  recordMemoryNamespace(agentName: string, namespace: string): string[] {
    const { value, changed } = logic.recordMemoryNamespace(
      this.#data,
      agentName,
      namespace,
    );
    // Only write when the list actually changed (avoids churning the file).
    if (changed) this.save();
    return value;
  }

  /** List the Walrus-memory namespaces known for an agent (most-recent first). */
  listMemoryNamespaces(agentName: string): string[] {
    return logic.listMemoryNamespaces(this.#data, agentName);
  }

  /** Search agents by fuzzy matching on slug + suinsName. */
  searchAgents(query: string, limit = 6): RegistryAgentRecord[] {
    return logic.searchAgents(this.#data, query, limit);
  }

  publishSkill(input: {
    agentName: string;
    manifest: SkillManifest;
    walrusManifestBlob?: string;
    /** Real SHA-256 manifest hash (hex) from the upload pipeline. */
    manifestHash?: string;
    /** On-chain SkillDescriptor object id. */
    objectId?: string;
    /** Full qualified SuiNS subname (e.g. `trade.alpha.sui`). */
    suinsName?: string;
    /** Seal policy id for private skills (empty/undefined for public). */
    sealPolicyId?: string;
    network?: "mainnet" | "testnet";
    /** Origin of the skill. Defaults to `custom` when not provided. */
    source?: "custom" | "sui-skills" | "suiperpower";
  }): RegistrySkillRecord {
    const { value } = logic.publishSkill(this.#data, input);
    this.save();
    return value;
  }
}

export function passportFromRecord(record: RegistryAgentRecord) {
  return {
    id: record.passportId,
    owner: record.runtimeWallet,
    suinsName: record.suinsName,
    runtimeWallet: record.runtimeWallet,
    policyRoot: "0x0",
    skillRoot: "0x0",
    memoryNamespace: "",
    activityLogPointer: "",
    status: record.status,
  } as const;
}

export function descriptorFromRecord(record: RegistrySkillRecord) {
  return {
    skillId: record.skillId,
    walrusManifestBlob: record.walrusManifestBlob,
    manifestHash: record.manifestHash,
    mvrPackageName: record.mvrPackage,
    version: record.version,
    requiredCapabilities: [],
    dependencies: record.dependencies ?? [],
    ...(record.sealPolicyId
      ? { sealPolicyId: record.sealPolicyId, decryptionRequired: true }
      : {}),
  };
}
