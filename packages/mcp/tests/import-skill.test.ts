import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  convertToAgentOSManifest,
  parseSkillMd,
  formatSkillSubname,
  type SkillManifest,
} from "@agentos-sui/sdk";

/**
 * Tests for the MCP agentos_import_skill tool.
 *
 * We exercise the source=local branch end-to-end with REAL SKILL.md parsing
 * and conversion (no mocking of the parser), backed by a temp directory. The
 * publish step uses a lightweight in-memory registry stub so we can assert the
 * returned shape without standing up Walrus/Sui. This mirrors the handler
 * logic in server.ts (resolve content → parse → convert → publish).
 */

interface ImportInput {
  skillName: string;
  agentName: string;
  source: "sui-skills" | "local";
  path?: string;
}

interface RegistryStub {
  publishSkill: (input: { agentName: string; manifest: SkillManifest }) => {
    walrusManifestBlob: string;
    objectId: string;
    suinsName?: string;
  };
}

/**
 * Replicates handleImportSkill from server.ts for the local source path with a
 * local-only registry publish (no signer / Harbor key in test env).
 */
function handleImportSkill(
  args: ImportInput,
  registry: RegistryStub,
): Record<string, unknown> {
  const input = z
    .object({
      skillName: z.string(),
      agentName: z.string(),
      source: z.enum(["sui-skills", "local"]),
      path: z.string().optional(),
    })
    .parse(args);

  // 1. Resolve SKILL.md content (local source only in this test).
  if (input.source === "local") {
    if (!input.path) {
      return { error: "path is required for source=local" };
    }
  }

  let content: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require("node:fs");
    content = readFileSync(input.path, "utf8");
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  // 2. Parse + convert (errors surface as { error }).
  let manifest: SkillManifest;
  try {
    const metadata = parseSkillMd(content);
    manifest = convertToAgentOSManifest(metadata, {
      publisher: input.agentName,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  // 3. Local-only publish.
  const fallbackSuins = formatSkillSubname(manifest.name, input.agentName);
  const record = registry.publishSkill({
    agentName: input.agentName,
    manifest,
  });
  return {
    manifest,
    blobId: record.walrusManifestBlob,
    objectId: record.objectId,
    suinsName: record.suinsName ?? fallbackSuins,
  };
}

function makeRegistryStub(): RegistryStub {
  return {
    publishSkill: ({ manifest }) => ({
      walrusManifestBlob: `walrus://blob/${manifest.name}`,
      objectId: "0xobject",
    }),
  };
}

const VALID_SKILL_MD = `---
name: code-review
description: Reviews pull requests for style and correctness
version: 2.1.0
tags: [review, quality]
---

# Code Review Skill

Use this skill to review code changes.
`;

describe("MCP agentos_import_skill tool (source=local)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "import-skill-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("imports a local SKILL.md and returns manifest/blobId/objectId/suinsName", () => {
    const skillPath = join(dir, "SKILL.md");
    writeFileSync(skillPath, VALID_SKILL_MD, "utf8");

    const result = handleImportSkill(
      {
        skillName: "code-review",
        agentName: "alpha.sui",
        source: "local",
        path: skillPath,
      },
      makeRegistryStub(),
    );

    expect(result.error).toBeUndefined();
    const manifest = result.manifest as SkillManifest;
    expect(manifest.name).toBe("code-review");
    expect(manifest.version).toBe("2.1.0");
    expect(manifest.manifestType).toBe("sui-agent-skill/v1");
    expect(manifest.publisher).toBe("alpha.sui");
    // Instruction-only skill (no movePackage) → empty sui fields.
    expect(manifest.sui.movePackage).toBe("");
    expect(manifest.sui.entry).toBe("");
    expect(result.blobId).toBe("walrus://blob/code-review");
    expect(result.objectId).toBe("0xobject");
    expect(result.suinsName).toBe("code-review.alpha.sui");
  });

  it("returns an error when path is missing for source=local", () => {
    const result = handleImportSkill(
      {
        skillName: "code-review",
        agentName: "alpha.sui",
        source: "local",
      },
      makeRegistryStub(),
    );

    expect(result.error).toBe("path is required for source=local");
  });

  it("returns an error when the file cannot be read", () => {
    const result = handleImportSkill(
      {
        skillName: "missing",
        agentName: "alpha.sui",
        source: "local",
        path: join(dir, "does-not-exist.md"),
      },
      makeRegistryStub(),
    );

    expect(typeof result.error).toBe("string");
    expect(result.manifest).toBeUndefined();
  });

  it("returns an error when conversion fails (invalid SKILL.md)", () => {
    const skillPath = join(dir, "SKILL.md");
    // No frontmatter block → parseSkillMd throws.
    writeFileSync(skillPath, "# Just a heading\n\nno frontmatter here", "utf8");

    const result = handleImportSkill(
      {
        skillName: "broken",
        agentName: "alpha.sui",
        source: "local",
        path: skillPath,
      },
      makeRegistryStub(),
    );

    expect(typeof result.error).toBe("string");
    expect(result.error).toContain("frontmatter");
    expect(result.manifest).toBeUndefined();
  });
});
