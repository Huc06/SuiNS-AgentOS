/**
 * In-memory {@link RegistryStore} / {@link RunsStore} implementations.
 *
 * Two uses:
 *  1. Unit tests — fast, isolated, no fs.
 *  2. Serverless ephemeral fallback — when no durable backend is configured
 *     (e.g. a read-only filesystem with no /tmp), the app can still run a
 *     single request lifetime against an in-memory store seeded from a snapshot.
 *
 * All registry logic delegates to the shared pure helpers in
 * `../registry/registry-logic.js`, so behavior is identical to LocalRegistry.
 */
import { SEED_REGISTRY } from "../registry/seed.js";
import * as logic from "../registry/registry-logic.js";
import type {
  RegistryAgentRecord,
  RegistryFile,
  RegistrySkillRecord,
  ResolveAgentResponse,
} from "../registry/types.js";
import type {
  DelegationRecord,
  PublishSkillInput,
  RegisterAgentInput,
  RegistryStore,
  RunsStore,
  WorkflowRunRecord,
} from "./types.js";

/**
 * A simple promise queue: serializes async operations so concurrent calls run
 * one-at-a-time. Used to make mutations of the in-memory document atomic w.r.t.
 * each other (even though JS is single-threaded, awaited reads/writes could
 * otherwise interleave). Shared with the file stores.
 */
export class AsyncLock {
  #tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(task, task);
    // Keep the chain alive regardless of whether `task` rejected.
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export class InMemoryRegistryStore implements RegistryStore {
  #data: RegistryFile;
  #lock = new AsyncLock();

  constructor(seed?: RegistryFile) {
    this.#data = seed
      ? structuredClone(seed)
      : structuredClone(SEED_REGISTRY);
  }

  /** Defensive copy of the whole document (tests/inspection). */
  snapshot(): RegistryFile {
    return structuredClone(this.#data);
  }

  async getAgents(): Promise<RegistryAgentRecord[]> {
    return structuredClone(this.#data.agents);
  }

  async getSkills(): Promise<RegistrySkillRecord[]> {
    return structuredClone(this.#data.skills);
  }

  async listAgents(): Promise<RegistryAgentRecord[]> {
    return structuredClone(logic.listAgents(this.#data));
  }

  async resolveAgent(name: string): Promise<ResolveAgentResponse | null> {
    const r = logic.resolveAgent(this.#data, name);
    return r ? structuredClone(r) : null;
  }

  async findAgentBySuins(
    suinsName: string,
  ): Promise<RegistryAgentRecord | undefined> {
    const a = logic.findAgentBySuins(this.#data, suinsName);
    return a ? structuredClone(a) : undefined;
  }

  async listSkills(agentName: string): Promise<RegistrySkillRecord[]> {
    return structuredClone(logic.listSkills(this.#data, agentName));
  }

  async searchAgents(
    query: string,
    limit = 6,
  ): Promise<RegistryAgentRecord[]> {
    return structuredClone(logic.searchAgents(this.#data, query, limit));
  }

  async listMemoryNamespaces(agentName: string): Promise<string[]> {
    return [...logic.listMemoryNamespaces(this.#data, agentName)];
  }

  async listDelegations(agentName: string): Promise<DelegationRecord[]> {
    return structuredClone(logic.listDelegations(this.#data, agentName));
  }

  registerAgent(input: RegisterAgentInput): Promise<RegistryAgentRecord> {
    return this.#lock.run(async () => {
      const { value } = logic.registerAgent(this.#data, input);
      return structuredClone(value);
    });
  }

  removeAgent(name: string): Promise<RegistryAgentRecord> {
    return this.#lock.run(async () => {
      const { value } = logic.removeAgent(this.#data, name);
      return structuredClone(value);
    });
  }

  publishSkill(input: PublishSkillInput): Promise<RegistrySkillRecord> {
    return this.#lock.run(async () => {
      const { value } = logic.publishSkill(this.#data, input);
      return structuredClone(value);
    });
  }

  recordMemoryNamespace(
    agentName: string,
    namespace: string,
  ): Promise<string[]> {
    return this.#lock.run(async () => {
      const { value } = logic.recordMemoryNamespace(
        this.#data,
        agentName,
        namespace,
      );
      return [...value];
    });
  }

  addDelegation(
    agentName: string,
    delegation: DelegationRecord,
  ): Promise<void> {
    return this.#lock.run(async () => {
      logic.addDelegation(this.#data, agentName, delegation);
    });
  }
}

export class InMemoryRunsStore implements RunsStore {
  #runs: WorkflowRunRecord[];
  #lock = new AsyncLock();

  constructor(seed?: WorkflowRunRecord[]) {
    this.#runs = seed ? structuredClone(seed) : [];
  }

  appendRun(run: WorkflowRunRecord): Promise<WorkflowRunRecord> {
    return this.#lock.run(async () => {
      this.#runs.push(structuredClone(run));
      return structuredClone(run);
    });
  }

  async listRuns(agentSlug: string): Promise<WorkflowRunRecord[]> {
    return structuredClone(
      this.#runs
        .filter((r) => r.agentSlug === agentSlug)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async getRun(runId: string): Promise<WorkflowRunRecord | undefined> {
    const run = this.#runs.find((r) => r.runId === runId);
    return run ? structuredClone(run) : undefined;
  }
}
