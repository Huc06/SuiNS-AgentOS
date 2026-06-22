import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * Tests for MCP skill tools:
 * - agentos_publish_skill (success, missing key, invalid manifest)
 * - agentos_execute_skill (success, missing capability, dependency error)
 * - agentos_resolve_manifest (success, not found)
 *
 * We test the handler logic by replicating the parsing/dispatch from server.ts.
 * The AgentOSClient is mocked so we can control return values and verify calls.
 */

// --- Mocks (using vi.hoisted to make them available in vi.mock factories) ---

const {
  mockPublishSkill,
  mockExecuteSkill,
  mockResolveSkill,
  mockDownloadManifest,
  mockPublishSkillLocal,
} = vi.hoisted(() => ({
  mockPublishSkill: vi.fn(),
  mockExecuteSkill: vi.fn(),
  mockResolveSkill: vi.fn(),
  mockDownloadManifest: vi.fn(),
  mockPublishSkillLocal: vi.fn(() => ({
    skillId: "test-skill",
    agentSlug: "alpha",
  })),
}));

vi.mock("@agentos-sui/sdk", () => ({
  AgentOSClient: vi.fn(() => ({
    publishSkill: mockPublishSkill,
    executeSkill: mockExecuteSkill,
    resolveSkill: mockResolveSkill,
    downloadManifest: mockDownloadManifest,
  })),
  formatSkillSubname: (skillName: string, agentName: string) => {
    const skill = skillName.trim().replace(/^\.+|\.+$/g, "");
    let agent = agentName.trim().replace(/^\.+|\.+$/g, "");
    if (!agent.endsWith(".sui")) agent = `${agent}.sui`;
    return `${skill}.${agent}`;
  },
}));

vi.mock("@agentos-sui/sdk/node", () => ({
  loadConfig: vi.fn(() => ({
    network: "testnet",
    dashboardUrl: "http://localhost:3000",
    harborApiKey: undefined,
    packageId: undefined,
    rpcUrl: undefined,
  })),
  resolveRegistryPath: vi.fn(() => "/tmp/test-registry.json"),
  LocalRegistry: {
    open: vi.fn(() => ({
      resolveAgent: vi.fn(),
      listSkills: vi.fn(() => []),
      registerAgent: vi.fn(),
      publishSkill: mockPublishSkillLocal,
      snapshot: { skills: [], agents: [] },
    })),
  },
}));

// --- Imports (after mocks) ---

import { AgentOSClient, formatSkillSubname } from "@agentos-sui/sdk";
import { loadConfig, LocalRegistry } from "@agentos-sui/sdk/node";

// --- Handler logic replicating server.ts with direct config/env checks ---

interface SkillManifestLike {
  name: string;
  version: string;
  publisher: string;
  manifestType: string;
  mcp: { compatible: boolean; tools: unknown[] };
  sui: { movePackage: string; entry: string; policyRequired: string[] };
  dependencies: string[];
}

/**
 * Replicate the publish skill handler from server.ts
 */
async function handlePublishSkill(args: {
  agentName: string;
  manifestJson: string;
  walrusBlob?: string;
}): Promise<Record<string, unknown>> {
  const input = z
    .object({
      agentName: z.string(),
      manifestJson: z.string(),
      walrusBlob: z.string().optional(),
    })
    .parse(args);

  // Parse and validate the manifest
  let manifest: SkillManifestLike;
  try {
    manifest = JSON.parse(input.manifestJson);
  } catch {
    return { error: "Invalid JSON in manifestJson" };
  }

  if (manifest.manifestType !== "sui-agent-skill/v1") {
    return {
      error: `Invalid manifestType: ${manifest.manifestType}. Expected sui-agent-skill/v1`,
    };
  }

  // Check if Harbor API key is configured
  const config = loadConfig() as { harborApiKey?: string };
  const harborApiKey =
    config.harborApiKey ?? process.env.HARBOR_API_KEY?.trim();

  // Check for signer
  const secret = process.env.SUI_PRIVATE_KEY ?? process.env.AGENTOS_PRIVATE_KEY;

  // A pre-uploaded Walrus blob skips the upload step, so the Harbor API key is
  // only required when we actually need to upload the manifest (no walrusBlob).
  const hasPreUploadedBlob = Boolean(input.walrusBlob);

  if (secret && (harborApiKey || hasPreUploadedBlob)) {
    // On-chain publish (uploads to Walrus, or registers the provided blob).
    const client = new AgentOSClient({
      client: {} as never,
      harborApiKey,
      registryPath: "/tmp/test-registry.json",
    });

    try {
      const bucketId = process.env.HARBOR_BUCKET_ID?.trim() ?? "default";
      const descriptor = await client.publishSkill({
        signer: { toSuiAddress: () => "0xtest" } as never,
        manifest: manifest as unknown as import("@agentos-sui/sdk").SkillManifest,
        bucketId,
        agentName: input.agentName,
        walrusManifestBlob: input.walrusBlob,
      });

      const suinsName = formatSkillSubname(descriptor.skillId, input.agentName);
      const persisted = (
        LocalRegistry.open("/tmp/test-registry.json") as unknown as {
          listSkills: (name: string) => Array<{
            skillId: string;
            objectId?: string;
            suinsName?: string;
          }>;
        }
      )
        .listSkills(input.agentName)
        .find((s) => s.skillId === descriptor.skillId);

      return {
        blobId: descriptor.walrusManifestBlob,
        objectId: persisted?.objectId,
        suinsName: persisted?.suinsName ?? suinsName,
        manifestHash: descriptor.manifestHash,
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  if (!harborApiKey) {
    return { error: "Harbor API key not configured" };
  }

  // Local-only fallback (signer missing)
  const registry = LocalRegistry.open("/tmp/test-registry.json");
  const record = (
    registry as unknown as { publishSkill: (opts: unknown) => unknown }
  ).publishSkill({
    agentName: input.agentName,
    manifest,
    walrusManifestBlob: input.walrusBlob,
  });
  return { skill: record };
}

/**
 * Replicate the execute skill handler from server.ts
 */
async function handleExecuteSkill(args: {
  suinsName: string;
  params?: string;
}): Promise<Record<string, unknown>> {
  const input = z
    .object({
      suinsName: z.string(),
      params: z.string().optional(),
    })
    .parse(args);

  // Check for signer
  const secret = process.env.SUI_PRIVATE_KEY ?? process.env.AGENTOS_PRIVATE_KEY;
  if (!secret) {
    return {
      error: "No signer available. Set SUI_PRIVATE_KEY or AGENTOS_PRIVATE_KEY",
    };
  }

  const client = new AgentOSClient({
    client: {} as never,
    registryPath: "/tmp/test-registry.json",
  });

  // Parse params
  let params: Record<string, unknown> | undefined;
  if (input.params) {
    try {
      params = JSON.parse(input.params);
    } catch {
      return { error: "Invalid JSON in params" };
    }
  }

  try {
    const result = await client.executeSkill({
      signer: { toSuiAddress: () => "0xtest" } as never,
      suinsName: input.suinsName,
      params,
    });
    return { digest: result.digest, effects: result.effects };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Replicate the resolve manifest handler from server.ts
 */
async function handleResolveManifest(args: {
  suinsName: string;
}): Promise<Record<string, unknown>> {
  const input = z
    .object({
      suinsName: z.string(),
    })
    .parse(args);

  const client = new AgentOSClient({
    client: {} as never,
    registryPath: "/tmp/test-registry.json",
  });

  try {
    const descriptor = await client.resolveSkill(input.suinsName);
    const manifest = await client.downloadManifest(
      descriptor.walrusManifestBlob,
      descriptor.manifestHash,
    );
    return { descriptor, manifest };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// --- Helpers ---

function validManifestJson() {
  return JSON.stringify({
    name: "trade",
    version: "1.0.0",
    publisher: "alpha.sui",
    manifestType: "sui-agent-skill/v1",
    mcp: { compatible: true, tools: [] },
    sui: { movePackage: "0xabc", entry: "trade::execute", policyRequired: [] },
    dependencies: [],
  });
}

// --- Tests ---

describe("MCP agentos_publish_skill tool", () => {
  beforeEach(() => {
    mockPublishSkill.mockReset();
    mockExecuteSkill.mockReset();
    mockResolveSkill.mockReset();
    mockDownloadManifest.mockReset();
    mockPublishSkillLocal.mockReset();
    mockPublishSkillLocal.mockReturnValue({
      skillId: "test-skill",
      agentSlug: "alpha",
    });
    delete process.env.HARBOR_API_KEY;
    delete process.env.SUI_PRIVATE_KEY;
    delete process.env.AGENTOS_PRIVATE_KEY;
    delete process.env.HARBOR_BUCKET_ID;
    delete process.env.HARBOR_SPACE_ID;
  });

  describe("input validation", () => {
    it("should reject invalid manifestJson (not valid JSON)", async () => {
      const result = await handlePublishSkill({
        agentName: "alpha.sui",
        manifestJson: "not-json{{{",
      });
      expect(result.error).toContain("Invalid JSON");
    });

    it("should reject manifest with wrong manifestType", async () => {
      const badManifest = JSON.stringify({
        name: "test",
        version: "1.0.0",
        publisher: "alpha.sui",
        manifestType: "wrong-type/v2",
        mcp: { compatible: true, tools: [] },
        sui: { movePackage: "0x1", entry: "mod::fn", policyRequired: [] },
        dependencies: [],
      });
      const result = await handlePublishSkill({
        agentName: "alpha.sui",
        manifestJson: badManifest,
      });
      expect(result.error).toContain("Invalid manifestType");
      expect(result.error).toContain("wrong-type/v2");
    });

    it("should accept valid sui-agent-skill/v1 manifest type", async () => {
      const result = await handlePublishSkill({
        agentName: "alpha.sui",
        manifestJson: validManifestJson(),
      });
      expect(result.error).not.toContain("Invalid manifestType");
    });
  });

  describe("missing Harbor API key", () => {
    it("should return error when Harbor API key is not configured", async () => {
      const result = await handlePublishSkill({
        agentName: "alpha.sui",
        manifestJson: validManifestJson(),
      });
      expect(result.error).toBe("Harbor API key not configured");
    });
  });

  describe("successful publish", () => {
    it("should call publishSkill with walrusBlob when provided (skip upload)", async () => {
      process.env.HARBOR_API_KEY = "hbr_test_key";
      process.env.SUI_PRIVATE_KEY = "test-secret-key";

      mockPublishSkill.mockResolvedValueOnce({
        skillId: "trade",
        walrusManifestBlob: "pre-uploaded-blob-id",
        manifestHash: "abc123hash",
        mvrPackageName: "@alpha/trade",
        version: "1.0.0",
        requiredCapabilities: [],
        dependencies: [],
      });

      const result = await handlePublishSkill({
        agentName: "alpha.sui",
        manifestJson: validManifestJson(),
        walrusBlob: "pre-uploaded-blob-id",
      });

      expect(result.blobId).toBe("pre-uploaded-blob-id");
      expect(result.manifestHash).toBe("abc123hash");
      expect(result.suinsName).toBe("trade.alpha.sui");
      expect(mockPublishSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          walrusManifestBlob: "pre-uploaded-blob-id",
          agentName: "alpha.sui",
        }),
      );
    });

    it("should return structured result with blobId, objectId, suinsName, manifestHash", async () => {
      process.env.HARBOR_API_KEY = "hbr_test_key";
      process.env.SUI_PRIVATE_KEY = "test-secret-key";

      mockPublishSkill.mockResolvedValueOnce({
        skillId: "trade",
        walrusManifestBlob: "blob-xyz",
        manifestHash: "hash-abc",
        mvrPackageName: "@alpha/trade",
        version: "1.0.0",
        requiredCapabilities: [],
        dependencies: [],
      });

      const result = await handlePublishSkill({
        agentName: "alpha.sui",
        manifestJson: validManifestJson(),
      });

      expect(result).toHaveProperty("blobId");
      expect(result).toHaveProperty("objectId");
      expect(result).toHaveProperty("suinsName");
      expect(result).toHaveProperty("manifestHash");
    });

    it("should register a pre-uploaded walrusBlob even without a Harbor API key", async () => {
      // No HARBOR_API_KEY set — only a signer is available.
      process.env.SUI_PRIVATE_KEY = "test-secret-key";

      mockPublishSkill.mockResolvedValueOnce({
        skillId: "trade",
        walrusManifestBlob: "pre-uploaded-blob-id",
        manifestHash: "abc123hash",
        mvrPackageName: "@alpha/trade",
        version: "1.0.0",
        requiredCapabilities: [],
        dependencies: [],
      });

      const result = await handlePublishSkill({
        agentName: "alpha.sui",
        manifestJson: validManifestJson(),
        walrusBlob: "pre-uploaded-blob-id",
      });

      // Should take the on-chain publish path (not the missing-key error),
      // since the manifest is already uploaded and no Harbor upload is needed.
      expect(result.error).toBeUndefined();
      expect(result.blobId).toBe("pre-uploaded-blob-id");
      expect(result.suinsName).toBe("trade.alpha.sui");
      expect(mockPublishSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          walrusManifestBlob: "pre-uploaded-blob-id",
        }),
      );
    });

    it("should still require a Harbor API key when no walrusBlob is provided", async () => {
      // Signer present but no Harbor key and no pre-uploaded blob → must error.
      process.env.SUI_PRIVATE_KEY = "test-secret-key";

      const result = await handlePublishSkill({
        agentName: "alpha.sui",
        manifestJson: validManifestJson(),
      });

      expect(result.error).toBe("Harbor API key not configured");
      expect(mockPublishSkill).not.toHaveBeenCalled();
    });
  });
});

describe("MCP agentos_execute_skill tool", () => {
  beforeEach(() => {
    mockExecuteSkill.mockReset();
    mockResolveSkill.mockReset();
    mockDownloadManifest.mockReset();
    delete process.env.HARBOR_API_KEY;
    delete process.env.SUI_PRIVATE_KEY;
    delete process.env.AGENTOS_PRIVATE_KEY;
  });

  describe("success", () => {
    it("should return digest and effects on successful execution", async () => {
      process.env.SUI_PRIVATE_KEY = "test-secret-key";

      mockExecuteSkill.mockResolvedValueOnce({
        digest: "0xdigest123",
        effects: { status: { status: "success" } },
      });

      const result = await handleExecuteSkill({
        suinsName: "trade.alpha.sui",
      });

      expect(result.digest).toBe("0xdigest123");
      expect(result.effects).toEqual({ status: { status: "success" } });
    });

    it("should pass parsed params to executeSkill", async () => {
      process.env.SUI_PRIVATE_KEY = "test-secret-key";

      mockExecuteSkill.mockResolvedValueOnce({
        digest: "0xdigest456",
        effects: { status: { status: "success" } },
      });

      await handleExecuteSkill({
        suinsName: "trade.alpha.sui",
        params: JSON.stringify({ amount: 100, token: "SUI" }),
      });

      expect(mockExecuteSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { amount: 100, token: "SUI" },
        }),
      );
    });
  });

  describe("missing capability error", () => {
    it("should return error when agent lacks required capability", async () => {
      process.env.SUI_PRIVATE_KEY = "test-secret-key";

      mockExecuteSkill.mockRejectedValueOnce(
        new Error("Missing required capability: trade_policy"),
      );

      const result = await handleExecuteSkill({
        suinsName: "trade.alpha.sui",
      });

      expect(result.error).toContain("Missing required capability");
      expect(result.error).toContain("trade_policy");
    });
  });

  describe("dependency error", () => {
    it("should return error when dependency resolution fails", async () => {
      process.env.SUI_PRIVATE_KEY = "test-secret-key";

      mockExecuteSkill.mockRejectedValueOnce(
        new Error("Failed to resolve dependency: price-feed.oracle.sui"),
      );

      const result = await handleExecuteSkill({
        suinsName: "trade.alpha.sui",
      });

      expect(result.error).toContain("Failed to resolve dependency");
      expect(result.error).toContain("price-feed.oracle.sui");
    });
  });

  describe("no signer", () => {
    it("should return error when no signer is configured", async () => {
      const result = await handleExecuteSkill({
        suinsName: "trade.alpha.sui",
      });

      expect(result.error).toContain("No signer available");
    });
  });

  describe("invalid params", () => {
    it("should return error when params is invalid JSON", async () => {
      process.env.SUI_PRIVATE_KEY = "test-secret-key";

      const result = await handleExecuteSkill({
        suinsName: "trade.alpha.sui",
        params: "not-json{{{",
      });

      expect(result.error).toContain("Invalid JSON");
    });
  });
});

describe("MCP agentos_resolve_manifest tool", () => {
  beforeEach(() => {
    mockResolveSkill.mockReset();
    mockDownloadManifest.mockReset();
    delete process.env.HARBOR_API_KEY;
    delete process.env.SUI_PRIVATE_KEY;
  });

  describe("success", () => {
    it("should return descriptor and manifest on success", async () => {
      const descriptor = {
        skillId: "trade",
        walrusManifestBlob: "blob123",
        manifestHash: "hash456",
        mvrPackageName: "@alpha/trade",
        version: "1.0.0",
        requiredCapabilities: [],
        dependencies: [],
      };
      const manifest = {
        name: "trade",
        version: "1.0.0",
        publisher: "alpha.sui",
        manifestType: "sui-agent-skill/v1",
        mcp: { compatible: true, tools: [] },
        sui: {
          movePackage: "0xabc",
          entry: "trade::execute",
          policyRequired: [],
        },
        dependencies: [],
      };

      mockResolveSkill.mockResolvedValueOnce(descriptor);
      mockDownloadManifest.mockResolvedValueOnce(manifest);

      const result = await handleResolveManifest({
        suinsName: "trade.alpha.sui",
      });

      expect(result.descriptor).toEqual(descriptor);
      expect(result.manifest).toEqual(manifest);
    });
  });

  describe("not found", () => {
    it("should return error when skill is not found", async () => {
      mockResolveSkill.mockRejectedValueOnce(
        new Error("Skill not found: unknown.alpha.sui"),
      );

      const result = await handleResolveManifest({
        suinsName: "unknown.alpha.sui",
      });

      expect(result.error).toContain("Skill not found");
      expect(result.error).toContain("unknown.alpha.sui");
    });
  });

  describe("download failure", () => {
    it("should return error when manifest download fails", async () => {
      const descriptor = {
        skillId: "trade",
        walrusManifestBlob: "blob123",
        manifestHash: "hash456",
        mvrPackageName: "@alpha/trade",
        version: "1.0.0",
        requiredCapabilities: [],
        dependencies: [],
      };

      mockResolveSkill.mockResolvedValueOnce(descriptor);
      mockDownloadManifest.mockRejectedValueOnce(
        new Error("Manifest blob not found: blob123"),
      );

      const result = await handleResolveManifest({
        suinsName: "trade.alpha.sui",
      });

      expect(result.error).toContain("Manifest blob not found");
    });
  });
});
