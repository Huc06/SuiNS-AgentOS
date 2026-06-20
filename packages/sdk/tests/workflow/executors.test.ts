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

describe("memory executor", () => {
  it("skips with a clear note when no memory backend is wired", async () => {
    const r = await executors.memory(node("memory"), makeCtx(), []);
    expect(r.status).toBe("skipped");
    expect((r.output as { note: string }).note).toBe("memwal not configured");
  });

  it("remembers a summary of prior outputs in the agent namespace", async () => {
    const remember = vi.fn(async () => ({ ok: true }));
    const ctx = makeCtx({
      passport: { id: "0xabc", memoryNamespace: "ns://alpha" },
      memory: { remember },
    });
    const prev = [
      { nodeId: "walrus", type: "walrus" as const, status: "done" as const, output: { blobId: "B" } },
    ];
    const r = await executors.memory(node("memory"), ctx, prev);

    expect(r.status).toBe("done");
    expect(remember).toHaveBeenCalledWith(
      "ns://alpha",
      JSON.stringify([{ blobId: "B" }]),
    );
  });

  it("falls back to agentName when no memory namespace is set", async () => {
    const remember = vi.fn(async () => ({}));
    const ctx = makeCtx({ memory: { remember } });
    await executors.memory(node("memory"), ctx, []);
    expect(remember).toHaveBeenCalledWith("alpha.sui", "[]");
  });
});
