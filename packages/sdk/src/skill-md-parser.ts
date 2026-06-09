/**
 * Parser/converter for "Sui Agent Skills" `SKILL.md` files into AgentOS
 * `sui-agent-skill/v1` manifests.
 *
 * A `SKILL.md` file follows the Anthropic/Mysten "Agent Skills" convention: it
 * begins with a YAML frontmatter block delimited by `---` lines, containing at
 * minimum `name` and `description`, and often `version`, `tags`, and an
 * optional `scripts` / `movePackage` section. The remainder of the file is the
 * Markdown instruction body.
 *
 * This module ships a minimal, dependency-free frontmatter parser (no YAML
 * library is available in the SDK). It handles the common subset used by
 * SKILL.md files:
 *   - scalar values: `key: value`
 *   - quoted scalars: `key: "value"` / `key: 'value'`
 *   - inline arrays: `tags: [a, b, c]`
 *   - block-list arrays:
 *       tags:
 *         - a
 *         - b
 *   - one level of nested mapping (e.g. `scripts:` with indented `key: value`)
 *
 * Limitations: it does NOT support deeply nested structures, multi-line scalar
 * blocks (`|` / `>`), anchors/aliases, or flow mappings (`{ a: b }`). These are
 * uncommon in SKILL.md files; anything unsupported is ignored gracefully.
 */
import type { SkillManifest } from "./types.js";

export interface SkillMdMetadata {
  /** Skill name (required). */
  name: string;
  /** Human-readable description (required). Maps to an MCP tool definition. */
  description: string;
  /** Optional semantic version. */
  version?: string;
  /** Optional tags/keywords. */
  tags?: string[];
  /** Optional declared scripts/commands (used to derive `sui.entry`). */
  scripts?: Record<string, string> | string[];
  /** Optional Move package reference if the skill is Move-backed. */
  movePackage?: string;
  /** The Markdown instruction body after the frontmatter. */
  instructions: string;
  /** Path the metadata was parsed from, when discovered via a scan. */
  sourcePath?: string;
}

/** Default manifest version when SKILL.md omits `version`. */
const DEFAULT_VERSION = "0.1.0";

type FrontmatterValue = string | string[] | Record<string, string>;

/**
 * Parse a `SKILL.md` document into structured metadata.
 *
 * @throws if there is no frontmatter block, or required fields (`name`,
 *   `description`) are missing.
 */
export function parseSkillMd(content: string): SkillMdMetadata {
  const { frontmatter, body } = splitFrontmatter(content);
  const fields = parseFrontmatter(frontmatter);

  const name = asScalar(fields.name);
  const description = asScalar(fields.description);

  if (!name) {
    throw new Error(
      'Invalid SKILL.md: missing required frontmatter field "name"',
    );
  }
  if (!description) {
    throw new Error(
      'Invalid SKILL.md: missing required frontmatter field "description"',
    );
  }

  const metadata: SkillMdMetadata = {
    name,
    description,
    instructions: body.trim(),
  };

  const version = asScalar(fields.version);
  if (version) metadata.version = version;

  const tags = asStringArray(fields.tags);
  if (tags && tags.length > 0) metadata.tags = tags;

  const movePackage = asScalar(fields.movePackage ?? fields.move_package);
  if (movePackage) metadata.movePackage = movePackage;

  const scripts = fields.scripts;
  if (Array.isArray(scripts) && scripts.length > 0) {
    metadata.scripts = scripts;
  } else if (scripts && typeof scripts === "object") {
    metadata.scripts = scripts;
  }

  return metadata;
}

/**
 * Convert parsed SKILL.md metadata into an AgentOS `sui-agent-skill/v1`
 * manifest.
 *
 * The skill description is mapped to a single MCP tool definition. When a Move
 * package reference is available (via `options.movePackage` or
 * `metadata.movePackage`), `sui.entry` is derived from the first declared
 * script, falling back to the skill name. When no Move package is available the
 * skill is treated as instruction-only: both `sui.movePackage` and `sui.entry`
 * are left empty so the agent uses the instructions directly without PTB
 * execution.
 */
export function convertToAgentOSManifest(
  metadata: SkillMdMetadata,
  options: { publisher: string; movePackage?: string },
): SkillManifest {
  const movePackage = options.movePackage ?? metadata.movePackage ?? "";
  const entry = movePackage ? deriveEntry(metadata) : "";

  return {
    name: metadata.name,
    version: metadata.version ?? DEFAULT_VERSION,
    publisher: options.publisher,
    manifestType: "sui-agent-skill/v1",
    mcp: {
      compatible: true,
      tools: [
        {
          name: metadata.name,
          description: metadata.description,
        },
      ],
    },
    sui: {
      movePackage,
      entry,
      policyRequired: [],
    },
    dependencies: [],
  };
}

/** Derive a `sui.entry` value from declared scripts, falling back to the name. */
function deriveEntry(metadata: SkillMdMetadata): string {
  const { scripts, name } = metadata;
  if (Array.isArray(scripts) && scripts.length > 0) {
    return scripts[0];
  }
  if (scripts && typeof scripts === "object") {
    const keys = Object.keys(scripts);
    if (keys.length > 0) return keys[0];
  }
  return name;
}

// ---------------------------------------------------------------------------
// Frontmatter parsing internals
// ---------------------------------------------------------------------------

/** Split a SKILL.md document into its frontmatter block and instruction body. */
function splitFrontmatter(content: string): {
  frontmatter: string;
  body: string;
} {
  // Normalize line endings so the parser is robust to CRLF.
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  // Skip any leading blank lines before the opening delimiter.
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") {
    start += 1;
  }

  if (lines[start]?.trim() !== "---") {
    throw new Error(
      "Invalid SKILL.md: missing YAML frontmatter block (expected '---' delimiters)",
    );
  }

  // Find the closing delimiter.
  let end = -1;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }

  if (end === -1) {
    throw new Error(
      "Invalid SKILL.md: unterminated frontmatter block (missing closing '---')",
    );
  }

  return {
    frontmatter: lines.slice(start + 1, end).join("\n"),
    body: lines.slice(end + 1).join("\n"),
  };
}

/** Parse the frontmatter block into a flat map of keys to values. */
function parseFrontmatter(
  frontmatter: string,
): Record<string, FrontmatterValue> {
  const result: Record<string, FrontmatterValue> = {};
  const lines = frontmatter.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = stripComment(rawLine);
    if (line.trim() === "") continue;

    // Only consider top-level keys (no leading indentation).
    if (/^\s/.test(rawLine)) continue;

    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;

    const key = match[1];
    const valuePart = match[2].trim();

    if (valuePart !== "") {
      // Inline value (scalar or inline array).
      result[key] = parseInlineValue(valuePart);
      continue;
    }

    // Block value: look ahead at the indented lines that follow.
    const block = collectIndentedBlock(lines, i + 1);
    i = block.nextIndex - 1;

    if (block.lines.length === 0) {
      result[key] = "";
      continue;
    }

    const parsed = parseBlockValue(block.lines);
    if (parsed !== undefined) {
      result[key] = parsed;
    } else {
      result[key] = "";
    }
  }

  return result;
}

/** Collect consecutive indented (child) lines belonging to a block value. */
function collectIndentedBlock(
  lines: string[],
  startIndex: number,
): { lines: string[]; nextIndex: number } {
  const collected: string[] = [];
  let i = startIndex;
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === "") {
      collected.push(line);
      continue;
    }
    if (/^\s/.test(line)) {
      collected.push(line);
    } else {
      break;
    }
  }
  // Trim trailing blank lines from the collected block.
  while (
    collected.length > 0 &&
    collected[collected.length - 1].trim() === ""
  ) {
    collected.pop();
  }
  return { lines: collected, nextIndex: i };
}

/** Parse a block value: either a block-list array or a nested mapping. */
function parseBlockValue(
  blockLines: string[],
): string[] | Record<string, string> | undefined {
  const meaningful = blockLines.filter((l) => l.trim() !== "");
  if (meaningful.length === 0) return undefined;

  const isList = meaningful.every((l) => /^\s*-\s+/.test(stripComment(l)));
  if (isList) {
    return meaningful.map((l) => {
      const item = stripComment(l)
        .replace(/^\s*-\s+/, "")
        .trim();
      return unquote(item);
    });
  }

  // Treat as a nested mapping of `key: value` pairs.
  const map: Record<string, string> = {};
  for (const l of meaningful) {
    const stripped = stripComment(l);
    const m = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(stripped);
    if (m) {
      map[m[1]] = unquote(m[2].trim());
    }
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

/** Parse an inline value into a scalar string or an inline array. */
function parseInlineValue(value: string): string | string[] {
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (inner === "") return [];
    return inner
      .split(",")
      .map((part) => unquote(part.trim()))
      .filter((part) => part !== "");
  }
  return unquote(value);
}

/** Remove a trailing `# comment` from a line (ignoring `#` inside quotes). */
function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) {
      // A comment must be preceded by whitespace or start the line.
      if (i === 0 || /\s/.test(line[i - 1])) {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

/** Strip surrounding single/double quotes from a scalar value. */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/** Coerce a parsed frontmatter value into a scalar string, if possible. */
function asScalar(value: FrontmatterValue | undefined): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  return undefined;
}

/** Coerce a parsed frontmatter value into a string array, if possible. */
function asStringArray(
  value: FrontmatterValue | undefined,
): string[] | undefined {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : [trimmed];
  }
  return undefined;
}
