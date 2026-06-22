/**
 * Unit tests for CLI skill commands: publish, execute, resolve.
 *
 * Commander.js retains parsed option state on Command instances between
 * parseAsync calls. We reset this state in beforeEach to isolate tests.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPublishSkill = vi.fn();
const mockListSkills = vi.fn().mockReturnValue([]);
const mockResolveAgent = vi.fn().mockReturnValue(null);

const mockResolveSkillFn = vi.fn();
const mockDownloadManifestFn = vi.fn();
const mockExecuteSkillFn = vi.fn();
const mockCreateSkillDescriptor = vi.fn().mockReturnValue({
  transaction: { build: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) },
});

const mockGetSigner = vi.fn().mockReturnValue({
  toSuiAddress: () =>
    "0x0000000000000000000000000000000000000000000000000000000000000001",
  signTransaction: vi.fn().mockResolvedValue({ signature: "sig" }),
});

const mockContext = {
  config: {
    harborApiKey: undefined as string | undefined,
    dashboardUrl: "http://localhost:3000",
    packageId: "0xPKG",
  },
  cwd: "/test/cwd",
  registry: {
    publishSkill: mockPublishSkill,
    listSkills: mockListSkills,
    resolveAgent: mockResolveAgent,
  },
  suiClient: {},
  agentos: {
    tx: { createSkillDescriptor: mockCreateSkillDescriptor },
    publishSkill: vi.fn(),
    resolveSkill: mockResolveSkillFn,
    downloadManifest: mockDownloadManifestFn,
    executeSkill: mockExecuteSkillFn,
  },
  getSigner: mockGetSigner,
};

vi.mock("../../src/lib/context.js", () => ({
  createCliContext: () => mockContext,
}));

vi.mock("../../src/lib/manifest.js", () => ({
  readManifestFile: (file: string) => {
    if (file === "bad-manifest.json") {
      throw new Error("Invalid manifestType: expected sui-agent-skill/v1");
    }
    return {
      name: "trade",
      version: "1.0.0",
      publisher: "@alpha/trade",
      manifestType: "sui-agent-skill/v1",
      mcp: { compatible: true, tools: [] },
      sui: {
        movePackage: "0xabc",
        entry: "trade_module::execute",
        policyRequired: [],
      },
      dependencies: [],
    };
  },
}));

const mockPrintJson = vi.fn();
const mockPrintError = vi.fn((msg: string) => {
  throw new Error(msg);
});

vi.mock("../../src/lib/output.js", () => ({
  printJson: (...args: unknown[]) => mockPrintJson(...args),
  printError: (msg: string) => mockPrintError(msg),
}));

const mockFormatDryRun = vi.fn().mockResolvedValue({
  mode: "dry-run",
  kind: "createSkillDescriptor",
  txBytes: "AQID",
  note: "Serialized with configured packageId",
});

vi.mock("../../src/lib/dry-run.js", () => ({
  formatDryRun: (...args: unknown[]) => mockFormatDryRun(...args),
}));

// ─── SDK mocks for import/scan (parse + convert + scan) ─────────────────────────

const mockParseSkillMd = vi.fn((content: string) => ({
  name: "imported-skill",
  description: "An imported skill",
  instructions: content,
}));

const mockConvertToAgentOSManifest = vi.fn(
  (
    metadata: { name: string; description?: string; version?: string },
    options: { publisher: string; movePackage?: string },
  ) => ({
    name: metadata.name,
    version: metadata.version ?? "0.1.0",
    publisher: options.publisher,
    manifestType: "sui-agent-skill/v1",
    mcp: {
      compatible: true,
      tools: [{ name: metadata.name, description: metadata.description ?? "" }],
    },
    sui: {
      movePackage: options.movePackage ?? "",
      entry: options.movePackage ? metadata.name : "",
      policyRequired: [],
    },
    dependencies: [],
  }),
);

const mockScanSkillsDirectory = vi.fn().mockReturnValue([]);

vi.mock("@agentos-sui/sdk", () => ({
  formatSkillSubname: (skill: string, agent: string) => {
    const base = agent.endsWith(".sui") ? agent : `${agent}.sui`;
    return `${skill}.${base}`;
  },
  DependencyResolver: class {
    resolve() {
      return Promise.resolve([
        { name: "dep-a.agent.sui" },
        { name: "dep-b.agent.sui" },
      ]);
    }
  },
  parseSkillMd: (...args: [string]) => mockParseSkillMd(...args),
  convertToAgentOSManifest: (...args: [never, never]) =>
    mockConvertToAgentOSManifest(...args),
}));

vi.mock("@agentos-sui/sdk/node", () => ({
  scanSkillsDirectory: (...args: [string]) => mockScanSkillsDirectory(...args),
}));

const mockExecFileSync = vi.fn();

vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

vi.mock("@mysten/sui/transactions", () => ({
  Transaction: class {
    moveCall() {}
    build() {
      return Promise.resolve(new Uint8Array([1, 2, 3]));
    }
  },
}));

import { skillCommand } from "../../src/commands/skill.js";

/**
 * Reset Commander.js internal option state on all subcommands.
 * Commander stores parsed values in _optionValues and _optionValueSources,
 * plus the processedArgs array. We clear all of them to isolate tests.
 */
function resetCommanderState() {
  for (const cmd of skillCommand.commands) {
    // Reset option values
    (cmd as any)._optionValues = {};
    (cmd as any)._optionValueSources = {};
    // Reset processed args
    (cmd as any).processedArgs = [];
  }
  // Reset parent too
  (skillCommand as any)._optionValues = {};
  (skillCommand as any)._optionValueSources = {};
}

async function run(args: string[]) {
  await skillCommand.parseAsync(["node", "skill", ...args]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLISH COMMAND TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("skill publish command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCommanderState();
    mockContext.config.harborApiKey = undefined;
    delete process.env.HARBOR_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("dry-run without Harbor key shows local-only output", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run([
        "publish",
        "manifest.json",
        "--agent",
        "alpha.sui",
        "--dry-run",
      ]);

      expect(mockFormatDryRun).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        "createSkillDescriptor",
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Serialized with configured packageId"),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("dry-run with Harbor key shows Walrus upload parameters", async () => {
    mockContext.config.harborApiKey = "hbr_test_key";
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run([
        "publish",
        "manifest.json",
        "--agent",
        "alpha.sui",
        "--dry-run",
      ]);

      expect(consoleSpy).toHaveBeenCalledWith("Walrus upload parameters:");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Harbor URL:"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Filename:   trade-1.0.0.json"),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("dry-run with --private shows Seal Policy in output", async () => {
    mockContext.config.harborApiKey = "hbr_test_key";
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run([
        "publish",
        "manifest.json",
        "--agent",
        "alpha.sui",
        "--dry-run",
        "--private",
        "0xpolicy123",
      ]);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Seal Policy: 0xpolicy123"),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("dry-run --json outputs structured result without Harbor key", async () => {
    await run([
      "publish",
      "manifest.json",
      "--agent",
      "alpha.sui",
      "--dry-run",
      "--json",
    ]);

    expect(mockPrintJson).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "dry-run",
        kind: "createSkillDescriptor",
        txBytes: "AQID",
      }),
    );
  });

  it("dry-run --json includes walrusParams when Harbor key is set", async () => {
    mockContext.config.harborApiKey = "hbr_test_key";
    await run([
      "publish",
      "manifest.json",
      "--agent",
      "alpha.sui",
      "--dry-run",
      "--json",
    ]);

    expect(mockPrintJson).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "dry-run",
        walrusParams: expect.objectContaining({
          harborBaseUrl: "https://api.testnet.harbor.walrus.xyz",
          filename: "trade-1.0.0.json",
        }),
      }),
    );
  });

  it("publishes locally when no signer is available", async () => {
    mockGetSigner.mockReturnValueOnce(null);
    mockPublishSkill.mockReturnValue({
      objectId: "0xLOCAL",
      walrusManifestBlob: undefined,
      manifestHash: undefined,
      suinsName: undefined,
      mvrPackage: "@alpha/trade",
      version: "1.0.0",
      agentSlug: "alpha",
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run(["publish", "manifest.json", "--agent", "alpha.sui"]);

      expect(mockPublishSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: "alpha.sui",
        }),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Published"),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("--json outputs structured result on local publish", async () => {
    mockGetSigner.mockReturnValueOnce(null);
    mockPublishSkill.mockReturnValue({
      objectId: "0xOBJ",
      walrusManifestBlob: undefined,
      manifestHash: undefined,
      suinsName: undefined,
      mvrPackage: "@alpha/trade",
      version: "1.0.0",
      agentSlug: "alpha",
    });

    await run(["publish", "manifest.json", "--agent", "alpha.sui", "--json"]);

    expect(mockPrintJson).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId: "0xOBJ",
      }),
    );
  });

  it("--private passes sealPolicyId to publishSkill on Walrus publish", async () => {
    mockContext.config.harborApiKey = "hbr_test_key";
    mockContext.agentos.publishSkill.mockResolvedValue({
      skillId: "trade",
      walrusManifestBlob: "blob-private",
      manifestHash: "hash123",
      version: "1.0.0",
    });
    mockPublishSkill.mockReturnValue({
      objectId: "0xPRIVATE",
      agentSlug: "alpha",
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run([
        "publish",
        "manifest.json",
        "--agent",
        "alpha.sui",
        "--private",
        "0xpolicy_seal",
      ]);

      expect(mockContext.agentos.publishSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          private: { sealPolicyId: "0xpolicy_seal" },
        }),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE COMMAND TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("skill execute command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCommanderState();
    mockContext.config.harborApiKey = "hbr_test_key";
  });

  it("parses JSON --params and passes to executeSkill", async () => {
    mockResolveSkillFn.mockResolvedValue({
      skillId: "trade",
      walrusManifestBlob: "blob-1",
      manifestHash: "hash1",
      version: "1.0.0",
      dependencies: [],
      sealPolicyId: undefined,
    });
    mockDownloadManifestFn.mockResolvedValue({
      name: "trade",
      version: "1.0.0",
      manifestType: "sui-agent-skill/v1",
      sui: { movePackage: "0xabc", entry: "mod::run", policyRequired: [] },
      dependencies: [],
    });
    mockExecuteSkillFn.mockResolvedValue({
      digest: "tx_abc",
      effects: { status: { status: "success" } },
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run([
        "execute",
        "trade.alpha.sui",
        "--params",
        '{"amount": 100, "token": "SUI"}',
      ]);

      expect(mockExecuteSkillFn).toHaveBeenCalledWith(
        expect.objectContaining({
          suinsName: "trade.alpha.sui",
          params: { amount: 100, token: "SUI" },
        }),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("errors on invalid JSON for --params", async () => {
    await expect(
      run(["execute", "trade.alpha.sui", "--params", "not-json"]),
    ).rejects.toThrow("Invalid JSON for --params");
  });

  it("--json outputs digest and effects on successful execution", async () => {
    mockResolveSkillFn.mockResolvedValue({
      skillId: "trade",
      walrusManifestBlob: "blob-1",
      manifestHash: "hash1",
      version: "1.0.0",
      dependencies: [],
      sealPolicyId: undefined,
    });
    mockDownloadManifestFn.mockResolvedValue({
      name: "trade",
      version: "1.0.0",
      manifestType: "sui-agent-skill/v1",
      sui: { movePackage: "0xabc", entry: "mod::run", policyRequired: [] },
      dependencies: [],
    });
    mockExecuteSkillFn.mockResolvedValue({
      digest: "tx_digest_456",
      effects: { status: { status: "success" } },
    });

    await run(["execute", "trade.alpha.sui", "--json"]);

    expect(mockPrintJson).toHaveBeenCalledWith({
      digest: "tx_digest_456",
      effects: { status: { status: "success" } },
    });
  });

  it("prints dependency resolution order when dependencies exist", async () => {
    mockResolveSkillFn.mockResolvedValue({
      skillId: "trade",
      walrusManifestBlob: "blob-1",
      manifestHash: "hash1",
      version: "1.0.0",
      dependencies: ["dep-a.agent.sui", "dep-b.agent.sui"],
      sealPolicyId: undefined,
    });
    mockDownloadManifestFn.mockResolvedValue({
      name: "trade",
      version: "1.0.0",
      manifestType: "sui-agent-skill/v1",
      sui: { movePackage: "0xabc", entry: "mod::run", policyRequired: [] },
      dependencies: ["dep-a.agent.sui", "dep-b.agent.sui"],
    });
    mockExecuteSkillFn.mockResolvedValue({
      digest: "tx_dep_123",
      effects: { status: { status: "success" } },
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run(["execute", "trade.alpha.sui"]);

      expect(consoleSpy).toHaveBeenCalledWith("Dependency resolution order:");
      expect(consoleSpy).toHaveBeenCalledWith("  1. dep-a.agent.sui");
      expect(consoleSpy).toHaveBeenCalledWith("  2. dep-b.agent.sui");
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("--dry-run builds PTB and prints without executing", async () => {
    mockResolveSkillFn.mockResolvedValue({
      skillId: "trade",
      walrusManifestBlob: "blob-1",
      manifestHash: "hash1",
      version: "1.0.0",
      dependencies: [],
      sealPolicyId: undefined,
    });
    mockDownloadManifestFn.mockResolvedValue({
      name: "trade",
      version: "1.0.0",
      manifestType: "sui-agent-skill/v1",
      sui: {
        movePackage: "0xabc",
        entry: "trade_module::execute",
        policyRequired: [],
      },
      dependencies: [],
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run(["execute", "trade.alpha.sui", "--dry-run"]);

      expect(mockFormatDryRun).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        "executeSkill",
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Skill: trade.alpha.sui"),
      );
      expect(mockExecuteSkillFn).not.toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("--dry-run --json outputs structured result", async () => {
    mockResolveSkillFn.mockResolvedValue({
      skillId: "trade",
      walrusManifestBlob: "blob-1",
      manifestHash: "hash1",
      version: "1.0.0",
      dependencies: [],
      sealPolicyId: undefined,
    });
    mockDownloadManifestFn.mockResolvedValue({
      name: "trade",
      version: "1.0.0",
      manifestType: "sui-agent-skill/v1",
      sui: { movePackage: "0xabc", entry: "mod::execute", policyRequired: [] },
      dependencies: [],
    });

    await run(["execute", "trade.alpha.sui", "--dry-run", "--json"]);

    expect(mockPrintJson).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "dry-run",
        skill: "trade.alpha.sui",
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLVE COMMAND TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("skill resolve command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCommanderState();
  });

  it("prints SkillDescriptor fields in human-readable format", async () => {
    mockResolveSkillFn.mockResolvedValue({
      skillId: "trade",
      walrusManifestBlob: "blob-resolve-1",
      manifestHash: "hash_abc",
      version: "2.0.0",
      dependencies: ["dep-x.agent.sui"],
      sealPolicyId: undefined,
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run(["resolve", "trade.alpha.sui"]);

      expect(consoleSpy).toHaveBeenCalledWith("Skill: trade");
      expect(consoleSpy).toHaveBeenCalledWith("  Blob ID:      blob-resolve-1");
      expect(consoleSpy).toHaveBeenCalledWith("  Hash:         hash_abc");
      expect(consoleSpy).toHaveBeenCalledWith("  Version:      2.0.0");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("dep-x.agent.sui"),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("prints Seal Policy when sealPolicyId is set", async () => {
    mockResolveSkillFn.mockResolvedValue({
      skillId: "private-skill",
      walrusManifestBlob: "blob-priv",
      manifestHash: "hash_priv",
      version: "1.0.0",
      dependencies: [],
      sealPolicyId: "0xpolicy999",
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run(["resolve", "private-skill.agent.sui"]);

      expect(consoleSpy).toHaveBeenCalledWith("  Seal Policy:  0xpolicy999");
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("--json outputs structured descriptor", async () => {
    const descriptor = {
      skillId: "trade",
      walrusManifestBlob: "blob-json",
      manifestHash: "hash_json",
      version: "3.0.0",
      dependencies: [],
      sealPolicyId: undefined,
    };
    mockResolveSkillFn.mockResolvedValue(descriptor);

    await run(["resolve", "trade.alpha.sui", "--json"]);

    expect(mockPrintJson).toHaveBeenCalledWith(descriptor);
  });

  it("--manifest downloads and prints the full SkillManifest JSON", async () => {
    const manifest = {
      name: "trade",
      version: "1.0.0",
      publisher: "@alpha/trade",
      manifestType: "sui-agent-skill/v1",
      mcp: { compatible: true, tools: [] },
      sui: { movePackage: "0xabc", entry: "mod::run", policyRequired: [] },
      dependencies: [],
    };

    mockResolveSkillFn.mockResolvedValue({
      skillId: "trade",
      walrusManifestBlob: "blob-manifest",
      manifestHash: "hash_m",
      version: "1.0.0",
      dependencies: [],
      sealPolicyId: undefined,
    });
    mockDownloadManifestFn.mockResolvedValue(manifest);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run(["resolve", "trade.alpha.sui", "--manifest"]);

      expect(mockDownloadManifestFn).toHaveBeenCalledWith(
        "blob-manifest",
        "hash_m",
        undefined,
      );
      expect(consoleSpy).toHaveBeenCalledWith("Manifest:");
      expect(consoleSpy).toHaveBeenCalledWith(
        JSON.stringify(manifest, null, 2),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("--manifest passes sealPolicyId when descriptor has one", async () => {
    mockResolveSkillFn.mockResolvedValue({
      skillId: "encrypted-skill",
      walrusManifestBlob: "blob-enc",
      manifestHash: "hash_enc",
      version: "1.0.0",
      dependencies: [],
      sealPolicyId: "0xseal_policy",
    });
    mockDownloadManifestFn.mockResolvedValue({
      name: "encrypted-skill",
      version: "1.0.0",
      manifestType: "sui-agent-skill/v1",
      sui: { movePackage: "0xabc", entry: "mod::run", policyRequired: [] },
      dependencies: [],
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run(["resolve", "encrypted-skill.agent.sui", "--manifest"]);

      expect(mockDownloadManifestFn).toHaveBeenCalledWith(
        "blob-enc",
        "hash_enc",
        { sealPolicyId: "0xseal_policy" },
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("--manifest --json outputs both descriptor and manifest", async () => {
    const descriptor = {
      skillId: "trade",
      walrusManifestBlob: "blob-both",
      manifestHash: "hash_both",
      version: "1.0.0",
      dependencies: [],
      sealPolicyId: undefined,
    };
    const manifest = {
      name: "trade",
      version: "1.0.0",
      manifestType: "sui-agent-skill/v1",
      sui: { movePackage: "0xabc", entry: "mod::run", policyRequired: [] },
      dependencies: [],
    };
    mockResolveSkillFn.mockResolvedValue(descriptor);
    mockDownloadManifestFn.mockResolvedValue(manifest);

    await run(["resolve", "trade.alpha.sui", "--manifest", "--json"]);

    expect(mockPrintJson).toHaveBeenCalledWith({ descriptor, manifest });
  });

  it("prints error when skill is not found", async () => {
    mockResolveSkillFn.mockRejectedValue(
      new Error("Skill not found: missing.agent.sui"),
    );

    await expect(run(["resolve", "missing.agent.sui"])).rejects.toThrow(
      "Skill not found: missing.agent.sui",
    );

    expect(mockPrintError).toHaveBeenCalledWith(
      "Skill not found: missing.agent.sui",
    );
  });

  it("prints error when SkillDescriptor is invalid", async () => {
    mockResolveSkillFn.mockRejectedValue(
      new Error("Invalid SkillDescriptor at 0xbad"),
    );

    await expect(run(["resolve", "bad.agent.sui"])).rejects.toThrow(
      "Invalid SkillDescriptor at 0xbad",
    );

    expect(mockPrintError).toHaveBeenCalledWith(
      "Invalid SkillDescriptor at 0xbad",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT COMMAND TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("skill import command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCommanderState();
    mockContext.config.harborApiKey = undefined;
    delete process.env.HARBOR_API_KEY;
    // Re-establish default mock implementations cleared by clearAllMocks.
    mockParseSkillMd.mockImplementation((content: string) => ({
      name: "imported-skill",
      description: "An imported skill",
      instructions: content,
    }));
    mockConvertToAgentOSManifest.mockImplementation((metadata, options) => ({
      name: metadata.name,
      version: metadata.version ?? "0.1.0",
      publisher: options.publisher,
      manifestType: "sui-agent-skill/v1",
      mcp: {
        compatible: true,
        tools: [
          { name: metadata.name, description: metadata.description ?? "" },
        ],
      },
      sui: {
        movePackage: options.movePackage ?? "",
        entry: options.movePackage ? metadata.name : "",
        policyRequired: [],
      },
      dependencies: [],
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Write a real SKILL.md to a temp dir and return its path. */
  function writeTempSkillMd(): string {
    const dir = mkdtempSync(join(tmpdir(), "skill-import-"));
    const filePath = join(dir, "SKILL.md");
    writeFileSync(
      filePath,
      "---\nname: imported-skill\ndescription: An imported skill\n---\n\nDo the thing.\n",
      "utf8",
    );
    return filePath;
  }

  it("local path import publishes via the local registry", async () => {
    const filePath = writeTempSkillMd();
    mockPublishSkill.mockReturnValue({
      objectId: "0xIMPORT",
      walrusManifestBlob: undefined,
      manifestHash: undefined,
      suinsName: undefined,
      agentSlug: "alpha",
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run(["import", filePath, "--agent", "alpha.sui"]);

      expect(mockParseSkillMd).toHaveBeenCalled();
      expect(mockPublishSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          agentName: "alpha.sui",
          manifest: expect.objectContaining({
            name: "imported-skill",
            manifestType: "sui-agent-skill/v1",
            publisher: "alpha.sui",
          }),
        }),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Imported"),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("--dry-run prints the converted manifest and does not publish", async () => {
    const filePath = writeTempSkillMd();

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run(["import", filePath, "--agent", "alpha.sui", "--dry-run"]);

      expect(mockConvertToAgentOSManifest).toHaveBeenCalled();
      expect(mockPublishSkill).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("dry-run, not published"),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("--dry-run --json outputs the structured manifest", async () => {
    const filePath = writeTempSkillMd();

    await run([
      "import",
      filePath,
      "--agent",
      "alpha.sui",
      "--dry-run",
      "--json",
    ]);

    expect(mockPublishSkill).not.toHaveBeenCalled();
    expect(mockPrintJson).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({
          name: "imported-skill",
          manifestType: "sui-agent-skill/v1",
        }),
      }),
    );
  });

  it("--json outputs the structured result on local publish", async () => {
    const filePath = writeTempSkillMd();
    mockPublishSkill.mockReturnValue({
      objectId: "0xOBJ_IMPORT",
      walrusManifestBlob: "blob-import",
      manifestHash: "hash-import",
      suinsName: "imported-skill.alpha.sui",
      agentSlug: "alpha",
    });

    await run(["import", filePath, "--agent", "alpha.sui", "--json"]);

    expect(mockPrintJson).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({ name: "imported-skill" }),
        objectId: "0xOBJ_IMPORT",
        blobId: "blob-import",
        manifestHash: "hash-import",
      }),
    );
  });

  it("--from-sui-skills downloads via npx (array args) then converts + publishes", async () => {
    // Use a real temp dir as cwd so the conventional SKILL.md lookup succeeds.
    const cwd = mkdtempSync(join(tmpdir(), "skill-import-cwd-"));
    const skillDir = join(cwd, ".agents", "skills", "weather");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: weather\ndescription: Weather skill\n---\n\nForecast.\n",
      "utf8",
    );

    const originalCwd = mockContext.cwd;
    mockContext.cwd = cwd;
    mockPublishSkill.mockReturnValue({
      objectId: "0xWEATHER",
      agentSlug: "alpha",
    });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run([
        "import",
        "weather",
        "--agent",
        "alpha.sui",
        "--from-sui-skills",
      ]);

      // SECURITY: arguments are passed as an array (no shell interpolation).
      expect(mockExecFileSync).toHaveBeenCalledWith(
        "npx",
        ["skills", "add", "mystenlabs/skills", "--skill", "weather"],
        expect.objectContaining({ cwd }),
      );
      expect(mockParseSkillMd).toHaveBeenCalled();
      expect(mockPublishSkill).toHaveBeenCalledWith(
        expect.objectContaining({ agentName: "alpha.sui" }),
      );
    } finally {
      consoleSpy.mockRestore();
      mockContext.cwd = originalCwd;
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCAN COMMAND TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("skill scan command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCommanderState();
    mockContext.config.harborApiKey = undefined;
    delete process.env.HARBOR_API_KEY;
    mockListSkills.mockReturnValue([]);
    mockConvertToAgentOSManifest.mockImplementation((metadata, options) => ({
      name: metadata.name,
      version: metadata.version ?? "0.1.0",
      publisher: options.publisher,
      manifestType: "sui-agent-skill/v1",
      mcp: {
        compatible: true,
        tools: [
          { name: metadata.name, description: metadata.description ?? "" },
        ],
      },
      sui: {
        movePackage: options.movePackage ?? "",
        entry: options.movePackage ? metadata.name : "",
        policyRequired: [],
      },
      dependencies: [],
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("publishes each newly discovered skill", async () => {
    mockScanSkillsDirectory.mockReturnValue([
      { name: "a", description: "Skill A", instructions: "" },
      { name: "b", description: "Skill B", instructions: "" },
    ]);
    mockPublishSkill.mockReturnValue({ objectId: "0xS", agentSlug: "alpha" });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run(["scan", "--agent", "alpha.sui", "--dir", "somedir"]);

      expect(mockScanSkillsDirectory).toHaveBeenCalledWith("somedir");
      expect(mockPublishSkill).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("2 skill(s) found, 2 new (published)"),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("skips skills already registered for the agent", async () => {
    mockScanSkillsDirectory.mockReturnValue([
      { name: "a", description: "Skill A", instructions: "" },
      { name: "b", description: "Skill B", instructions: "" },
    ]);
    mockListSkills.mockReturnValue([{ name: "a" }]);
    mockPublishSkill.mockReturnValue({ objectId: "0xS", agentSlug: "alpha" });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run(["scan", "--agent", "alpha.sui", "--dir", "somedir"]);

      // Only "b" is published; "a" is skipped.
      expect(mockPublishSkill).toHaveBeenCalledTimes(1);
      expect(mockPublishSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          manifest: expect.objectContaining({ name: "b" }),
        }),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("1 new (published), 1 skipped"),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("--force re-publishes an already-registered skill", async () => {
    mockScanSkillsDirectory.mockReturnValue([
      { name: "a", description: "Skill A", instructions: "" },
    ]);
    mockListSkills.mockReturnValue([{ name: "a" }]);
    mockPublishSkill.mockReturnValue({ objectId: "0xS", agentSlug: "alpha" });

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await run([
        "scan",
        "--agent",
        "alpha.sui",
        "--dir",
        "somedir",
        "--force",
      ]);

      expect(mockPublishSkill).toHaveBeenCalledTimes(1);
      expect(mockPublishSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          manifest: expect.objectContaining({ name: "a" }),
        }),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("1 new (published), 0 skipped"),
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("--json outputs the structured summary", async () => {
    mockScanSkillsDirectory.mockReturnValue([
      { name: "a", description: "Skill A", instructions: "" },
      { name: "b", description: "Skill B", instructions: "" },
    ]);
    mockListSkills.mockReturnValue([{ name: "a" }]);
    mockPublishSkill.mockReturnValue({ objectId: "0xS", agentSlug: "alpha" });

    await run(["scan", "--agent", "alpha.sui", "--dir", "somedir", "--json"]);

    expect(mockPrintJson).toHaveBeenCalledWith(
      expect.objectContaining({
        found: 2,
        published: 1,
        skipped: 1,
        errors: 0,
        skills: expect.arrayContaining([
          expect.objectContaining({ name: "a", status: "skipped" }),
          expect.objectContaining({ name: "b", status: "published" }),
        ]),
      }),
    );
  });
});
