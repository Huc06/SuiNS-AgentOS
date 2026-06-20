/**
 * Pure, side-effect-free registry logic shared by the synchronous
 * {@link LocalRegistry} and the async {@link RegistryStore} implementations.
 *
 * Every function here takes a {@link RegistryFile} (the in-memory document) and
 * either reads from it or mutates it in place and reports whether a write is
 * required. No I/O, no `Date`/`randomBytes` ambiguity is hidden — callers pass
 * those concerns down, except where a record needs a fresh id/timestamp (kept
 * here so the sync and async stores stay byte-for-byte identical).
 *
 * Keeping this single source of truth is deliberate: `LocalRegistry` (CLI/MCP,
 * sync fs) and the new async stores (frontend, pluggable backends) must never
 * drift apart in how they normalize names, score search, or dedupe namespaces.
 */
import { createHash, randomBytes } from "node:crypto";

import type { SkillManifest } from "../types.js";
import { normalizeSuinsName, slugFromSuins } from "./normalize.js";
import type {
  RegistryAgentRecord,
  RegistryFile,
  RegistrySkillRecord,
  ResolveAgentResponse,
} from "./types.js";

export type DelegationRecord = NonNullable<
  RegistryAgentRecord["delegations"]
>[number];

export interface RegisterAgentInput {
  suinsName: string;
  runtimeWallet: string;
  network?: "mainnet" | "testnet";
  passportVersion?: string;
  description?: string;
  /** Real on-chain AgentPassport object id, when minted. Falls back to a synthetic id. */
  passportId?: string;
}

export interface PublishSkillInput {
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
}

/** Result of a mutating operation: the produced value + whether a persist is needed. */
export interface MutationResult<T> {
  value: T;
  changed: boolean;
}

// ---------------------------------------------------------------------------
// Reads (pure)
// ---------------------------------------------------------------------------

export function findAgentBySuins(
  data: RegistryFile,
  suinsName: string,
): RegistryAgentRecord | undefined {
  const normalized = normalizeSuinsName(suinsName);
  return data.agents.find(
    (a) =>
      a.suinsName === normalized || a.slug === normalized.replace(/\.sui$/, ""),
  );
}

export function findAgentBySlug(
  data: RegistryFile,
  slug: string,
): RegistryAgentRecord | undefined {
  return data.agents.find((a) => a.slug === slug);
}

export function resolveAgent(
  data: RegistryFile,
  name: string,
): ResolveAgentResponse | null {
  const agent =
    findAgentBySuins(data, name) ??
    findAgentBySlug(data, name.replace(/^@/, ""));
  if (!agent) return null;
  const skills = data.skills.filter((s) => s.agentSlug === agent.slug);
  return { agent, skills };
}

export function listSkills(
  data: RegistryFile,
  agentName: string,
): RegistrySkillRecord[] {
  return resolveAgent(data, agentName)?.skills ?? [];
}

export function listAgents(data: RegistryFile): RegistryAgentRecord[] {
  return data.agents.filter((a) => a.status === "active");
}

export function listMemoryNamespaces(
  data: RegistryFile,
  agentName: string,
): string[] {
  return resolveAgent(data, agentName)?.agent.memoryNamespaces ?? [];
}

export function listDelegations(
  data: RegistryFile,
  agentName: string,
): DelegationRecord[] {
  return resolveAgent(data, agentName)?.agent.delegations ?? [];
}

export function searchAgents(
  data: RegistryFile,
  query: string,
  limit = 6,
): RegistryAgentRecord[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const active = listAgents(data);

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

// ---------------------------------------------------------------------------
// Mutations (mutate `data` in place; report whether a persist is needed)
// ---------------------------------------------------------------------------

export function registerAgent(
  data: RegistryFile,
  input: RegisterAgentInput,
): MutationResult<RegistryAgentRecord> {
  const suinsName = normalizeSuinsName(input.suinsName);
  if (!suinsName.endsWith(".sui")) {
    throw new Error("Invalid SuiNS name — must end with .sui");
  }
  const existing = findAgentBySuins(data, suinsName);
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
  data.agents.push(record);
  return { value: record, changed: true };
}

export function removeAgent(
  data: RegistryFile,
  name: string,
): MutationResult<RegistryAgentRecord> {
  const resolved = resolveAgent(data, name);
  if (!resolved) {
    throw new Error(`Agent not found: ${name}`);
  }
  const { agent } = resolved;
  data.agents = data.agents.filter((a) => a.slug !== agent.slug);
  data.skills = data.skills.filter((s) => s.agentSlug !== agent.slug);
  return { value: agent, changed: true };
}

export function addDelegation(
  data: RegistryFile,
  agentName: string,
  delegation: DelegationRecord,
): MutationResult<void> {
  const resolved = resolveAgent(data, agentName);
  if (!resolved) {
    throw new Error(`Agent not found: ${agentName}`);
  }
  const agent = resolved.agent;
  if (!agent.delegations) {
    agent.delegations = [];
  }
  agent.delegations.push(delegation);
  return { value: undefined, changed: true };
}

/**
 * Record a Walrus-memory namespace an agent has written to. Deduped, most-recent
 * first, capped at 50. No-op (returns the current list, `changed: false`) when
 * the agent is unknown or the namespace is blank.
 */
export function recordMemoryNamespace(
  data: RegistryFile,
  agentName: string,
  namespace: string,
): MutationResult<string[]> {
  const ns = namespace.trim();
  const resolved = resolveAgent(data, agentName);
  if (!resolved || !ns) {
    return { value: resolved?.agent.memoryNamespaces ?? [], changed: false };
  }
  const agent = resolved.agent;
  const existing = agent.memoryNamespaces ?? [];
  const next = [ns, ...existing.filter((n) => n !== ns)].slice(0, 50);
  const changed =
    next.length !== existing.length || next.some((n, i) => n !== existing[i]);
  if (changed) {
    agent.memoryNamespaces = next;
  }
  return { value: next, changed };
}

export function publishSkill(
  data: RegistryFile,
  input: PublishSkillInput,
): MutationResult<RegistrySkillRecord> {
  const resolved = resolveAgent(data, input.agentName);
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

  const dup = data.skills.find(
    (s) => s.agentSlug === record.agentSlug && s.skillId === record.skillId,
  );
  if (dup) {
    Object.assign(dup, record);
  } else {
    data.skills.push(record);
  }
  return { value: record, changed: true };
}

function isSubsequence(sub: string, str: string): boolean {
  let si = 0;
  for (let i = 0; i < str.length && si < sub.length; i++) {
    if (str[i] === sub[si]) si++;
  }
  return si === sub.length;
}
