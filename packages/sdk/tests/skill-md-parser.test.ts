import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  convertToAgentOSManifest,
  parseSkillMd,
  type SkillMdMetadata,
} from "../src/skill-md-parser.js";
import { scanSkillsDirectory } from "../src/skill-md-scanner.js";

const VALID_SKILL_MD = `---
name: web-search
description: Search the web for agent context
version: 1.2.0
tags: [search, web, retrieval]
---

# Web Search Skill

Use this skill to look things up online.

## Steps
1. Take the query.
2. Return results.
`;

describe("parseSkillMd", () => {
  it("parses a valid SKILL.md with all common fields", () => {
    const meta = parseSkillMd(VALID_SKILL_MD);
    expect(meta.name).toBe("web-search");
    expect(meta.description).toBe("Search the web for agent context");
    expect(meta.version).toBe("1.2.0");
    expect(meta.tags).toEqual(["search", "web", "retrieval"]);
    expect(meta.instructions).toContain("# Web Search Skill");
    expect(meta.instructions.startsWith("# Web Search Skill")).toBe(true);
    // Instruction body is trimmed.
    expect(meta.instructions.endsWith("2. Return results.")).toBe(true);
  });

  it("parses block-list tags", () => {
    const content = `---
name: trade
description: Execute a trade
tags:
  - defi
  - swap
---
Body`;
    const meta = parseSkillMd(content);
    expect(meta.tags).toEqual(["defi", "swap"]);
  });

  it("parses quoted scalar values and strips quotes", () => {
    const content = `---
name: "quoted-skill"
description: 'A description with: a colon'
---
Body`;
    const meta = parseSkillMd(content);
    expect(meta.name).toBe("quoted-skill");
    expect(meta.description).toBe("A description with: a colon");
  });

  it("parses a nested scripts mapping", () => {
    const content = `---
name: trader
description: Trades tokens
movePackage: 0xabc
scripts:
  execute: trade_module::execute
  cancel: trade_module::cancel
---
Body`;
    const meta = parseSkillMd(content);
    expect(meta.scripts).toEqual({
      execute: "trade_module::execute",
      cancel: "trade_module::cancel",
    });
    expect(meta.movePackage).toBe("0xabc");
  });

  it("ignores inline comments in frontmatter", () => {
    const content = `---
name: commented # this is the name
description: Has a comment
---
Body`;
    const meta = parseSkillMd(content);
    expect(meta.name).toBe("commented");
  });

  it("is robust to CRLF line endings and leading blank lines", () => {
    const content =
      "\r\n---\r\nname: crlf\r\ndescription: Works\r\n---\r\nBody line\r\n";
    const meta = parseSkillMd(content);
    expect(meta.name).toBe("crlf");
    expect(meta.description).toBe("Works");
    expect(meta.instructions).toBe("Body line");
  });

  it("throws when there is no frontmatter block", () => {
    expect(() => parseSkillMd("# Just markdown\nNo frontmatter here")).toThrow(
      /missing YAML frontmatter block/,
    );
  });

  it("throws when the frontmatter block is unterminated", () => {
    expect(() => parseSkillMd("---\nname: x\ndescription: y\n")).toThrow(
      /unterminated frontmatter block/,
    );
  });

  it("throws when required field 'name' is missing", () => {
    const content = `---
description: Missing the name
---
Body`;
    expect(() => parseSkillMd(content)).toThrow(
      /missing required frontmatter field "name"/,
    );
  });

  it("throws when required field 'description' is missing", () => {
    const content = `---
name: only-name
---
Body`;
    expect(() => parseSkillMd(content)).toThrow(
      /missing required frontmatter field "description"/,
    );
  });

  it("omits optional fields when absent", () => {
    const content = `---
name: minimal
description: Minimal skill
---
Body`;
    const meta = parseSkillMd(content);
    expect(meta.version).toBeUndefined();
    expect(meta.tags).toBeUndefined();
    expect(meta.movePackage).toBeUndefined();
    expect(meta.scripts).toBeUndefined();
  });
});

describe("convertToAgentOSManifest", () => {
  const baseMeta: SkillMdMetadata = {
    name: "web-search",
    description: "Search the web for agent context",
    version: "1.2.0",
    instructions: "do stuff",
  };

  it("converts metadata to a sui-agent-skill/v1 manifest", () => {
    const manifest = convertToAgentOSManifest(baseMeta, {
      publisher: "alpha.sui",
    });
    expect(manifest.manifestType).toBe("sui-agent-skill/v1");
    expect(manifest.name).toBe("web-search");
    expect(manifest.version).toBe("1.2.0");
    expect(manifest.publisher).toBe("alpha.sui");
    expect(manifest.dependencies).toEqual([]);
  });

  it("maps description to a single MCP tool definition", () => {
    const manifest = convertToAgentOSManifest(baseMeta, {
      publisher: "alpha.sui",
    });
    expect(manifest.mcp.compatible).toBe(true);
    expect(manifest.mcp.tools).toEqual([
      { name: "web-search", description: "Search the web for agent context" },
    ]);
  });

  it("defaults version to 0.1.0 when metadata has none", () => {
    const meta: SkillMdMetadata = {
      name: "n",
      description: "d",
      instructions: "",
    };
    const manifest = convertToAgentOSManifest(meta, { publisher: "p" });
    expect(manifest.version).toBe("0.1.0");
  });

  describe("instruction-only skill (no Move package)", () => {
    it("leaves movePackage and entry empty", () => {
      const manifest = convertToAgentOSManifest(baseMeta, {
        publisher: "alpha.sui",
      });
      expect(manifest.sui.movePackage).toBe("");
      expect(manifest.sui.entry).toBe("");
      expect(manifest.sui.policyRequired).toEqual([]);
    });
  });

  describe("Move-backed skill", () => {
    it("uses movePackage from options and derives entry from name fallback", () => {
      const manifest = convertToAgentOSManifest(baseMeta, {
        publisher: "alpha.sui",
        movePackage: "0xPACKAGE",
      });
      expect(manifest.sui.movePackage).toBe("0xPACKAGE");
      expect(manifest.sui.entry).toBe("web-search");
    });

    it("uses movePackage from metadata when options omit it", () => {
      const meta: SkillMdMetadata = { ...baseMeta, movePackage: "0xFROMMETA" };
      const manifest = convertToAgentOSManifest(meta, { publisher: "p" });
      expect(manifest.sui.movePackage).toBe("0xFROMMETA");
    });

    it("derives entry from the first script in a scripts mapping", () => {
      const meta: SkillMdMetadata = {
        ...baseMeta,
        scripts: { run: "mod::run", stop: "mod::stop" },
      };
      const manifest = convertToAgentOSManifest(meta, {
        publisher: "p",
        movePackage: "0xPKG",
      });
      expect(manifest.sui.entry).toBe("run");
    });

    it("derives entry from the first item in a scripts array", () => {
      const meta: SkillMdMetadata = {
        ...baseMeta,
        scripts: ["mod::first", "mod::second"],
      };
      const manifest = convertToAgentOSManifest(meta, {
        publisher: "p",
        movePackage: "0xPKG",
      });
      expect(manifest.sui.entry).toBe("mod::first");
    });

    it("options.movePackage takes precedence over metadata.movePackage", () => {
      const meta: SkillMdMetadata = { ...baseMeta, movePackage: "0xMETA" };
      const manifest = convertToAgentOSManifest(meta, {
        publisher: "p",
        movePackage: "0xOPTION",
      });
      expect(manifest.sui.movePackage).toBe("0xOPTION");
    });
  });
});

describe("scanSkillsDirectory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "skills-scan-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns an empty array for a non-existent directory", () => {
    expect(scanSkillsDirectory(join(tmpDir, "does-not-exist"))).toEqual([]);
  });

  it("recursively finds and parses SKILL.md files", () => {
    const skillA = join(tmpDir, "a");
    const skillB = join(tmpDir, "nested", "b");
    mkdirSync(skillA, { recursive: true });
    mkdirSync(skillB, { recursive: true });
    writeFileSync(
      join(skillA, "SKILL.md"),
      "---\nname: a\ndescription: Skill A\n---\nBody A",
    );
    writeFileSync(
      join(skillB, "SKILL.md"),
      "---\nname: b\ndescription: Skill B\n---\nBody B",
    );

    const results = scanSkillsDirectory(tmpDir);
    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(["a", "b"]);
    for (const r of results) {
      expect(r.sourcePath).toMatch(/SKILL\.md$/);
    }
  });

  it("accepts lowercase skill.md filenames", () => {
    writeFileSync(
      join(tmpDir, "skill.md"),
      "---\nname: lower\ndescription: Lowercase\n---\nBody",
    );
    const results = scanSkillsDirectory(tmpDir);
    expect(results.map((r) => r.name)).toEqual(["lower"]);
  });

  it("skips malformed SKILL.md files without aborting the scan", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const good = join(tmpDir, "good");
    const bad = join(tmpDir, "bad");
    mkdirSync(good, { recursive: true });
    mkdirSync(bad, { recursive: true });
    writeFileSync(
      join(good, "SKILL.md"),
      "---\nname: good\ndescription: Good\n---\nBody",
    );
    writeFileSync(join(bad, "SKILL.md"), "no frontmatter here");

    const results = scanSkillsDirectory(tmpDir);
    expect(results.map((r) => r.name)).toEqual(["good"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ignores node_modules and other excluded directories", () => {
    const nm = join(tmpDir, "node_modules", "pkg");
    mkdirSync(nm, { recursive: true });
    writeFileSync(
      join(nm, "SKILL.md"),
      "---\nname: should-not-appear\ndescription: x\n---\nBody",
    );
    expect(scanSkillsDirectory(tmpDir)).toEqual([]);
  });
});
