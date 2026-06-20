import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomBytes } from "node:crypto";

import type { SkillManifest } from "../types.js";
import { normalizeSuinsName, slugFromSuins } from "./normalize.js";
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
    const normalized = normalizeSuinsName(suinsName);
    return this.#data.agents.find(
      (a) =>
        a.suinsName === normalized ||
        a.slug === normalized.replace(/\.sui$/, ""),
    );
  }

  findAgentBySlug(slug: string): RegistryAgentRecord | undefined {
    return this.#data.agents.find((a) => a.slug === slug);
  }

  resolveAgent(name: string): ResolveAgentResponse | null {
    const agent =
      this.findAgentBySuins(name) ??
      this.findAgentBySlug(name.replace(/^@/, ""));
    if (!agent) return null;
    const skills = this.#data.skills.filter((s) => s.agentSlug === agent.slug);
    return { agent, skills };
  }

  listSkills(agentName: string): RegistrySkillRecord[] {
    const resolved = this.resolveAgent(agentName);
    return resolved?.skills ?? [];
  }

  listAgents(): RegistryAgentRecord[] {
    return this.#data.agents.filter((a) => a.status === "active");
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
    const suinsName = normalizeSuinsName(input.suinsName);
    if (!suinsName.endsWith(".sui")) {
      throw new Error("Invalid SuiNS name — must end with .sui");
    }
    const existing = this.findAgentBySuins(suinsName);
    if (existing) {
      throw new Error(`Agent already registered: ${existing.suinsName}`);
    }

    const slug = slugFromSuins(suinsName);
    const passportId =
      input.passportId?.trim() || `0x${randomBytes(20).toString("hex")}`;
    const record: RegistryAgentRecord = {
      slug,
      suinsName,
      passportId,
      runtimeWallet: input.runtimeWallet,
      network: input.network ?? "testnet",
      passportVersion: input.passportVersion ?? "Passport v1.0.0",
      status: "active",
      createdAt: new Date().toISOString(),
      ...(input.description?.trim()
        ? { description: input.description.trim() }
        : {}),
    };
    this.#data.agents.push(record);
    this.save();
    return record;
  }

  /** Remove agent and its skills from the local registry (does not revoke on-chain passport). */
  removeAgent(name: string): RegistryAgentRecord {
    const resolved = this.resolveAgent(name);
    if (!resolved) {
      throw new Error(`Agent not found: ${name}`);
    }
    const { agent } = resolved;
    this.#data.agents = this.#data.agents.filter((a) => a.slug !== agent.slug);
    this.#data.skills = this.#data.skills.filter(
      (s) => s.agentSlug !== agent.slug,
    );
    this.save();
    return agent;
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
    const resolved = this.resolveAgent(agentName);
    if (!resolved) {
      throw new Error(`Agent not found: ${agentName}`);
    }
    const agent = resolved.agent;
    // Store delegations as a sub-array on the agent record
    if (!agent.delegations) {
      agent.delegations = [];
    }
    agent.delegations.push(delegation);
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
    const resolved = this.resolveAgent(agentName);
    if (!resolved) return [];
    return resolved.agent.delegations ?? [];
  }

  /** Search agents by fuzzy matching on slug + suinsName. */
  searchAgents(query: string, limit = 6): RegistryAgentRecord[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const active = this.listAgents();

    // Score: prefix > substring > subsequence
    const scored = active
      .map((agent) => {
        const name = agent.suinsName.toLowerCase();
        const slug = agent.slug.toLowerCase();
        let score = 0;
        if (slug.startsWith(q) || name.startsWith(q)) score = 3;
        else if (slug.includes(q) || name.includes(q)) score = 2;
        else if (isSubsequence(q, slug) || isSubsequence(q, name)) score = 1;
        return { agent, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => s.agent);
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
    const resolved = this.resolveAgent(input.agentName);
    if (!resolved) {
      throw new Error(`Agent not found: ${input.agentName}`);
    }

    const manifestJson = JSON.stringify(input.manifest);
    const manifestHash =
      input.manifestHash ??
      `0x${createHash("sha256").update(manifestJson).digest("hex").slice(0, 16)}`;
    const walrusManifestBlob =
      input.walrusManifestBlob ??
      `walrus://blob/${input.manifest.name}-${input.manifest.version}`;
    const mvrPackage = input.manifest.publisher.startsWith("@")
      ? input.manifest.publisher
      : `@${resolved.agent.slug}/${input.manifest.name}`;

    const record: RegistrySkillRecord = {
      agentSlug: resolved.agent.slug,
      skillId: input.manifest.name,
      name: input.manifest.name,
      mvrPackage,
      version: `v${input.manifest.version}`,
      walrusManifestBlob,
      manifestHash,
      objectId: input.objectId ?? `0x${randomBytes(20).toString("hex")}`,
      network: input.network ?? resolved.agent.network,
      status: "active",
      resolutions: "0",
      lastUpdated: "just now",
      icon: "token",
      source: input.source ?? "custom",
      ...(input.manifest.dependencies && input.manifest.dependencies.length > 0
        ? { dependencies: input.manifest.dependencies }
        : {}),
      ...(input.suinsName ? { suinsName: input.suinsName } : {}),
      ...(input.sealPolicyId ? { sealPolicyId: input.sealPolicyId } : {}),
    };

    const dup = this.#data.skills.find(
      (s) => s.agentSlug === record.agentSlug && s.skillId === record.skillId,
    );
    if (dup) {
      Object.assign(dup, record);
    } else {
      this.#data.skills.push(record);
    }
    this.save();
    return record;
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

function isSubsequence(sub: string, str: string): boolean {
  let si = 0;
  for (let i = 0; i < str.length && si < sub.length; i++) {
    if (str[i] === sub[si]) si++;
  }
  return si === sub.length;
}
