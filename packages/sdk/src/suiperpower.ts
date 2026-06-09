/**
 * Bridge between Suiperpower build output and AgentOS skill manifests.
 *
 * [Suiperpower](https://www.suiperpower.dev/) is an external build tool that
 * packages a Move-backed agent skill, deploys it, and (optionally) uploads the
 * manifest to Walrus. Its build output directory (default `.suiperpower/output/`)
 * contains some subset of:
 *   - a deployed Move `packageId` (hex),
 *   - a `skill.manifest.json` (a `sui-agent-skill/v1`-ish manifest, usually with
 *     an MVR-style `publisher` like `@org/pkg`),
 *   - a pre-uploaded Walrus blob id.
 *
 * The exact on-disk schema is not pinned, so {@link parseSuiperpowerOutput} is
 * intentionally tolerant: it reads whatever subset exists and leaves the rest
 * undefined.
 *
 * `node:fs`-dependent functions ({@link parseSuiperpowerOutput},
 * {@link detectSuperpowerProject}) are re-exported from the package's `./node`
 * entry only — mirroring `skill-md-scanner.ts` — so the browser build stays
 * clean. The pure assembler {@link buildManifestFromSuperpowerOutput} and the
 * {@link SuiperpowerBuildResult} type are safe to export from `index.ts`.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { validateManifest } from "./manifest.js";
import type { SkillManifest, SkillManifestTool } from "./types.js";

/** Best-effort result of parsing a Suiperpower build output directory. */
export interface SuiperpowerBuildResult {
  /** Deployed Move package id (hex), if found. */
  packageId?: string;
  /** Parsed skill.manifest.json contents, if present. */
  manifest?: Partial<SkillManifest> & Record<string, unknown>;
  /** Pre-uploaded Walrus blob id, if the build already uploaded the manifest. */
  walrusBlobId?: string;
  /** The output directory that was parsed. */
  outputDir: string;
}

/** Config file basenames that indicate a Suiperpower workspace. */
const SUIPERPOWER_CONFIG_FILES = [
  "suiperpower.config.json",
  "suiperpower.config.js",
  "suiperpower.config.ts",
  "suiperpower.config.mjs",
  "suiperpower.config.cjs",
  "suiperpower.config.toml",
];

/** Read and JSON-parse a file, returning undefined on any failure. */
function readJsonSafe(path: string): unknown {
  try {
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

/** Read a plain text file and trim it, returning undefined on any failure. */
function readTextSafe(path: string): string | undefined {
  try {
    if (!existsSync(path)) return undefined;
    const text = readFileSync(path, "utf8").trim();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract a `packageId` from `sui client publish --json` output by finding an
 * objectChange of `type === "published"`. Tolerant of unexpected shapes.
 */
function extractPackageIdFromPublishJson(data: unknown): string | undefined {
  if (data === null || typeof data !== "object") return undefined;
  const changes = (data as Record<string, unknown>).objectChanges;
  if (!Array.isArray(changes)) return undefined;
  for (const change of changes) {
    if (
      change !== null &&
      typeof change === "object" &&
      (change as Record<string, unknown>).type === "published"
    ) {
      const packageId = (change as Record<string, unknown>).packageId;
      if (typeof packageId === "string" && packageId.length > 0) {
        return packageId;
      }
    }
  }
  return undefined;
}

/** Pull a string field off an unknown object, if present and non-empty. */
function stringField(obj: unknown, key: string): string | undefined {
  if (obj === null || typeof obj !== "object") return undefined;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Parse a Suiperpower build output directory into a {@link SuiperpowerBuildResult}.
 *
 * This is best-effort: it reads whatever recognizable artifacts exist and
 * leaves missing pieces undefined. It only throws if `outputDir` does not
 * exist, so callers can branch on the populated fields.
 *
 * Resolution order:
 *   - `manifest`: `skill.manifest.json` directly in `outputDir`.
 *   - `packageId`: explicit `package-id.txt`/`packageId` file → a published
 *     objectChange in `publish.json`/`publish-testnet.json` → a `packageId` or
 *     `movePackage` field on the manifest.
 *   - `walrusBlobId`: `walrus.json` (`walrusBlobId`/`blobId`) → the same fields
 *     on the manifest.
 *
 * @param outputDir Suiperpower build output directory (e.g. `.suiperpower/output/`).
 * @throws if `outputDir` does not exist.
 */
export function parseSuiperpowerOutput(
  outputDir: string,
): SuiperpowerBuildResult {
  if (!existsSync(outputDir)) {
    throw new Error(`Suiperpower output directory not found: ${outputDir}`);
  }

  const result: SuiperpowerBuildResult = { outputDir };

  // --- manifest ---------------------------------------------------------
  const manifestRaw = readJsonSafe(join(outputDir, "skill.manifest.json"));
  if (manifestRaw !== null && typeof manifestRaw === "object") {
    result.manifest = manifestRaw as SuiperpowerBuildResult["manifest"];
  }

  // --- packageId --------------------------------------------------------
  // 1. Explicit package-id artifacts.
  let packageId =
    readTextSafe(join(outputDir, "package-id.txt")) ??
    readTextSafe(join(outputDir, "packageId"));

  // 2. `sui client publish --json` artifacts.
  if (!packageId) {
    for (const name of [
      "publish.json",
      "publish-testnet.json",
      "publish-mainnet.json",
    ]) {
      const publishData = readJsonSafe(join(outputDir, name));
      const fromPublish = extractPackageIdFromPublishJson(publishData);
      if (fromPublish) {
        packageId = fromPublish;
        break;
      }
    }
  }

  // 3. Fields embedded in the manifest.
  if (!packageId && result.manifest) {
    packageId =
      stringField(result.manifest, "packageId") ??
      stringField(result.manifest, "movePackage") ??
      stringField(result.manifest.sui, "movePackage");
  }

  if (packageId) result.packageId = packageId;

  // --- walrusBlobId -----------------------------------------------------
  const walrusData = readJsonSafe(join(outputDir, "walrus.json"));
  let walrusBlobId =
    stringField(walrusData, "walrusBlobId") ??
    stringField(walrusData, "blobId");
  if (!walrusBlobId && result.manifest) {
    walrusBlobId =
      stringField(result.manifest, "walrusBlobId") ??
      stringField(result.manifest, "blobId");
  }
  if (walrusBlobId) result.walrusBlobId = walrusBlobId;

  return result;
}

/** Slugify a string into a manifest-friendly identifier. */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Derive an MVR-style publisher (`@org/pkg`) from an agent name and skill name.
 * Strips a trailing `.sui` from the agent name to form the org segment.
 */
function derivePublisher(agentName: string, skillName: string): string {
  const org = slugify(agentName.replace(/\.sui$/i, "")) || "agent";
  const pkg = slugify(skillName) || "skill";
  return `@${org}/${pkg}`;
}

/**
 * Assemble a complete `sui-agent-skill/v1` {@link SkillManifest} from a
 * Suiperpower build result.
 *
 * Starts from `result.manifest` when present and fills in any missing required
 * fields with sensible defaults. `sui.movePackage` is populated from
 * `result.packageId` (falling back to any value already on the manifest).
 * `publisher` prefers an existing MVR-style value, otherwise it is derived from
 * `agentName`.
 *
 * The returned manifest is validated with {@link validateManifest} before being
 * returned, so it is always safe to serialize/publish.
 */
export function buildManifestFromSuperpowerOutput(
  result: SuiperpowerBuildResult,
  options: { agentName: string },
): SkillManifest {
  const existing = result.manifest ?? {};
  const existingSui =
    existing.sui && typeof existing.sui === "object"
      ? (existing.sui as Partial<SkillManifest["sui"]>)
      : {};
  const existingMcp =
    existing.mcp && typeof existing.mcp === "object"
      ? (existing.mcp as Partial<SkillManifest["mcp"]>)
      : {};

  const name =
    typeof existing.name === "string" && existing.name.length > 0
      ? existing.name
      : "skill";
  const version =
    typeof existing.version === "string" && existing.version.length > 0
      ? existing.version
      : "0.1.0";

  // Tools: preserve existing, else derive a single tool from name/description.
  let tools: SkillManifestTool[];
  if (Array.isArray(existingMcp.tools) && existingMcp.tools.length > 0) {
    tools = existingMcp.tools;
  } else {
    const description =
      typeof (existing as Record<string, unknown>).description === "string"
        ? ((existing as Record<string, unknown>).description as string)
        : `${name} skill`;
    tools = [{ name, description }];
  }

  const movePackage =
    result.packageId ??
    (typeof existingSui.movePackage === "string"
      ? existingSui.movePackage
      : "");
  const entry = typeof existingSui.entry === "string" ? existingSui.entry : "";
  const policyRequired = Array.isArray(existingSui.policyRequired)
    ? existingSui.policyRequired
    : [];

  const publisher =
    typeof existing.publisher === "string" && existing.publisher.length > 0
      ? existing.publisher
      : derivePublisher(options.agentName, name);

  const dependencies = Array.isArray(existing.dependencies)
    ? (existing.dependencies as string[])
    : [];

  const manifest: SkillManifest = {
    name,
    version,
    publisher,
    manifestType: "sui-agent-skill/v1",
    mcp: {
      compatible:
        typeof existingMcp.compatible === "boolean"
          ? existingMcp.compatible
          : true,
      tools,
    },
    sui: {
      movePackage,
      entry,
      policyRequired,
    },
    dependencies,
  };

  validateManifest(manifest);
  return manifest;
}

/**
 * Whether `cwd` looks like a Suiperpower workspace: it contains a
 * `.suiperpower/` directory or a `suiperpower.config.*` file.
 */
export function detectSuperpowerProject(cwd: string): boolean {
  const suiperpowerDir = join(cwd, ".suiperpower");
  try {
    if (existsSync(suiperpowerDir) && statSync(suiperpowerDir).isDirectory()) {
      return true;
    }
  } catch {
    // ignore and fall through to config-file check
  }

  return SUIPERPOWER_CONFIG_FILES.some((file) => existsSync(join(cwd, file)));
}
