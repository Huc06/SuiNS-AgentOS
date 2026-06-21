import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentOSClient } from "../src/client.js";
import { computeManifestHash, serializeManifest } from "../src/manifest.js";
import {
  buildManifestFromSuperpowerOutput,
  detectSuperpowerProject,
  parseSuiperpowerOutput,
} from "../src/suiperpower.js";
import type { SkillManifest } from "../src/types.js";

/**
 * Integration test for the Suiperpower bridge wired into the full skill
 * lifecycle (Task 28.5):
 *
 *   Suiperpower build output → auto-detect → parse + assemble →
 *   publish → resolve → download → verify manifest matches build output.
 *
 * This reuses the Task 20 harness style: an in-memory Harbor blob store driven
 * by a stubbed global `fetch` (upload returns a blobId, download returns the
 * uploaded bytes), a hand-rolled mock Sui client, a mock signer, and a spy on
 * `Transaction.prototype.build` so PTB construction never hits the network.
 *
 * Only the two external boundaries are mocked (Walrus/Harbor and the Sui
 * client); the manifest serialization/hashing and the Suiperpower bridge run
 * for real. The test closes the loop by asserting the downloaded/resolved
 * manifest deep-equals the manifest assembled directly from the Suiperpower
 * build output.
 */

const PACKAGE_ID =
  "0x6568deb11f5fa2f69b370ab797fbf1ee3db67a6151bd4a48b9f6233874c70c6a";

/** A minimal `sui client publish --json` artifact with a published change. */
function publishJson(packageId: string): string {
  return JSON.stringify({
    digest: "abc",
    objectChanges: [
      { type: "mutated", objectId: "0x1" },
      { type: "published", packageId, version: "1", digest: "def" },
    ],
  });
}

/** The skill.manifest.json Suiperpower writes into its output directory. */
const SKILL_MANIFEST = {
  name: "web-search",
  version: "1.0.0",
  publisher: "@my-agent/web-search",
  manifestType: "sui-agent-skill/v1" as const,
  mcp: {
    compatible: true,
    tools: [{ name: "search", description: "Search the web" }],
  },
  // movePackage here is the OLD value; the published packageId must win.
  sui: { movePackage: "0xOLD", entry: "search", policyRequired: [] },
  dependencies: [],
};

// ---------------------------------------------------------------------------
// Harbor fetch router: an in-memory Walrus blob store driven by global fetch.
// ---------------------------------------------------------------------------

interface HarborRouter {
  fetchImpl: (...args: never[]) => unknown;
  blobStore: Map<string, Uint8Array>;
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

      // Upload: POST .../buckets/{bucket}/files (multipart/form-data, field "file").
      if (method === "POST" && url.includes("/files")) {
        const blobId = `blob-${++counter}`;
        const form = init?.body as FormData;
        const file = form?.get?.("file") as Blob | undefined;
        const bytes = file
          ? new Uint8Array(await file.arrayBuffer())
          : new Uint8Array();
        blobStore.set(blobId, bytes);
        // Harbor's real 202 shape: { data: FileSummary } with blob_id present.
        return {
          ok: true,
          status: 202,
          json: async () => ({
            data: { id: `file-${counter}`, blob_id: blobId, status: "completed" },
          }),
        };
      }

      // Download: GET .../blobs/{blobId}
      const match = url.match(/\/blobs\/([^/?]+)/);
      const blobId = match?.[1];
      const content = blobId ? blobStore.get(blobId) : undefined;
      if (!content) {
        return { ok: false, status: 404, text: async () => "Not Found" };
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => toArrayBuffer(content),
      };
    },
  );

  return { fetchImpl, blobStore };
}

// ---------------------------------------------------------------------------
// Sui client + signer mocks
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

function createMockSigner() {
  return {
    toSuiAddress: () =>
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    signTransaction: vi.fn().mockResolvedValue({ signature: "sig_mock" }),
  };
}

/** Build on-chain SkillDescriptor `content.fields` for a manifest. */
function descriptorFields(opts: {
  manifest: SkillManifest;
  blobId: string;
  hash: string;
}) {
  return {
    skill_id: opts.manifest.name,
    walrus_manifest_blob: opts.blobId,
    manifest_hash: opts.hash,
    mvr_package_name: opts.manifest.publisher,
    version: opts.manifest.version,
    required_capabilities: opts.manifest.sui.policyRequired ?? [],
    dependencies: opts.manifest.dependencies ?? [],
    seal_policy_id: "",
  };
}

// ---------------------------------------------------------------------------

describe("suiperpower → lifecycle integration", () => {
  let router: HarborRouter;
  let buildSpy: { mockRestore: () => void };
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "suiperpower-integration-"));

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
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("auto-detects, publishes, resolves, and verifies the manifest matches the build output", async () => {
    // -----------------------------------------------------------------
    // 1. Simulate a Suiperpower build output directory.
    //    A `.suiperpower/` marker dir makes detectSuperpowerProject true;
    //    the output dir carries the manifest + publish artifact.
    // -----------------------------------------------------------------
    mkdirSync(join(tmpDir, ".suiperpower"));
    const outputDir = join(tmpDir, ".suiperpower", "output");
    mkdirSync(outputDir);
    writeFileSync(
      join(outputDir, "skill.manifest.json"),
      JSON.stringify(SKILL_MANIFEST),
    );
    writeFileSync(
      join(outputDir, "publish-testnet.json"),
      publishJson(PACKAGE_ID),
    );

    // -----------------------------------------------------------------
    // 2. Auto-detect.
    // -----------------------------------------------------------------
    expect(detectSuperpowerProject(tmpDir)).toBe(true);

    // -----------------------------------------------------------------
    // 3. Parse + assemble. The published packageId must override the stale
    //    movePackage embedded in skill.manifest.json.
    // -----------------------------------------------------------------
    const result = parseSuiperpowerOutput(outputDir);
    expect(result.packageId).toBe(PACKAGE_ID);

    const manifest = buildManifestFromSuperpowerOutput(result, {
      agentName: "alpha.sui",
    });
    expect(manifest.sui.movePackage).toBe(PACKAGE_ID);
    expect(manifest.name).toBe("web-search");
    expect(manifest.publisher).toBe("@my-agent/web-search");

    // -----------------------------------------------------------------
    // 4. Publish — uploads to (mock) Walrus and runs the create PTB.
    // -----------------------------------------------------------------
    const mockClient = createMockSuiClient({
      digest: "tx_suiperpower",
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

    const published = await client.publishSkill({
      signer: signer as never,
      manifest,
      bucketId: "bucket-1",
      agentName: "alpha.sui",
    });

    // The upload happened and the bytes are the deterministic serialization.
    expect(published.walrusManifestBlob).toMatch(/^blob-\d+$/);
    const uploaded = router.blobStore.get(published.walrusManifestBlob);
    expect(uploaded).toBeDefined();
    expect(new Uint8Array(uploaded!)).toEqual(serializeManifest(manifest));

    // The descriptor hash matches the hash of the serialized manifest.
    const expectedHash = computeManifestHash(serializeManifest(manifest));
    expect(published.manifestHash).toBe(expectedHash);

    // -----------------------------------------------------------------
    // 5. Resolve + download. Wire on-chain resolution to point at the
    //    freshly published blob/hash and the assembled manifest's fields.
    // -----------------------------------------------------------------
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
          }),
        },
      },
    });

    const resolved = await client.resolveSkill("web-search.alpha.sui");
    expect(resolved.walrusManifestBlob).toBe(published.walrusManifestBlob);
    expect(resolved.manifestHash).toBe(published.manifestHash);

    const downloadedManifest = await client.downloadManifest(
      resolved.walrusManifestBlob,
      resolved.manifestHash,
    );

    // -----------------------------------------------------------------
    // 6. Verify the loop closes: the downloaded/resolved manifest matches
    //    the Suiperpower-assembled build output, and the on-chain pointers
    //    line up with what was published.
    // -----------------------------------------------------------------
    expect(downloadedManifest).toEqual(manifest);
    expect(downloadedManifest.sui.movePackage).toBe(PACKAGE_ID);
    expect(resolved.walrusManifestBlob).toBe(published.walrusManifestBlob);
    expect(resolved.manifestHash).toBe(expectedHash);
  });
});
