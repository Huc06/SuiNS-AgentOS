import { createHash } from "node:crypto";

import type { SkillManifest } from "./types.js";

const MANIFEST_TYPE = "sui-agent-skill/v1";

/**
 * Recursively sort object keys so that the same logical value always produces
 * identical JSON output. This is critical for deterministic hashing — the
 * SHA-256 of a serialized manifest must be stable across serializations
 * (see Property 1).
 */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Serialize a SkillManifest to deterministic JSON bytes. Object keys are
 * recursively sorted so that repeated serializations of the same manifest
 * always produce byte-identical output (and therefore identical hashes).
 */
export function serializeManifest(manifest: SkillManifest): Uint8Array {
  const json = JSON.stringify(sortValue(manifest));
  return new TextEncoder().encode(json);
}

/**
 * Deserialize JSON bytes back into a SkillManifest. The parsed object is
 * validated against the `sui-agent-skill/v1` schema before being returned.
 */
export function deserializeManifest(data: Uint8Array): SkillManifest {
  const json = new TextDecoder().decode(data);
  const parsed = JSON.parse(json) as SkillManifest;
  validateManifest(parsed);
  return parsed;
}

/**
 * Compute a hex-encoded SHA-256 hash of the serialized manifest bytes.
 *
 * Implementation note: the design specifies a synchronous `string` return.
 * Manifest hashing runs in the CLI/SDK Node context, so we use Node's
 * `node:crypto` `createHash` synchronously rather than the async Web Crypto
 * `crypto.subtle.digest`. This keeps the signature synchronous as designed
 * and is consistent with the SDK's existing use of `node:*` modules.
 */
export function computeManifestHash(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Validate that a manifest conforms to the `sui-agent-skill/v1` schema.
 * Throws on invalid manifestType or missing required fields.
 */
export function validateManifest(manifest: SkillManifest): void {
  if (manifest === null || typeof manifest !== "object") {
    throw new Error("Invalid manifest: expected an object");
  }

  if (manifest.manifestType !== MANIFEST_TYPE) {
    throw new Error(
      `Invalid manifestType: ${String(manifest.manifestType)}. Expected ${MANIFEST_TYPE}`,
    );
  }

  const requiredFields: (keyof SkillManifest)[] = [
    "name",
    "version",
    "publisher",
    "mcp",
    "sui",
    "dependencies",
  ];

  for (const field of requiredFields) {
    if (manifest[field] === undefined || manifest[field] === null) {
      throw new Error(`Invalid manifest: missing required field "${field}"`);
    }
  }
}
