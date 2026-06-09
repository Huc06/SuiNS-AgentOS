import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentOSClient } from "./client.js";
import type { SkillManifest } from "./types.js";

// Mock global fetch for Harbor client calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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
      movePackage: "0xabc123",
      entry: "trade_module::execute",
      policyRequired: [],
    },
    dependencies: [],
    ...overrides,
  };
}

/**
 * Create a mock Sui client with minimal methods needed by AgentOSClient.
 */
function createMockSuiClient(opts?: {
  resolveAddress?: string | null;
  objectFields?: Record<string, unknown> | null;
  executeResult?: {
    digest: string;
    effects?: { status?: { status: string; error?: string } };
    objectChanges?: Array<{
      type: string;
      objectId: string;
      objectType?: string;
    }>;
  };
}) {
  return {
    resolveNameServiceAddress: vi
      .fn()
      .mockResolvedValue(opts?.resolveAddress ?? null),
    getObject: vi.fn().mockResolvedValue({
      data: opts?.objectFields
        ? { content: { fields: opts.objectFields } }
        : undefined,
    }),
    executeTransactionBlock: opts?.executeResult
      ? vi.fn().mockResolvedValue(opts.executeResult)
      : vi.fn().mockResolvedValue(undefined),
  };
}

function createMockSigner() {
  // Valid 64-hex-char Sui address (32 bytes)
  return {
    toSuiAddress: () =>
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    signTransaction: vi.fn().mockResolvedValue({ signature: "sig_mock" }),
  };
}

describe("AgentOSClient skill lifecycle", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv("HARBOR_API_KEY", "hbr_test_key");
    vi.stubEnv("HARBOR_SPACE_ID", "space-1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("publishSkill", () => {
    it("creates a new skill descriptor when no existing record in registry", async () => {
      // Mock Harbor upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ blobId: "blob-new-123" }),
      });

      const mockClient = createMockSuiClient();
      const client = new AgentOSClient({
        client: mockClient as never,
        harborApiKey: "hbr_test_key",
        spaceId: "space-1",
      });

      const manifest = validManifest();
      const signer = createMockSigner();

      const result = await client.publishSkill({
        signer: signer as never,
        manifest,
        bucketId: "bucket-1",
        agentName: "alpha.sui",
      });

      expect(result.skillId).toBe("trade");
      expect(result.walrusManifestBlob).toBe("blob-new-123");
      expect(result.manifestHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.version).toBe("1.0.0");
      expect(result.mvrPackageName).toBe("@alpha/trade");
    });

    it("uses provided walrusManifestBlob and skips upload", async () => {
      const mockClient = createMockSuiClient();
      const client = new AgentOSClient({
        client: mockClient as never,
        harborApiKey: "hbr_test_key",
        spaceId: "space-1",
      });

      const manifest = validManifest();
      const signer = createMockSigner();

      const result = await client.publishSkill({
        signer: signer as never,
        manifest,
        bucketId: "bucket-1",
        agentName: "alpha.sui",
        walrusManifestBlob: "pre-uploaded-blob",
      });

      // Should NOT have called fetch for upload
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.walrusManifestBlob).toBe("pre-uploaded-blob");
    });

    it("includes sealPolicyId in result when private option set", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ blobId: "blob-private" }),
      });

      const mockClient = createMockSuiClient();
      const client = new AgentOSClient({
        client: mockClient as never,
        harborApiKey: "hbr_test_key",
        spaceId: "space-1",
      });

      const manifest = validManifest();
      const signer = createMockSigner();

      const result = await client.publishSkill({
        signer: signer as never,
        manifest,
        bucketId: "bucket-1",
        agentName: "alpha.sui",
        private: { sealPolicyId: "0xpolicy123" },
      });

      expect(result.sealPolicyId).toBe("0xpolicy123");
    });

    it("validates manifest before publishing", async () => {
      const mockClient = createMockSuiClient();
      const client = new AgentOSClient({
        client: mockClient as never,
        harborApiKey: "hbr_test_key",
        spaceId: "space-1",
      });

      const invalidManifest = {
        ...validManifest(),
        manifestType: "invalid" as "sui-agent-skill/v1",
      };
      const signer = createMockSigner();

      await expect(
        client.publishSkill({
          signer: signer as never,
          manifest: invalidManifest,
          bucketId: "bucket-1",
          agentName: "alpha.sui",
        }),
      ).rejects.toThrow(
        "Invalid manifestType: invalid. Expected sui-agent-skill/v1",
      );
    });
  });

  describe("resolveSkill", () => {
    it("resolves a skill by SuiNS name using on-chain lookup", async () => {
      const mockClient = createMockSuiClient({
        resolveAddress: "0xskill_obj_123",
        objectFields: {
          skill_id: "trade",
          walrus_manifest_blob: "blob-xyz",
          manifest_hash: "abc123hash",
          mvr_package_name: "@alpha/trade",
          version: "1.0.0",
          required_capabilities: [],
          dependencies: [],
          seal_policy_id: "",
        },
      });

      const client = new AgentOSClient({
        client: mockClient as never,
      });

      const descriptor = await client.resolveSkill("trade.alpha.sui");

      expect(descriptor.skillId).toBe("trade");
      expect(descriptor.walrusManifestBlob).toBe("blob-xyz");
      expect(descriptor.manifestHash).toBe("abc123hash");
      expect(descriptor.version).toBe("1.0.0");
    });

    it("throws 'Skill not found' when SuiNS name does not resolve", async () => {
      const mockClient = createMockSuiClient({
        resolveAddress: null,
      });

      const client = new AgentOSClient({
        client: mockClient as never,
      });

      await expect(client.resolveSkill("missing.agent.sui")).rejects.toThrow(
        "Skill not found: missing.agent.sui",
      );
    });

    it("throws 'Skill not found' when resolved object has invalid fields", async () => {
      const mockClient = createMockSuiClient({
        resolveAddress: "0xsome_obj",
        objectFields: null,
      });

      // Override getObject to return no data
      mockClient.getObject.mockResolvedValue({ data: undefined });

      const client = new AgentOSClient({
        client: mockClient as never,
      });

      // The on-chain resolution throws "Invalid SkillDescriptor" which is caught,
      // then falls through to local registry which is not set, resulting in "Skill not found"
      await expect(client.resolveSkill("bad.agent.sui")).rejects.toThrow(
        "Skill not found: bad.agent.sui",
      );
    });
  });

  describe("executeSkill", () => {
    it("throws Missing required capability when agent lacks a policy", async () => {
      // Setup: resolveSkill will use local registry, so we use a registry-based path
      const manifest = validManifest({
        sui: {
          movePackage: "0xpkg",
          entry: "mod::run",
          policyRequired: ["admin_cap"],
        },
      });

      // Mock the download flow
      const serialized = new TextEncoder().encode(JSON.stringify(manifest));
      const { createHash } = await import("node:crypto");
      const hash = createHash("sha256").update(serialized).digest("hex");

      // Mock Harbor download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => serialized.buffer,
      });

      const mockClient = createMockSuiClient({
        resolveAddress: "0xskill_addr",
        objectFields: {
          skill_id: "trade",
          walrus_manifest_blob: "blob-exec",
          manifest_hash: hash,
          mvr_package_name: "@alpha/trade",
          version: "1.0.0",
          required_capabilities: ["admin_cap"],
          dependencies: [],
          seal_policy_id: "",
        },
      });

      const client = new AgentOSClient({
        client: mockClient as never,
        harborApiKey: "hbr_test_key",
      });

      const signer = createMockSigner();

      await expect(
        client.executeSkill({
          signer: signer as never,
          suinsName: "trade.alpha.sui",
          agentCapabilities: [], // No capabilities provided
        }),
      ).rejects.toThrow("Missing required capability: admin_cap");
    });

    it("succeeds when agent has all required capabilities", async () => {
      // Instead of mocking the full Sui SDK Transaction.build() pipeline,
      // we mock at the module level by using vi.mock on @mysten/sui/transactions
      const manifest = validManifest({
        sui: {
          movePackage:
            "0x0000000000000000000000000000000000000000000000000000000000000002",
          entry: "mod::run",
          policyRequired: ["transfer"],
        },
      });

      const serialized = new TextEncoder().encode(JSON.stringify(manifest));
      const { createHash } = await import("node:crypto");
      const hash = createHash("sha256").update(serialized).digest("hex");

      // Mock Harbor download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => serialized.buffer,
      });

      const mockClient = createMockSuiClient({
        resolveAddress:
          "0x0000000000000000000000000000000000000000000000000000000000000099",
        objectFields: {
          skill_id: "trade",
          walrus_manifest_blob: "blob-exec",
          manifest_hash: hash,
          mvr_package_name: "@alpha/trade",
          version: "1.0.0",
          required_capabilities: ["transfer"],
          dependencies: [],
          seal_policy_id: "",
        },
        executeResult: {
          digest: "tx_digest_123",
          effects: { status: { status: "success" } },
        },
      });

      const client = new AgentOSClient({
        client: mockClient as never,
        harborApiKey: "hbr_test_key",
      });

      const signer = createMockSigner();

      // Mock Transaction.prototype.build to skip Sui SDK internal resolution
      const { Transaction } = await import("@mysten/sui/transactions");
      const buildSpy = vi
        .spyOn(Transaction.prototype, "build")
        .mockResolvedValue(new Uint8Array([1, 2, 3]));

      try {
        const result = await client.executeSkill({
          signer: signer as never,
          suinsName: "trade.alpha.sui",
          agentCapabilities: ["transfer", "extra_cap"],
        });

        expect(result.digest).toBe("tx_digest_123");
        expect(result.effects).toEqual({ status: { status: "success" } });
        expect(buildSpy).toHaveBeenCalled();
      } finally {
        buildSpy.mockRestore();
      }
    });

    it("verifies manifest integrity during execution", async () => {
      const manifest = validManifest();
      const serialized = new TextEncoder().encode(JSON.stringify(manifest));

      // Mock Harbor download
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => serialized.buffer,
      });

      const mockClient = createMockSuiClient({
        resolveAddress: "0xskill_addr",
        objectFields: {
          skill_id: "trade",
          walrus_manifest_blob: "blob-bad",
          manifest_hash: "wrong_hash_value",
          mvr_package_name: "@alpha/trade",
          version: "1.0.0",
          required_capabilities: [],
          dependencies: [],
          seal_policy_id: "",
        },
      });

      const client = new AgentOSClient({
        client: mockClient as never,
        harborApiKey: "hbr_test_key",
      });

      const signer = createMockSigner();

      await expect(
        client.executeSkill({
          signer: signer as never,
          suinsName: "trade.alpha.sui",
        }),
      ).rejects.toThrow(/Manifest integrity check failed/);
    });
  });

  describe("downloadManifest", () => {
    it("downloads and verifies manifest integrity", async () => {
      const manifest = validManifest();
      const serialized = new TextEncoder().encode(JSON.stringify(manifest));
      const { createHash } = await import("node:crypto");
      const hash = createHash("sha256").update(serialized).digest("hex");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => serialized.buffer,
      });

      const mockClient = createMockSuiClient();
      const client = new AgentOSClient({
        client: mockClient as never,
        harborApiKey: "hbr_test_key",
      });

      const result = await client.downloadManifest("blob-123", hash);
      expect(result.name).toBe("trade");
      expect(result.version).toBe("1.0.0");
    });

    it("throws on integrity check failure", async () => {
      const manifest = validManifest();
      const serialized = new TextEncoder().encode(JSON.stringify(manifest));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => serialized.buffer,
      });

      const mockClient = createMockSuiClient();
      const client = new AgentOSClient({
        client: mockClient as never,
        harborApiKey: "hbr_test_key",
      });

      await expect(
        client.downloadManifest("blob-123", "incorrect_hash"),
      ).rejects.toThrow(
        /Manifest integrity check failed: expected incorrect_hash, got/,
      );
    });

    it("throws on blob not found (404)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      });

      const mockClient = createMockSuiClient();
      const client = new AgentOSClient({
        client: mockClient as never,
        harborApiKey: "hbr_test_key",
      });

      await expect(
        client.downloadManifest("missing-blob", "somehash"),
      ).rejects.toThrow("Manifest blob not found: missing-blob");
    });
  });
});
