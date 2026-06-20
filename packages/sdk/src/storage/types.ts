/**
 * Async, pluggable storage abstraction for the AgentOS registry and workflow
 * runs. The frontend (deployed app) talks to these interfaces only, so a real
 * database (D1, Postgres, KV) can slot in later WITHOUT changing route code —
 * just by providing a new {@link RegistryStore} / {@link RunsStore} impl.
 *
 * This is an additive layer. The synchronous {@link LocalRegistry} (CLI/MCP,
 * local fs) keeps its existing API and remains the default for those surfaces.
 */
import type { SkillManifest } from "../types.js";
import type {
  DelegationRecord,
  PublishSkillInput,
  RegisterAgentInput,
} from "../registry/registry-logic.js";
import type {
  RegistryAgentRecord,
  RegistryFile,
  RegistrySkillRecord,
  ResolveAgentResponse,
} from "../registry/types.js";
import type { StepResult } from "../workflow/types.js";

export type {
  DelegationRecord,
  PublishSkillInput,
  RegisterAgentInput,
} from "../registry/registry-logic.js";

/**
 * Async registry store. Mirrors every read/write the frontend API routes, the
 * CLI, and the MCP server perform against the registry — but Promise-returning
 * so a network/DB backend can implement it. All reads return defensive copies;
 * mutations are atomic with respect to the underlying medium.
 */
export interface RegistryStore {
  /** Snapshot of all agent records (active + revoked). */
  getAgents(): Promise<RegistryAgentRecord[]>;
  /** Snapshot of all skill records. */
  getSkills(): Promise<RegistrySkillRecord[]>;
  /** Active-only agents (status === "active"). */
  listAgents(): Promise<RegistryAgentRecord[]>;

  /** Resolve an agent + its skills by `*.sui` name, `@slug`, or slug. */
  resolveAgent(name: string): Promise<ResolveAgentResponse | null>;
  /** Lookup by normalized SuiNS name (no skills). */
  findAgentBySuins(suinsName: string): Promise<RegistryAgentRecord | undefined>;
  /** Skills belonging to one agent. */
  listSkills(agentName: string): Promise<RegistrySkillRecord[]>;

  /** Mint a new agent record. Throws if the SuiNS name is taken/invalid. */
  registerAgent(input: RegisterAgentInput): Promise<RegistryAgentRecord>;
  /** Remove an agent and its skills. Throws if not found. */
  removeAgent(name: string): Promise<RegistryAgentRecord>;
  /** Publish (or upsert) a skill under an agent. Throws if the agent is unknown. */
  publishSkill(input: PublishSkillInput): Promise<RegistrySkillRecord>;

  /** Fuzzy search over slug + suinsName, scored (prefix > substring > subsequence). */
  searchAgents(query: string, limit?: number): Promise<RegistryAgentRecord[]>;

  /** Append a Walrus-memory namespace to an agent's ledger. Returns the new list. */
  recordMemoryNamespace(
    agentName: string,
    namespace: string,
  ): Promise<string[]>;
  /** List an agent's known memory namespaces (most-recent first). */
  listMemoryNamespaces(agentName: string): Promise<string[]>;

  /** Append a sub-agent delegation to an agent. Throws if the agent is unknown. */
  addDelegation(
    agentName: string,
    delegation: DelegationRecord,
  ): Promise<void>;
  /** List delegations granted by an agent. */
  listDelegations(agentName: string): Promise<DelegationRecord[]>;
}

/** A single persisted workflow run. */
export interface WorkflowRunRecord {
  runId: string;
  agentSlug: string;
  status: "done" | "error";
  steps: StepResult[];
  createdAt: string;
}

/**
 * Async store for workflow runs. {@link appendRun} MUST be safe under
 * concurrency — no whole-file read-modify-write race that silently drops
 * records (the bug this work fixes).
 */
export interface RunsStore {
  /** Append a run. Concurrency-safe: concurrent appends never lose records. */
  appendRun(run: WorkflowRunRecord): Promise<WorkflowRunRecord>;
  /** List runs for an agent slug, newest first. */
  listRuns(agentSlug: string): Promise<WorkflowRunRecord[]>;
  /** Fetch a single run by id (used for polling). */
  getRun(runId: string): Promise<WorkflowRunRecord | undefined>;
}

/** Re-exported for store implementors. */
export type {
  RegistryAgentRecord,
  RegistryFile,
  RegistrySkillRecord,
  ResolveAgentResponse,
  SkillManifest,
  StepResult,
};
