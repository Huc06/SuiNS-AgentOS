import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { loadConfig, resolveRegistryPath } from '@agentos/sdk/node';
import type { StepResult } from '@agentos/sdk/node';

/**
 * A single persisted workflow run. Kept deliberately small and file-backed,
 * mirroring the local registry: the CLI, MCP, and API routes share one JSON
 * file at the repo root (or /tmp on Vercel).
 */
export interface WorkflowRunRecord {
  runId: string;
  agentSlug: string;
  status: 'done' | 'error';
  steps: StepResult[];
  createdAt: string;
}

interface RunsFile {
  version: 1;
  runs: WorkflowRunRecord[];
}

const EMPTY: RunsFile = { version: 1, runs: [] };

/**
 * Resolve the runs JSON path. Sits next to the local registry so the two stores
 * live together. Honors `AGENTOS_RUNS_PATH`; on Vercel falls back to /tmp.
 */
function getRunsPath(): string {
  if (process.env.AGENTOS_RUNS_PATH) return process.env.AGENTOS_RUNS_PATH;
  if (process.env.VERCEL) return join(tmpdir(), '.agentos', 'runs.json');

  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const repoRoot = join(cwd, '../..');
  const registryPath = resolveRegistryPath(config, repoRoot);
  return join(dirname(registryPath), 'runs.json');
}

function load(path: string): RunsFile {
  if (!existsSync(path)) return structuredClone(EMPTY);
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as RunsFile;
    if (raw.version !== 1 || !Array.isArray(raw.runs)) {
      return structuredClone(EMPTY);
    }
    return raw;
  } catch {
    return structuredClone(EMPTY);
  }
}

function save(path: string, data: RunsFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

/** Append a run record to the store. */
export function appendRun(run: WorkflowRunRecord): WorkflowRunRecord {
  const path = getRunsPath();
  const data = load(path);
  data.runs.push(run);
  save(path, data);
  return run;
}

/** List runs for an agent slug, newest first. */
export function listRuns(agentSlug: string): WorkflowRunRecord[] {
  const data = load(getRunsPath());
  return data.runs
    .filter((r) => r.agentSlug === agentSlug)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Fetch a single run by id (used for polling). */
export function getRun(runId: string): WorkflowRunRecord | undefined {
  const data = load(getRunsPath());
  return data.runs.find((r) => r.runId === runId);
}
