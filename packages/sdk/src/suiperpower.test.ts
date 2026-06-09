import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateManifest } from "./manifest.js";
import {
  buildManifestFromSuperpowerOutput,
  detectSuperpowerProject,
  parseSuiperpowerOutput,
  type SuiperpowerBuildResult,
} from "./suiperpower.js";

const PACKAGE_ID =
  "0x6568deb11f5fa2f69b370ab797fbf1ee3db67a6151bd4a48b9f6233874c70c6a";

/** A minimal `sui client publish --json` artifact with a published change. */
function publishJson(packageId: string): string {
  return JSON.stringify({
    digest: "abc",
    objectChanges: [
      { type: "mutated", objectId: "0x1" },
      {
        type: "published",
        packageId,
        version: "1",
        digest: "def",
      },
    ],
  });
}

const SKILL_MANIFEST = {
  name: "web-search",
  version: "1.0.0",
  publisher: "@my-agent/web-search",
  manifestType: "sui-agent-skill/v1" as const,
  mcp: {
    compatible: true,
    tools: [{ name: "search", description: "Search the web" }],
  },
  sui: { movePackage: "0xOLD", entry: "search", policyRequired: [] },
  dependencies: [],
};

describe("parseSuiperpowerOutput", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "suiperpower-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when the output directory does not exist", () => {
    expect(() => parseSuiperpowerOutput(join(tmpDir, "missing"))).toThrow(
      /not found/,
    );
  });

  it("parses manifest and packageId from publish-testnet.json", () => {
    writeFileSync(
      join(tmpDir, "skill.manifest.json"),
      JSON.stringify(SKILL_MANIFEST),
    );
    writeFileSync(
      join(tmpDir, "publish-testnet.json"),
      publishJson(PACKAGE_ID),
    );

    const result = parseSuiperpowerOutput(tmpDir);
    expect(result.outputDir).toBe(tmpDir);
    expect(result.manifest?.name).toBe("web-search");
    expect(result.packageId).toBe(PACKAGE_ID);
    expect(result.walrusBlobId).toBeUndefined();
  });

  it("reads a pre-uploaded Walrus blob id from walrus.json", () => {
    writeFileSync(
      join(tmpDir, "walrus.json"),
      JSON.stringify({ blobId: "blob-123" }),
    );
    const result = parseSuiperpowerOutput(tmpDir);
    expect(result.walrusBlobId).toBe("blob-123");
  });

  it("prefers an explicit package-id.txt over publish json", () => {
    writeFileSync(join(tmpDir, "package-id.txt"), `${PACKAGE_ID}\n`);
    writeFileSync(
      join(tmpDir, "publish.json"),
      publishJson("0xSHOULD_NOT_WIN"),
    );
    const result = parseSuiperpowerOutput(tmpDir);
    expect(result.packageId).toBe(PACKAGE_ID);
  });

  it("falls back to packageId embedded in the manifest", () => {
    writeFileSync(
      join(tmpDir, "skill.manifest.json"),
      JSON.stringify({ ...SKILL_MANIFEST, packageId: "0xFROMMANIFEST" }),
    );
    const result = parseSuiperpowerOutput(tmpDir);
    expect(result.packageId).toBe("0xFROMMANIFEST");
  });

  it("returns a best-effort result when no recognizable artifacts exist", () => {
    const result = parseSuiperpowerOutput(tmpDir);
    expect(result).toEqual({ outputDir: tmpDir });
  });
});

describe("buildManifestFromSuperpowerOutput", () => {
  it("assembles a valid manifest with movePackage from packageId", () => {
    const result: SuiperpowerBuildResult = {
      outputDir: "/tmp/x",
      packageId: PACKAGE_ID,
      manifest: SKILL_MANIFEST,
    };
    const manifest = buildManifestFromSuperpowerOutput(result, {
      agentName: "my-agent.sui",
    });
    expect(() => validateManifest(manifest)).not.toThrow();
    expect(manifest.manifestType).toBe("sui-agent-skill/v1");
    expect(manifest.sui.movePackage).toBe(PACKAGE_ID);
    // Existing MVR-style publisher is preserved.
    expect(manifest.publisher).toBe("@my-agent/web-search");
    expect(manifest.name).toBe("web-search");
    expect(manifest.mcp.tools).toEqual([
      { name: "search", description: "Search the web" },
    ]);
  });

  it("derives an MVR-style publisher from agentName when none present", () => {
    const result: SuiperpowerBuildResult = {
      outputDir: "/tmp/x",
      packageId: PACKAGE_ID,
      manifest: { name: "trader", version: "2.0.0" },
    };
    const manifest = buildManifestFromSuperpowerOutput(result, {
      agentName: "alpha.sui",
    });
    expect(manifest.publisher).toBe("@alpha/trader");
    expect(manifest.version).toBe("2.0.0");
    expect(manifest.sui.movePackage).toBe(PACKAGE_ID);
  });

  it("fills sensible defaults from a minimal/empty result", () => {
    const manifest = buildManifestFromSuperpowerOutput(
      { outputDir: "/tmp/x" },
      { agentName: "bot.sui" },
    );
    expect(() => validateManifest(manifest)).not.toThrow();
    expect(manifest.name).toBe("skill");
    expect(manifest.version).toBe("0.1.0");
    expect(manifest.publisher).toBe("@bot/skill");
    expect(manifest.sui.movePackage).toBe("");
    expect(manifest.mcp.compatible).toBe(true);
    expect(manifest.mcp.tools).toEqual([
      { name: "skill", description: "skill skill" },
    ]);
    expect(manifest.dependencies).toEqual([]);
  });

  it("derives a single tool from manifest description when tools missing", () => {
    const manifest = buildManifestFromSuperpowerOutput(
      {
        outputDir: "/tmp/x",
        manifest: { name: "summarize", description: "Summarize text" },
      },
      { agentName: "agent.sui" },
    );
    expect(manifest.mcp.tools).toEqual([
      { name: "summarize", description: "Summarize text" },
    ]);
  });

  it("uses existing manifest movePackage when result has no packageId", () => {
    const manifest = buildManifestFromSuperpowerOutput(
      { outputDir: "/tmp/x", manifest: SKILL_MANIFEST },
      { agentName: "agent.sui" },
    );
    expect(manifest.sui.movePackage).toBe("0xOLD");
    expect(manifest.sui.entry).toBe("search");
  });
});

describe("detectSuperpowerProject", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "suiperpower-detect-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns false for an empty directory", () => {
    expect(detectSuperpowerProject(tmpDir)).toBe(false);
  });

  it("returns true when a .suiperpower directory exists", () => {
    mkdirSync(join(tmpDir, ".suiperpower"));
    expect(detectSuperpowerProject(tmpDir)).toBe(true);
  });

  it("returns true when a suiperpower.config.json file exists", () => {
    writeFileSync(join(tmpDir, "suiperpower.config.json"), "{}");
    expect(detectSuperpowerProject(tmpDir)).toBe(true);
  });

  it("returns true for a suiperpower.config.ts file", () => {
    writeFileSync(join(tmpDir, "suiperpower.config.ts"), "export default {}");
    expect(detectSuperpowerProject(tmpDir)).toBe(true);
  });

  it("returns false when only an unrelated config file exists", () => {
    writeFileSync(join(tmpDir, "other.config.json"), "{}");
    expect(detectSuperpowerProject(tmpDir)).toBe(false);
  });
});
