import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentOSClient } from "../src/client.js";
import { DependencyResolver } from "../src/dependency-resolver.js";
import { computeManifestHash, serializeManifest } from "../src/manifest.js";
import { deriveGroupId, deriveMembershipProof } from "../src/seal.js";
import type { SkillManifest } from "../src/types.js";

/**
 * Integration tests for the full skill lifecycle:
 *   publish → resolve → download → execute
 *
 * These tests wire the real SDK components (manifest serialization/hashing,
 * Seal AES-GCM encryption, DependencyResolver, LocalRegistry) together and only
 * mock the two external boundaries:
 *   1. Harbor/Walrus blob storage — via a stubbed global `fetch` that keeps an
 *      in-memory blob store (upload returns a blobId, download returns the exact
 *      bytes that were uploaded).
 *   2. The Sui client — via a hand-rolled mock exposing the few methods the SDK
 *      uses (`resolveNameServiceAddress`, `getObject`, `executeTransactionBlock`).
 *
 * `Transaction.prototype.build` is spied so PTB construction never reaches the
 * real Sui SDK network-resolution path.
 */

// ---------------------------------------------------------------------------
// Harbor fetch router: an in-memory Walrus blob store driven by global fetch.
// ---------------------------------------------------------------------------

interface HarborRouter {
  fetchImpl: (...args: never[]) => unknown;
  blobStore: Map<string, Uint8Array>;
  /** Seed a blob directly (used by dependency-graph setup). */
  put(blobId: string, content: Uint8Array): void;
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  return copy.buffer;
}

function createHarborRouter(): HarborRouter {
  const blobStore = new Map<string, Uint8Array>();
  let counter = 0;

  const fetchImpl = vi.fn(
    async (url: string, init?: { method?: string; body?: unknown }) => {
      const method = init?.method ?? "GET";

      // Upload: POST .../buckets/{bucket}/files
      if (method === "POST" && url.includes("/files")) {
        const body = init?.body as Buffer | Uint8Array;
        const blobId = `blob-${++counter}`;
        blobStore.set(blobId, new Uint8Array(body));
        return {
          ok: true,
          status: 200,
          json: async () => ({ blobId }),
        };
      }

      // Download: GET .../blobs/{blobId}
      const match = url.match(/\/blobs\/([^/?]+)/);
      const blobId = match?.[1];
      const content = blobId ? blobStore.get(blobId) : undefined;
      if (!content) {
        return {
          ok: false,
          status: 404,
          text: async () => "Not Found",
        };
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => toArrayBuffer(content),
      };
    },
  );

  return {
    fetchImpl,
    blobStore,
    put: (blobId, content) => blobStore.set(blobId, content),
  };
}

// ---------------------------------------------------------------------------
// Sui client mock
// ---------------------------------------------------------------------------

interface ExecuteResult {
  digest: string;
  effects?: { status?: { status: string; error?: string } };
  objectChanges?: Array<{
    type: string;
    objectId: string;
    objectType?: string;
  }>;
}

function createMockSuiClient(executeResult?: ExecuteResult) {
  return {
    resolveNameServiceAddress: vi.fn().mockResolvedValue(null),
    getObject: vi.fn().mockResolvedValue({ data: undefined }),
    executeTransactionBlock: vi
      .fn()
      .mockResolvedValue(executeResult ?? undefined),
  };
}

const TEST_PACKAGE_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000abc";

function createMockSigner() {
  return {
    toSuiAddress: () =>
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    signTransaction: vi.fn().mockResolvedValue({ signature: "sig_mock" }),
  };
}

function validManifest(overrides?: Partial<SkillManifest>): SkillManifest {
  return {
    name: "trade",
    version: "1.0.0",
    publisher: "alpha.sui",
    manifestType: "sui-agent-skill/v1",
    mcp: {
      compatible: true,
      tools: [{ name: "swap", description: "Execute a token swap" }],
    },
    sui: {
      movePackage:
        "0x0000000000000000000000000000000000000000000000000000000000000002",
      entry: "trade_module::execute",
      policyRequired: [],
    },
    dependencies: [],
    ...overrides,
  };
}

/** Build on-chain SkillDescriptor `content.fields` for a manifest. */
function descriptorFields(opts: {
  manifest: SkillManifest;
  blobId: string;
  hash: string;
  requiredCapabilities?: string[];
  dependencies?: string[];
  sealPolicyId?: string;
}) {
  return {
    skill_id: opts.manifest.name,
    walrus_manifest_blob: opts.blobId,
    manifest_hash: opts.hash,
    mvr_package_name: `@alpha/${opts.manifest.name}`,
    version: opts.manifest.version,
    required_capabilities: opts.requiredCapabilities ?? [],
    dependencies: opts.dependencies ?? [],
    seal_policy_id: opts.sealPolicyId ?? "",
  };
}

// ---------------------------------------------------------------------------

describe("skill lifecycle integration", () => {
  let router: HarborRouter;
  let buildSpy: { mockRestore: () => void };
  const tempRegistryFiles: string[] = [];

  beforeEach(async () => {
    router = createHarborRouter();
    vi.stubGlobal("fetch", router.fetchImpl);
    vi.stubEnv("HARBOR_API_KEY", "hbr_test_key");
    vi.stubEnv("HARBOR_SPACE_ID", "space-1");

    // Spy Transaction.build so PTB construction never hits the network.
    const { Transaction } = await import("@mysten/sui/transactions");
    buildSpy = vi
      .spyOn(Transaction.prototype, "build")
      .mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  afterEach(() => {
    buildSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    for (const file of tempRegistryFiles.splice(0)) {
      if (existsSync(file)) unlinkSync(file);
    }
  });

  function tempRegistryPath(): string {
    const path = join(
      tmpdir(),
      `agentos-registry-${randomBytes(8).toString("hex")}.json`,
    );
    tempRegistryFiles.push(path);
    return path;
  }

  // -------------------------------------------------------------------------
  // 20.1 — Full publish → resolve → download → execute pipeline
  // -------------------------------------------------------------------------
  it("runs the full publish → resolve → download → execute pipeline", async () => {
    const manifest = validManifest({
      sui: {
        movePackage:
          "0x0000000000000000000000000000000000000000000000000000000000000002",
        entry: "trade_module::execute",
        policyRequired: ["transfer"],
      },
    });

    const mockClient = createMockSuiClient({
      digest: "tx_digest_full",
      effects: { status: { status: "success" } },
      objectChanges: [
        {
          type: "created",
          objectId:
            "0x00000000000000000000000000000000000000000000000000000000000000aa",
          objectType: "0x2::skill_descriptor::SkillDescriptor",
        },
      ],
    });

    const client = new AgentOSClient({
      client: mockClient as never,
      harborApiKey: "hbr_test_key",
      spaceId: "space-1",
    });
    const signer = createMockSigner();

    // 1. Publish — uploads to (mock) Walrus and runs the create PTB.
    const published = await client.publishSkill({
      signer: signer as never,
      manifest,
      bucketId: "bucket-1",
      agentName: "alpha.sui",
    });

    expect(published.skillId).toBe("trade");
    expect(published.walrusManifestBlob).toMatch(/^blob-\d+$/);
    expect(published.manifestHash).toBe(
      computeManifestHash(serializeManifest(manifest)),
    );

    // The uploaded bytes must be the deterministic serialization of the manifest.
    const uploaded = router.blobStore.get(published.walrusManifestBlob);
    expect(uploaded).toBeDefined();
    expect(new Uint8Array(uploaded!)).toEqual(serializeManifest(manifest));

    // 2. Wire on-chain resolution to point at the freshly published blob/hash.
    mockClient.resolveNameServiceAddress.mockResolvedValue(
      "0x00000000000000000000000000000000000000000000000000000000000000aa",
    );
    mockClient.getObject.mockResolvedValue({
      data: {
        content: {
          fields: descriptorFields({
            manifest,
            blobId: published.walrusManifestBlob,
            hash: published.manifestHash,
            requiredCapabilities: ["transfer"],
          }),
        },
      },
    });

    const resolved = await client.resolveSkill("trade.alpha.sui");
    expect(resolved.skillId).toBe("trade");
    expect(resolved.walrusManifestBlob).toBe(published.walrusManifestBlob);
    expect(resolved.manifestHash).toBe(published.manifestHash);

    // 3. Download — integrity check must pass and the manifest round-trips.
    const downloaded = await client.downloadManifest(
      resolved.walrusManifestBlob,
      resolved.manifestHash,
    );
    expect(downloaded).toEqual(manifest);

    // 4. Execute — capabilities satisfied, returns the digest.
    const result = await client.executeSkill({
      signer: signer as never,
      suinsName: "trade.alpha.sui",
      agentCapabilities: ["transfer"],
    });

    expect(result.digest).toBe("tx_digest_full");
    expect(result.effects).toEqual({ status: { status: "success" } });
    expect(buildSpy).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 20.2 — Upgrade flow: publish v1 then v2 takes the update path
  // -------------------------------------------------------------------------
  it("takes the update path when publishing v2 of an existing skill", async () => {
    const registryPath = tempRegistryPath();
    const signer = createMockSigner();

    // v1: the on-chain create returns objectId 0x...01.
    const mockClient = createMockSuiClient({
      digest: "tx_v1",
      effects: { status: { status: "success" } },
      objectChanges: [
        {
          type: "created",
          objectId:
            "0x0000000000000000000000000000000000000000000000000000000000000011",
          objectType: "0x2::skill_descriptor::SkillDescriptor",
        },
      ],
    });

    const client = new AgentOSClient({
      client: mockClient as never,
      harborApiKey: "hbr_test_key",
      spaceId: "space-1",
      registryPath,
    });

    const v1 = validManifest({ version: "1.0.0" });
    await client.publishSkill({
      signer: signer as never,
      manifest: v1,
      bucketId: "bucket-1",
      agentName: "alpha.sui",
    });

    const registry = client.registry!;
    const recordAfterV1 = registry.snapshot.skills.find(
      (s) => s.agentSlug === "alpha" && s.skillId === "trade",
    );
    expect(recordAfterV1).toBeDefined();
    expect(recordAfterV1!.objectId).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000011",
    );
    expect(recordAfterV1!.version).toBe("v1.0.0");

    // v2: the mock now returns a DIFFERENT created objectId. The update path
    // must reuse the existing object id (0x...11) and IGNORE this one — if the
    // code mistakenly took the create path, the record would flip to 0x...22.
    mockClient.executeTransactionBlock.mockResolvedValue({
      digest: "tx_v2",
      effects: { status: { status: "success" } },
      objectChanges: [
        {
          type: "created",
          objectId:
            "0x0000000000000000000000000000000000000000000000000000000000000022",
          objectType: "0x2::skill_descriptor::SkillDescriptor",
        },
      ],
    });

    const v2 = validManifest({ version: "2.0.0" });
    await client.publishSkill({
      signer: signer as never,
      manifest: v2,
      bucketId: "bucket-1",
      agentName: "alpha.sui",
    });

    const recordAfterV2 = registry.snapshot.skills.find(
      (s) => s.agentSlug === "alpha" && s.skillId === "trade",
    );
    expect(recordAfterV2).toBeDefined();
    // Same object id preserved → update path was taken (not a second create).
    expect(recordAfterV2!.objectId).toBe(
      "0x0000000000000000000000000000000000000000000000000000000000000011",
    );
    // Version bumped to v2.
    expect(recordAfterV2!.version).toBe("v2.0.0");

    // Exactly one record for this skill (no duplicate created on upgrade).
    const tradeRecords = registry.snapshot.skills.filter(
      (s) => s.agentSlug === "alpha" && s.skillId === "trade",
    );
    expect(tradeRecords).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 20.3 — Dependency resolution flow: topological order
  // -------------------------------------------------------------------------
  it("resolves dependencies in topological order and executes", async () => {
    // Dependency graph: trade → lib-a → lib-b   (lib-b has no deps)
    const libB = validManifest({
      name: "lib-b",
      dependencies: [],
    });
    const libA = validManifest({
      name: "lib-a",
      dependencies: ["lib-b.alpha.sui"],
    });
    const root = validManifest({
      name: "trade",
      dependencies: ["lib-a.alpha.sui"],
      sui: {
        movePackage:
          "0x0000000000000000000000000000000000000000000000000000000000000002",
        entry: "trade_module::execute",
        policyRequired: [],
      },
    });

    const serRoot = serializeManifest(root);
    const serA = serializeManifest(libA);
    const serB = serializeManifest(libB);
    const hashRoot = computeManifestHash(serRoot);
    const hashA = computeManifestHash(serA);
    const hashB = computeManifestHash(serB);

    router.put("blob-root", serRoot);
    router.put("blob-liba", serA);
    router.put("blob-libb", serB);

    const addressByName: Record<string, string> = {
      "trade.alpha.sui": "0xroot",
      "lib-a.alpha.sui": "0xliba",
      "lib-b.alpha.sui": "0xlibb",
    };
    const fieldsByAddress: Record<
      string,
      ReturnType<typeof descriptorFields>
    > = {
      "0xroot": descriptorFields({
        manifest: root,
        blobId: "blob-root",
        hash: hashRoot,
        dependencies: ["lib-a.alpha.sui"],
      }),
      "0xliba": descriptorFields({
        manifest: libA,
        blobId: "blob-liba",
        hash: hashA,
        dependencies: ["lib-b.alpha.sui"],
      }),
      "0xlibb": descriptorFields({
        manifest: libB,
        blobId: "blob-libb",
        hash: hashB,
      }),
    };

    const mockClient = createMockSuiClient({
      digest: "tx_deps",
      effects: { status: { status: "success" } },
    });
    mockClient.resolveNameServiceAddress.mockImplementation(
      async ({ name }: { name: string }) => addressByName[name] ?? null,
    );
    mockClient.getObject.mockImplementation(async ({ id }: { id: string }) => ({
      data: fieldsByAddress[id]
        ? { content: { fields: fieldsByAddress[id] } }
        : undefined,
    }));

    const client = new AgentOSClient({
      client: mockClient as never,
      harborApiKey: "hbr_test_key",
      spaceId: "space-1",
    });

    // Direct resolver assertion: dependencies come before dependents.
    const resolver = new DependencyResolver(client);
    const ordered = await resolver.resolve(root);
    const orderedNames = ordered.map((d) => d.name);
    expect(orderedNames).toContain("lib-a.alpha.sui");
    expect(orderedNames).toContain("lib-b.alpha.sui");
    expect(orderedNames.indexOf("lib-b.alpha.sui")).toBeLessThan(
      orderedNames.indexOf("lib-a.alpha.sui"),
    );

    // End-to-end: executeSkill resolves the same dependency graph and succeeds.
    const signer = createMockSigner();
    const result = await client.executeSkill({
      signer: signer as never,
      suinsName: "trade.alpha.sui",
    });
    expect(result.digest).toBe("tx_deps");
  });

  // -------------------------------------------------------------------------
  // 20.4 — Private skill flow: encrypt → upload → download → decrypt
  // -------------------------------------------------------------------------
  it("encrypts on publish and decrypts on download with a valid membership proof", async () => {
    const sealPolicyId = "0xpolicy_private_123";
    const manifest = validManifest({ name: "secret-trade" });

    const mockClient = createMockSuiClient({
      digest: "tx_private",
      effects: { status: { status: "success" } },
      objectChanges: [
        {
          type: "created",
          objectId:
            "0x00000000000000000000000000000000000000000000000000000000000000bb",
          objectType: "0x2::skill_descriptor::SkillDescriptor",
        },
      ],
    });

    const client = new AgentOSClient({
      client: mockClient as never,
      harborApiKey: "hbr_test_key",
      spaceId: "space-1",
    });
    const signer = createMockSigner();

    const published = await client.publishSkill({
      signer: signer as never,
      manifest,
      bucketId: "bucket-1",
      agentName: "alpha.sui",
      private: { sealPolicyId },
    });

    expect(published.sealPolicyId).toBe(sealPolicyId);
    // The hash is computed over the PLAINTEXT serialization (before encryption).
    const plaintextHash = computeManifestHash(serializeManifest(manifest));
    expect(published.manifestHash).toBe(plaintextHash);

    // The bytes actually stored in Walrus are ciphertext, not the plaintext.
    const stored = router.blobStore.get(published.walrusManifestBlob);
    expect(stored).toBeDefined();
    expect(new Uint8Array(stored!)).not.toEqual(serializeManifest(manifest));

    // Download WITH a valid membership proof decrypts back to the original.
    const proof = deriveMembershipProof(sealPolicyId);
    const decrypted = await client.downloadManifest(
      published.walrusManifestBlob,
      published.manifestHash,
      { sealPolicyId, membershipProof: proof },
    );
    expect(decrypted).toEqual(manifest);

    // Download WITHOUT a valid proof is denied.
    const groupId = deriveGroupId(sealPolicyId);
    await expect(
      client.downloadManifest(
        published.walrusManifestBlob,
        published.manifestHash,
        { sealPolicyId },
      ),
    ).rejects.toThrow(`Access denied: not a member of group ${groupId}`);
  });

  // -------------------------------------------------------------------------
  // createAgent — on-chain mint records the real AgentPassport object id
  // -------------------------------------------------------------------------
  it("createAgent mints on-chain and records the real passport object id", async () => {
    const onChainId =
      "0x00000000000000000000000000000000000000000000000000000000000000c1";
    const mockClient = createMockSuiClient({
      digest: "tx_create_agent",
      effects: { status: { status: "success" } },
      objectChanges: [
        {
          type: "created",
          objectId: onChainId,
          objectType: `${TEST_PACKAGE_ID}::agent_passport::AgentPassport`,
        },
      ],
    });

    const client = new AgentOSClient({
      client: mockClient as never,
      packageId: TEST_PACKAGE_ID,
      registryPath: tempRegistryPath(),
    });

    const passport = await client.createAgent({
      signer: createMockSigner() as never,
      name: "minted.sui",
      runtimeWallet:
        "0x0000000000000000000000000000000000000000000000000000000000000009",
    });

    expect(mockClient.executeTransactionBlock).toHaveBeenCalled();
    expect(passport.id).toBe(onChainId);
  });

  it("createAgent falls back to a registry id when execution is unavailable", async () => {
    // Mock client without executeTransactionBlock → on-chain path is a no-op.
    const mockClient = {
      resolveNameServiceAddress: vi.fn().mockResolvedValue(null),
      getObject: vi.fn().mockResolvedValue({ data: undefined }),
    };

    const client = new AgentOSClient({
      client: mockClient as never,
      packageId: TEST_PACKAGE_ID,
      registryPath: tempRegistryPath(),
    });

    const passport = await client.createAgent({
      signer: createMockSigner() as never,
      name: "fallback.sui",
      runtimeWallet:
        "0x0000000000000000000000000000000000000000000000000000000000000009",
    });

    // A synthetic id is generated; it must be a 0x address but not a real mint.
    expect(passport.id).toMatch(/^0x[0-9a-f]+$/);
  });
});
