/**
 * Node-only helpers for discovering `SKILL.md` files on disk.
 *
 * Split out from {@link ./skill-md-parser.ts} because it depends on `node:fs`
 * and `node:path`; the browser SDK build must not pull these in. Exported via
 * the package's `./node` entry.
 */
import { readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";

import { parseSkillMd, type SkillMdMetadata } from "./skill-md-parser.js";

/** Directories that are never worth recursing into during a scan. */
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build"]);

/** Whether a filename should be treated as a SKILL.md file. */
function isSkillMdFile(name: string): boolean {
  return name === "SKILL.md" || name === "skill.md";
}

/**
 * Recursively find and parse all `SKILL.md` files under `dirPath`.
 *
 * Intended for the conventional `.agents/skills/` and `~/.agents/skills/`
 * directories. A single malformed SKILL.md does not abort the scan: it is
 * skipped (with a warning) and the remaining files are still parsed.
 *
 * @returns parsed metadata for each successfully parsed file, each with
 *   `sourcePath` set. Returns an empty array if `dirPath` does not exist.
 */
export function scanSkillsDirectory(dirPath: string): SkillMdMetadata[] {
  const results: SkillMdMetadata[] = [];

  let entries: Dirent[];
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    // Directory missing or unreadable — treat as "no skills found".
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      results.push(...scanSkillsDirectory(fullPath));
      continue;
    }

    if (entry.isFile() && isSkillMdFile(entry.name)) {
      try {
        const content = readFileSync(fullPath, "utf8");
        const metadata = parseSkillMd(content);
        metadata.sourcePath = fullPath;
        results.push(metadata);
      } catch (error) {
        // Skip malformed files so one bad skill doesn't break the whole scan.
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Skipping ${fullPath}: ${message}`);
      }
    }
  }

  return results;
}
