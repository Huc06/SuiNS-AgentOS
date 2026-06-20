import { afterEach, describe, expect, it, vi } from "vitest";

import { executors } from "../../src/workflow/executors.js";
import type { RunContext, WorkflowNode } from "../../src/workflow/types.js";

function makeCtx(overrides: Partial<RunContext> = {}): RunContext {
  return {
    agentName: "alpha.sui",
    client: {},
    execute: vi.fn(async () => ({ digest: "0xdigest", objectChanges: [] })),
    ...overrides,
  };
}

const node = (type: WorkflowNode["type"], params?: Record<string, unknown>): WorkflowNode => ({
  id: type,
  type,
  label: type,
  ...(params ? { params } : {}),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("trigger executor", () => {
  it("returns done and echoes params", async () => {
    const r = await executors.trigger(
      node("trigger", { foo: 1 }),
      makeCtx(),
      [],
    );
    expect(r.status).toBe("done");
    expect(r.output).toEqual({ started: true, params: { foo: 1 } });
  });
});

describe("walrus executor", () => {
  it("uploads via the injected uploadManifest and returns its blobId", async () => {
    const uploadManifest = vi.fn(async (..._a: unknown[]) => ({
      blobId: "BLOB_123",
    }));
    const r = await executors.walrus(
      node("walrus", { manifest: { name: "x" } }),
      makeCtx({ uploadManifest }),
      [],
    );
    expect(r.status).toBe("done");
    expect(r.blobId).toBe("BLOB_123");
    expect(uploadManifest).toHaveBeenCalledWith({ name: "x" });
  });

  it("falls back to a direct Walrus upload when no uploader is injected", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ newlyCreated: { blobObject: { blobId: "W1" } } }),
    }));
    vi.stubGlobal("fetch", mockFetch);

    const r = await executors.walrus(node("walrus"), makeCtx(), []);
    expect(r.status).toBe("done");
    expect(r.blobId).toBe("W1");
    expect(mockFetch).toHaveBeenCalledOnce();
  });
});

describe("harbor executor", () => {
  it("skips public skills (no private flag)", async () => {
    const r = await executors.harbor(node("harbor"), makeCtx(), []);
    expect(r.status).toBe("skipped");
    expect((r.output as { note: string }).note).toMatch(/encryption skipped/);
  });

  it("errors when marked private without a sealPolicyId", async () => {
    const r = await executors.harbor(
      node("harbor", { private: true }),
      makeCtx(),
      [],
    );
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/no sealPolicyId/);
  });

  it("Seal-encrypts then uploads the ciphertext for a private skill", async () => {
    const uploadManifest = vi.fn(async (..._a: unknown[]) => ({
      blobId: "ENC_1",
    }));
    const r = await executors.harbor(
      node("harbor", {
        private: true,
        sealPolicyId: "0xpolicy",
        manifest: { secret: "hi" },
      }),
      makeCtx({ uploadManifest }),
      [],
    );

    expect(r.status).toBe("done");
    expect(r.blobId).toBe("ENC_1");
    expect(uploadManifest).toHaveBeenCalledOnce();

    const arg = uploadManifest.mock.calls[0]?.[0] as {
      encrypted: number[];
      sealPolicyId: string;
    };
    expect(arg.sealPolicyId).toBe("0xpolicy");
    // The uploaded bytes carry the Seal envelope magic ("AOSEAL1").
    const magic = new TextDecoder().decode(
      new Uint8Array(arg.encrypted.slice(0, 7)),
    );
    expect(magic).toBe("AOSEAL1");
  });
});

describe("sui executor", () => {
  it("records execution against the passport and returns the tx digest", async () => {
    const execute = vi.fn(async () => ({
      digest: "0xRECORD",
      objectChanges: [],
    }));
    const ctx = makeCtx({
      passport: { id: "0xabc" },
      execute,
    });
    const r = await executors.sui(node("sui", { packageId: "0x2" }), ctx, []);

    expect(r.status).toBe("done");
    expect(r.txDigest).toBe("0xRECORD");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("runs a generic move-call from movePackage/entry params", async () => {
    const execute = vi.fn(async () => ({ digest: "0xCALL" }));
    const r = await executors.sui(
      node("sui", { movePackage: "0x9", entry: "mod::fn" }),
      makeCtx({ execute }),
      [],
    );
    expect(r.status).toBe("done");
    expect(r.txDigest).toBe("0xCALL");
  });

  it("skips when there is no passport id and no move target", async () => {
    const execute = vi.fn(async () => ({ digest: "x" }));
    const r = await executors.sui(node("sui"), makeCtx({ execute }), []);
    expect(r.status).toBe("skipped");
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("memory executor (remember)", () => {
  it("skips with a clear note when no memory backend is wired", async () => {
    const r = await executors.memory(node("memory"), makeCtx(), []);
    expect(r.status).toBe("skipped");
    expect((r.output as { note: string }).note).toBe("memwal not configured");
  });

  it("remembers a compact digest of prior steps and reports the real blob id", async () => {
    const remember = vi.fn(async () => ({ blobId: "0xMEMBLOB" }));
    const recall = vi.fn(async () => ({ results: [] }));
    const ctx = makeCtx({
      passport: { id: "0xabc", memoryNamespace: "ns://alpha" },
      memory: { remember, recall },
    });
    const prev = [
      {
        nodeId: "walrus",
        type: "walrus" as const,
        status: "done" as const,
        blobId: "B",
        output: { blobId: "B" },
      },
      {
        nodeId: "sui",
        type: "sui" as const,
        status: "done" as const,
        txDigest: "0xTX",
        output: { digest: "0xTX" },
      },
    ];
    const r = await executors.memory(node("memory"), ctx, prev);

    expect(r.status).toBe("done");
    // Not a JSON.stringify dump — a readable per-node summary line.
    expect(remember).toHaveBeenCalledWith(
      "ns://alpha",
      "walrus: blob B; sui: tx 0xTX",
    );
    // The synchronous Walrus blob id is surfaced (chip + Link).
    expect(r.blobId).toBe("0xMEMBLOB");
    expect(r.output).toMatchObject({ namespace: "ns://alpha", blobId: "0xMEMBLOB" });
  });

  it("remembers an explicit params.text verbatim", async () => {
    const remember = vi.fn(async () => ({ id: "mem_1" }));
    const recall = vi.fn();
    const ctx = makeCtx({ memory: { remember, recall } });
    await executors.memory(
      node("memory", { text: "remember this exact note" }),
      ctx,
      [],
    );
    expect(remember).toHaveBeenCalledWith(
      "alpha.sui",
      "remember this exact note",
    );
  });

  it("fills a template from prior step outputs", async () => {
    const remember = vi.fn(async () => ({}));
    const recall = vi.fn();
    const ctx = makeCtx({ memory: { remember, recall } });
    const prev = [
      {
        nodeId: "walrus",
        type: "walrus" as const,
        status: "done" as const,
        blobId: "BLOB99",
        output: { blobId: "BLOB99" },
      },
    ];
    await executors.memory(
      node("memory", { namespace: "custom.ns", template: "stored at {{walrus.blobId}}" }),
      ctx,
      prev,
    );
    expect(remember).toHaveBeenCalledWith("custom.ns", "stored at BLOB99");
  });

  it("falls back to agentName when no namespace is set", async () => {
    const remember = vi.fn(async () => ({}));
    const recall = vi.fn();
    const ctx = makeCtx({ memory: { remember, recall } });
    await executors.memory(node("memory"), ctx, []);
    expect(remember).toHaveBeenCalledWith("alpha.sui", "workflow run");
  });
});

describe("memory-recall executor", () => {
  it("skips with a clear note when no memory backend is wired", async () => {
    const r = await executors["memory-recall"](
      node("memory-recall", { query: "q" }),
      makeCtx(),
      [],
    );
    expect(r.status).toBe("skipped");
    expect((r.output as { note: string }).note).toBe("memwal not configured");
  });

  it("errors when no query is provided", async () => {
    const remember = vi.fn();
    const recall = vi.fn();
    const ctx = makeCtx({ memory: { remember, recall } });
    const r = await executors["memory-recall"](node("memory-recall"), ctx, []);
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/no query/);
    expect(recall).not.toHaveBeenCalled();
  });

  it("recalls ranked results (score = 1 - distance) into the graph", async () => {
    const remember = vi.fn();
    const recall = vi.fn(async () => ({
      results: [
        { text: "closest match", distance: 0.1, blobId: "0xR1" },
        { memory: "second", distance: 0.4 },
        "bare string memory",
      ],
    }));
    const ctx = makeCtx({
      passport: { memoryNamespace: "ns://alpha" },
      memory: { remember, recall },
    });
    const r = await executors["memory-recall"](
      node("memory-recall", { query: "what did I store", limit: "3" }),
      ctx,
      [],
    );

    expect(r.status).toBe("done");
    expect(recall).toHaveBeenCalledWith("ns://alpha", "what did I store", 3);
    const out = r.output as {
      namespace: string;
      query: string;
      total: number;
      results: { text: string; score?: number; blobId?: string }[];
    };
    expect(out.namespace).toBe("ns://alpha");
    expect(out.query).toBe("what did I store");
    expect(out.total).toBe(3);
    expect(out.results[0]).toEqual({
      text: "closest match",
      score: 0.9,
      blobId: "0xR1",
    });
    expect(out.results[1]).toMatchObject({ text: "second", score: 0.6 });
    expect(out.results[2]).toEqual({ text: "bare string memory" });
  });

  it("passes a raw score through unchanged and tolerates a bare array", async () => {
    const remember = vi.fn();
    const recall = vi.fn(async () => [{ content: "hi", score: 0.42 }]);
    const ctx = makeCtx({ memory: { remember, recall } });
    const r = await executors["memory-recall"](
      node("memory-recall", { query: "q" }),
      ctx,
      [],
    );
    const out = r.output as { results: { text: string; score?: number }[] };
    expect(out.results).toEqual([{ text: "hi", score: 0.42 }]);
    // No explicit limit param → recall called without a limit.
    expect(recall).toHaveBeenCalledWith("alpha.sui", "q", undefined);
  });

  it("recalls from a query in ctx.params when the node has none", async () => {
    const remember = vi.fn();
    const recall = vi.fn(async () => ({ results: [] }));
    const ctx = makeCtx({
      params: { query: "from ctx params" },
      memory: { remember, recall },
    });
    await executors["memory-recall"](node("memory-recall"), ctx, []);
    expect(recall).toHaveBeenCalledWith("alpha.sui", "from ctx params", undefined);
  });
});
