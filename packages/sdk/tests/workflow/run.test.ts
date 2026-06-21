import { describe, expect, it, vi } from "vitest";

import { runWorkflow } from "../../src/workflow/run.js";
import type { StepExecutor } from "../../src/workflow/executors.js";
import type {
  RunContext,
  StepResult,
  WorkflowGraph,
} from "../../src/workflow/types.js";

/** Minimal context — the mock executors below ignore most of it. */
function makeCtx(overrides: Partial<RunContext> = {}): RunContext {
  return {
    agentName: "alpha.sui",
    client: {},
    execute: vi.fn(async () => ({ digest: "0xdeadbeef" })),
    ...overrides,
  };
}

/** The default dashboard graph: Trigger -> Walrus -> {Harbor, Sui} -> Memory. */
const defaultGraph: WorkflowGraph = {
  nodes: [
    { id: "trigger", type: "trigger", label: "Trigger" },
    { id: "walrus", type: "walrus", label: "Walrus" },
    { id: "harbor", type: "harbor", label: "Harbor" },
    { id: "sui", type: "sui", label: "Sui" },
    { id: "memory", type: "memory", label: "Memory" },
  ],
  edges: [
    { source: "trigger", target: "walrus" },
    { source: "walrus", target: "harbor" },
    { source: "walrus", target: "sui" },
    { source: "harbor", target: "memory" },
    { source: "sui", target: "memory" },
  ],
};

/** A done-everything mock executor table. */
function okExecutors(): Partial<Record<StepResult["type"], StepExecutor>> {
  const ok: StepExecutor = async (node) => ({
    status: "done",
    output: { ran: node.id },
  });
  return { trigger: ok, walrus: ok, harbor: ok, sui: ok, memory: ok };
}

describe("runWorkflow ordering", () => {
  it("executes nodes in topological order", async () => {
    const order: string[] = [];
    const track: StepExecutor = async (node) => {
      order.push(node.id);
      return { status: "done" };
    };
    const result = await runWorkflow(defaultGraph, makeCtx(), {
      executors: {
        trigger: track,
        walrus: track,
        harbor: track,
        sui: track,
        memory: track,
      },
    });

    expect(result.status).toBe("done");
    // trigger must precede walrus; walrus before harbor & sui; both before memory.
    expect(order[0]).toBe("trigger");
    expect(order[1]).toBe("walrus");
    expect(order.indexOf("harbor")).toBeGreaterThan(order.indexOf("walrus"));
    expect(order.indexOf("sui")).toBeGreaterThan(order.indexOf("walrus"));
    expect(order.indexOf("memory")).toBeGreaterThan(order.indexOf("harbor"));
    expect(order.indexOf("memory")).toBeGreaterThan(order.indexOf("sui"));
    expect(order[order.length - 1]).toBe("memory");
  });

  it("returns one settled step per node", async () => {
    const result = await runWorkflow(defaultGraph, makeCtx(), {
      executors: okExecutors(),
    });
    expect(result.steps).toHaveLength(5);
    expect(result.steps.every((s) => s.status === "done")).toBe(true);
  });

  it("calls onStep before (running) and after (settled) each node", async () => {
    const seen: Array<{ nodeId: string; status: string }> = [];
    await runWorkflow(defaultGraph, makeCtx(), {
      executors: okExecutors(),
      onStep: (s) => seen.push({ nodeId: s.nodeId, status: s.status }),
    });

    // 5 running + 5 settled.
    expect(seen).toHaveLength(10);
    const triggerEvents = seen.filter((s) => s.nodeId === "trigger");
    expect(triggerEvents.map((e) => e.status)).toEqual(["running", "done"]);
  });
});

describe("runWorkflow error-stop", () => {
  it("stops the chain on the first error and marks downstream pending", async () => {
    const ran: string[] = [];
    const ok: StepExecutor = async (node) => {
      ran.push(node.id);
      return { status: "done" };
    };
    const boom: StepExecutor = async (node) => {
      ran.push(node.id);
      return { status: "error", error: "walrus blew up" };
    };

    const result = await runWorkflow(defaultGraph, makeCtx(), {
      executors: {
        trigger: ok,
        walrus: boom,
        harbor: ok,
        sui: ok,
        memory: ok,
      },
    });

    expect(result.status).toBe("error");
    // trigger + walrus ran; harbor/sui/memory never executed.
    expect(ran).toEqual(["trigger", "walrus"]);

    const byId = new Map(result.steps.map((s) => [s.nodeId, s]));
    expect(byId.get("trigger")?.status).toBe("done");
    expect(byId.get("walrus")?.status).toBe("error");
    expect(byId.get("walrus")?.error).toBe("walrus blew up");
    expect(byId.get("harbor")?.status).toBe("pending");
    expect(byId.get("sui")?.status).toBe("pending");
    expect(byId.get("memory")?.status).toBe("pending");
  });

  it("treats a thrown executor as an error step (not a crash)", async () => {
    const throwing: StepExecutor = async () => {
      throw new Error("kaboom");
    };
    const result = await runWorkflow(
      {
        nodes: [{ id: "t", type: "trigger", label: "Trigger" }],
        edges: [],
      },
      makeCtx(),
      { executors: { trigger: throwing } },
    );
    expect(result.status).toBe("error");
    expect(result.steps[0]?.status).toBe("error");
    expect(result.steps[0]?.error).toBe("kaboom");
  });

  it("attaches a structured diagnosis to errored + downstream-pending steps", async () => {
    const boom: StepExecutor = async () => ({
      status: "error",
      error:
        "SUI_PRIVATE_KEY is not set — required to sign sponsored transactions server-side.",
    });
    const ok: StepExecutor = async () => ({ status: "done" });
    const result = await runWorkflow(defaultGraph, makeCtx(), {
      executors: {
        trigger: ok,
        walrus: boom,
        harbor: ok,
        sui: ok,
        memory: ok,
      },
    });

    const byId = new Map(result.steps.map((s) => [s.nodeId, s]));
    const walrus = byId.get("walrus");
    expect(walrus?.status).toBe("error");
    expect(walrus?.errorCode).toBe("ENV_MISSING");
    expect(walrus?.errorHint).toMatch(/SUI_PRIVATE_KEY/);
    expect(walrus?.cause).toBeTruthy();
    expect(walrus?.remediation).toMatch(/\.env/);
    // The original raw message is preserved for back-compat.
    expect(walrus?.error).toMatch(/SUI_PRIVATE_KEY/);

    // Downstream node is pending → labeled blocked-by-upstream, not skipped.
    const memory = byId.get("memory");
    expect(memory?.status).toBe("pending");
    expect(memory?.errorCode).toBe("BLOCKED_UPSTREAM");
    expect(memory?.cause).toMatch(/upstream/i);
  });

  it("attaches a diagnosis to skipped steps (public/memwal notes)", async () => {
    const skip: StepExecutor = async () => ({
      status: "skipped",
      output: { note: "memwal not configured" },
    });
    const ok: StepExecutor = async () => ({ status: "done" });
    const result = await runWorkflow(
      {
        nodes: [
          { id: "trigger", type: "trigger", label: "Trigger" },
          { id: "memory", type: "memory", label: "Memory" },
        ],
        edges: [{ source: "trigger", target: "memory" }],
      },
      makeCtx(),
      { executors: { trigger: ok, memory: skip } },
    );
    expect(result.status).toBe("done");
    const memory = result.steps.find((s) => s.nodeId === "memory");
    expect(memory?.status).toBe("skipped");
    expect(memory?.errorCode).toBe("MEMWAL_SKIP");
    expect(memory?.cause).toMatch(/relayer/i);
  });

  it("propagates a skip downstream (on-chain node skips 'upstream skipped', run stays done)", async () => {
    // delegate skips → its downstream call-sub-agent + attest auto-skip rather
    // than erroring on config their skipped upstream would have produced.
    const ran: string[] = [];
    const ok: StepExecutor = async (node) => {
      ran.push(node.id);
      return { status: "done" };
    };
    const skip: StepExecutor = async (node) => {
      ran.push(node.id);
      return { status: "skipped", output: { note: "no packageId" } };
    };
    // If these executors ran, they'd error (missing config) — assert they don't.
    const boom: StepExecutor = async (node) => {
      ran.push(node.id);
      return { status: "error", error: `${node.id} should not have run` };
    };

    const graph: WorkflowGraph = {
      nodes: [
        { id: "trigger", type: "trigger", label: "Trigger" },
        { id: "delegate", type: "delegate", label: "Delegate" },
        { id: "call", type: "call-sub-agent", label: "Call Sub-Agent" },
        { id: "attest", type: "attest", label: "Attest" },
      ],
      edges: [
        { source: "trigger", target: "delegate" },
        { source: "delegate", target: "call" },
        { source: "call", target: "attest" },
      ],
    };

    const result = await runWorkflow(graph, makeCtx(), {
      executors: {
        trigger: ok,
        delegate: skip,
        "call-sub-agent": boom,
        attest: boom,
      },
    });

    // The run is NOT an error — it's all done/skipped.
    expect(result.status).toBe("done");
    // Downstream on-chain executors were never invoked.
    expect(ran).toEqual(["trigger", "delegate"]);

    const byId = new Map(result.steps.map((s) => [s.nodeId, s]));
    expect(byId.get("delegate")?.status).toBe("skipped");
    expect(byId.get("call")?.status).toBe("skipped");
    expect(byId.get("call")?.errorCode).toBe("BLOCKED_UPSTREAM");
    expect(byId.get("attest")?.status).toBe("skipped");
    expect(byId.get("attest")?.errorCode).toBe("BLOCKED_UPSTREAM");
  });

  it("does NOT propagate a skip past a done predecessor", async () => {
    // sui has two predecessors; one done, one skipped → sui still runs.
    const ran: string[] = [];
    const ok: StepExecutor = async (node) => {
      ran.push(node.id);
      return { status: "done" };
    };
    const skip: StepExecutor = async (node) => {
      ran.push(node.id);
      return { status: "skipped", output: { note: "public skill" } };
    };

    const graph: WorkflowGraph = {
      nodes: [
        { id: "trigger", type: "trigger", label: "Trigger" },
        { id: "walrus", type: "walrus", label: "Walrus" },
        { id: "harbor", type: "harbor", label: "Harbor" },
        { id: "sui", type: "sui", label: "Sui" },
      ],
      edges: [
        { source: "trigger", target: "walrus" },
        { source: "walrus", target: "harbor" },
        { source: "walrus", target: "sui" },
        { source: "harbor", target: "sui" },
      ],
    };

    const result = await runWorkflow(graph, makeCtx(), {
      executors: { trigger: ok, walrus: ok, harbor: skip, sui: ok },
    });

    expect(result.status).toBe("done");
    // sui ran even though harbor (one of its predecessors) skipped.
    expect(ran).toContain("sui");
    const byId = new Map(result.steps.map((s) => [s.nodeId, s]));
    expect(byId.get("sui")?.status).toBe("done");
  });

  it("marks a node with no executor as an error", async () => {
    const result = await runWorkflow(
      {
        nodes: [{ id: "x", type: "trigger", label: "Trigger" }],
        edges: [],
      },
      makeCtx(),
      // Empty executor map override removes the trigger executor.
      { executors: { trigger: undefined as unknown as StepExecutor } },
    );
    expect(result.status).toBe("error");
    expect(result.steps[0]?.error).toContain("No executor");
  });
});
