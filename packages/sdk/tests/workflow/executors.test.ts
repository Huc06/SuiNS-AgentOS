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
  vi.unstubAllEnvs();
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
  it("skips a public skill when no Harbor account is configured", async () => {
    const r = await executors.harbor(node("harbor"), makeCtx(), []);
    expect(r.status).toBe("skipped");
    expect((r.output as { note: string }).note).toMatch(
      /no Harbor configured/,
    );
  });

  it("uploads a PUBLIC skill's PLAIN payload to real Harbor when configured", async () => {
    // With a real Harbor account wired, even a public skill is stored (plaintext,
    // no Seal) so the user sees real data in their Harbor bucket.
    const upload = vi.fn(async (_bytes: Uint8Array, _name: string) => ({
      blobId: "HARBOR_PUBLIC",
      fileId: "HARBOR_PUBLIC",
      url: "https://api.testnet.harbor.walrus.xyz/api/v1/buckets/b/files/HARBOR_PUBLIC/download",
    }));

    const r = await executors.harbor(
      node("harbor", { manifest: { name: "open-skill" } }),
      makeCtx({ harbor: { upload } }),
      [],
    );

    expect(r.status).toBe("done");
    expect(r.blobId).toBe("HARBOR_PUBLIC");
    expect(upload).toHaveBeenCalledOnce();
    const out = r.output as {
      storage: string;
      visibility: string;
      encryption: string;
      fileId: string;
    };
    expect(out.storage).toBe("harbor");
    expect(out.visibility).toBe("public");
    expect(out.encryption).toBe("none");
    expect(out.fileId).toBe("HARBOR_PUBLIC");

    // The uploaded bytes are the PLAIN payload — NOT a Seal envelope.
    const [bytes] = upload.mock.calls[0] as [Uint8Array, string];
    const magic = new TextDecoder().decode(bytes.slice(0, 7));
    expect(magic).not.toBe("AOSEAL1");
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
    // No real Harbor uploader → it falls back to the generic uploader (Walrus).
    expect((r.output as { storage?: string }).storage).toBe("walrus");

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

  it("uploads the ciphertext to REAL Harbor via the injected ctx.harbor uploader", async () => {
    const upload = vi.fn(async (_bytes: Uint8Array, _name: string) => ({
      blobId: "HARBOR_BLOB_1",
      fileId: "HARBOR_BLOB_1",
      url: "https://api.testnet.harbor.walrus.xyz/api/v1/blobs/HARBOR_BLOB_1",
    }));
    // A generic uploader is also wired; the harbor uploader MUST take precedence.
    const uploadManifest = vi.fn(async () => ({ blobId: "WALRUS_FALLBACK" }));

    const r = await executors.harbor(
      node("harbor", {
        private: true,
        sealPolicyId: "0xpolicy",
        filename: "secret.seal",
        manifest: { secret: "hi" },
      }),
      makeCtx({ harbor: { upload }, uploadManifest }),
      [],
    );

    expect(r.status).toBe("done");
    expect(r.blobId).toBe("HARBOR_BLOB_1");
    // Real Harbor took precedence; the Walrus fallback was never called.
    expect(upload).toHaveBeenCalledOnce();
    expect(uploadManifest).not.toHaveBeenCalled();

    const out = r.output as {
      storage: string;
      fileId: string;
      url: string;
      sealPolicyId: string;
    };
    expect(out.storage).toBe("harbor");
    expect(out.fileId).toBe("HARBOR_BLOB_1");
    expect(out.url).toContain("/api/v1/blobs/HARBOR_BLOB_1");
    expect(out.sealPolicyId).toBe("0xpolicy");

    // The uploaded bytes are the Seal ciphertext (carry the envelope magic),
    // and the explicit filename is forwarded.
    const [bytes, filename] = upload.mock.calls[0] as [Uint8Array, string];
    expect(filename).toBe("secret.seal");
    const magic = new TextDecoder().decode(bytes.slice(0, 7));
    expect(magic).toBe("AOSEAL1");
  });

  it("falls back to the Walrus upload and ends DONE when ctx.harbor THROWS (404)", async () => {
    // Real Harbor 404s (the exact production failure). The node must NOT
    // hard-error — it falls back to the working Walrus upload and ends DONE so
    // the downstream Memory node runs.
    const upload = vi.fn(async () => {
      throw new Error("Harbor upload failed: 404 Not Found");
    });
    const uploadManifest = vi.fn(async () => ({ blobId: "WALRUS_SAVED" }));

    const r = await executors.harbor(
      node("harbor", {
        private: true,
        sealPolicyId: "0xpolicy",
        manifest: { secret: "hi" },
      }),
      makeCtx({ harbor: { upload }, uploadManifest }),
      [],
    );

    expect(r.status).toBe("done");
    expect(r.blobId).toBe("WALRUS_SAVED");
    expect(upload).toHaveBeenCalledOnce();
    // Walrus fallback DID run after Harbor threw.
    expect(uploadManifest).toHaveBeenCalledOnce();

    const out = r.output as { storage: string; note?: string; harborError?: string };
    expect(out.storage).toBe("walrus");
    expect(out.note).toMatch(/Harbor API unavailable/);
    expect(out.harborError).toMatch(/404/);
  });

  it("falls back to a direct Walrus PUT (no uploadManifest) when ctx.harbor 404s", async () => {
    const upload = vi.fn(async () => {
      throw new Error("Harbor upload failed: 404 Not Found");
    });
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ newlyCreated: { blobObject: { blobId: "W_DIRECT" } } }),
    }));
    vi.stubGlobal("fetch", mockFetch);

    const r = await executors.harbor(
      node("harbor", { private: true, sealPolicyId: "0xpolicy" }),
      makeCtx({ harbor: { upload } }),
      [],
    );

    expect(r.status).toBe("done");
    expect(r.blobId).toBe("W_DIRECT");
    expect((r.output as { storage: string }).storage).toBe("walrus");
    // The direct Walrus publisher PUT was used as the fallback.
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("falls back to Walrus when ctx.harbor returns no blobId", async () => {
    // Harbor accepted the upload but surfaced no blob id (async timed out): we
    // must not return an empty blob — fall back to Walrus instead.
    const upload = vi.fn(async () => ({ blobId: "", fileId: "f1" }));
    const uploadManifest = vi.fn(async () => ({ blobId: "WALRUS_SAVED" }));

    const r = await executors.harbor(
      node("harbor", { private: true, sealPolicyId: "0xpolicy" }),
      makeCtx({ harbor: { upload }, uploadManifest }),
      [],
    );

    expect(r.status).toBe("done");
    expect(r.blobId).toBe("WALRUS_SAVED");
    expect((r.output as { storage: string }).storage).toBe("walrus");
  });

  it("uses REAL Seal (ctx.seal) ciphertext when it succeeds, with no AES note", async () => {
    // ctx.seal returns a genuine Seal EncryptedObject payload (marked). The
    // harbor executor must upload THOSE bytes (not the AES envelope) and report
    // encryption: "real-seal" with no demo wording.
    const realBytes = new Uint8Array([
      ...new TextEncoder().encode("SEALREAL1"),
      42,
      43,
      44,
    ]);
    const seal = vi.fn(async (_data: Uint8Array, _policy: string) => realBytes);
    const upload = vi.fn(async (_bytes: Uint8Array, _name: string) => ({
      blobId: "HARBOR_REAL",
      fileId: "HARBOR_REAL",
      url: "https://api.testnet.harbor.walrus.xyz/api/v1/blobs/HARBOR_REAL",
    }));

    const r = await executors.harbor(
      node("harbor", {
        private: true,
        sealPolicyId: "0xpolicy",
        manifest: { secret: "hi" },
      }),
      makeCtx({ seal, harbor: { upload } }),
      [],
    );

    expect(r.status).toBe("done");
    expect(r.blobId).toBe("HARBOR_REAL");
    expect(seal).toHaveBeenCalledOnce();
    // The bytes handed to Harbor are the REAL Seal payload, not the AES envelope.
    const [bytes] = upload.mock.calls[0] as [Uint8Array, string];
    const magic = new TextDecoder().decode(bytes.slice(0, 9));
    expect(magic).toBe("SEALREAL1");

    const out = r.output as { encryption: string; note?: string };
    expect(out.encryption).toBe("real-seal");
    // Real Seal succeeded → no AES demo wording.
    expect(out.note ?? "").not.toMatch(/AES demo/);
  });

  it("falls back to the AES envelope when ctx.seal returns null", async () => {
    // Real Seal unavailable (e.g. offline) → ctx.seal returns null. The executor
    // must fall back to the AES envelope (AOSEAL1 magic) and stay DONE, marking
    // the encryption mode honestly as the AES demo.
    const seal = vi.fn(async (_data: Uint8Array, _policy: string) => null);
    const upload = vi.fn(async (_bytes: Uint8Array, _name: string) => ({
      blobId: "HARBOR_AES",
      fileId: "HARBOR_AES",
    }));

    const r = await executors.harbor(
      node("harbor", {
        private: true,
        sealPolicyId: "0xpolicy",
        manifest: { secret: "hi" },
      }),
      makeCtx({ seal, harbor: { upload } }),
      [],
    );

    expect(r.status).toBe("done");
    expect(r.blobId).toBe("HARBOR_AES");
    expect(seal).toHaveBeenCalledOnce();
    // The uploaded bytes are the AES envelope (AOSEAL1), not a real Seal object.
    const [bytes] = upload.mock.calls[0] as [Uint8Array, string];
    const magic = new TextDecoder().decode(bytes.slice(0, 7));
    expect(magic).toBe("AOSEAL1");

    const out = r.output as { encryption: string; note?: string };
    expect(out.encryption).toBe("aes-demo");
    expect(out.note).toMatch(/AES demo/);
  });

  it("falls back to the AES envelope when ctx.seal THROWS", async () => {
    const seal = vi.fn(async (_data: Uint8Array, _policy: string) => {
      throw new Error("seal network down");
    });
    const uploadManifest = vi.fn(async (..._a: unknown[]) => ({
      blobId: "WALRUS_AES",
    }));

    const r = await executors.harbor(
      node("harbor", { private: true, sealPolicyId: "0xpolicy" }),
      makeCtx({ seal, uploadManifest }),
      [],
    );

    expect(r.status).toBe("done");
    expect(seal).toHaveBeenCalledOnce();
    const out = r.output as { encryption: string };
    expect(out.encryption).toBe("aes-demo");
    // The bytes uploaded to Walrus carry the AES envelope magic.
    const arg = uploadManifest.mock.calls[0]?.[0] as { encrypted: number[] };
    const magic = new TextDecoder().decode(
      new Uint8Array(arg.encrypted.slice(0, 7)),
    );
    expect(magic).toBe("AOSEAL1");
  });

  it("errors only when BOTH Harbor and the Walrus fallback fail", async () => {
    const upload = vi.fn(async () => {
      throw new Error("Harbor upload failed: 500 boom");
    });
    const uploadManifest = vi.fn(async () => {
      throw new Error("Walrus upload failed: 503 down");
    });

    const r = await executors.harbor(
      node("harbor", { private: true, sealPolicyId: "0xpolicy" }),
      makeCtx({ harbor: { upload }, uploadManifest }),
      [],
    );

    expect(r.status).toBe("error");
    expect(r.error).toMatch(/Harbor upload failed.*500/);
    expect(r.error).toMatch(/Walrus fallback also failed.*503/);
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

  it("skips gracefully (no MVR hard-error) when the package id is the placeholder", async () => {
    // No ctx.packageId and no env id → resolveMovePackageId returns the MVR
    // package NAME placeholder "@agentos/contracts". The executor must degrade
    // to a clear skip rather than building a tx that triggers the @mysten/sui
    // "MVR Api URL is not set" error.
    vi.stubEnv("AGENTOS_PACKAGE_ID", "");
    const execute = vi.fn(async () => ({ digest: "x" }));
    const r = await executors.sui(
      node("sui"),
      makeCtx({ passport: { id: "0xabc" }, execute }),
      [],
    );
    expect(r.status).toBe("skipped");
    expect(execute).not.toHaveBeenCalled();
    expect((r.output as { note: string }).note).toMatch(
      /set NEXT_PUBLIC_AGENTOS_PACKAGE_ID/,
    );
  });

  it("records execution when a real 0x package id is in ctx", async () => {
    vi.stubEnv("AGENTOS_PACKAGE_ID", "");
    const execute = vi.fn(async () => ({ digest: "0xR", objectChanges: [] }));
    const r = await executors.sui(
      node("sui"),
      makeCtx({
        passport: { id: "0xabc" },
        packageId:
          "0x00000000000000000000000000000000000000000000000000000000000a905a",
        execute,
      }),
      [],
    );
    expect(r.status).toBe("done");
    expect(r.txDigest).toBe("0xR");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("skips a generic move-call when the target package is a non-0x MVR name", async () => {
    const execute = vi.fn(async () => ({ digest: "x" }));
    const r = await executors.sui(
      node("sui", { movePackage: "@agentos/contracts", entry: "mod::fn" }),
      makeCtx({ execute }),
      [],
    );
    expect(r.status).toBe("skipped");
    expect(execute).not.toHaveBeenCalled();
    expect((r.output as { note: string }).note).toMatch(/not a published 0x/);
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
