import { describe, expect, it } from "vitest";

import {
  computeManifestHash,
  deserializeManifest,
  serializeManifest,
  validateManifest,
} from "../src/manifest.js";
import type { SkillManifest } from "../src/types.js";

function validManifest(): SkillManifest {
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
      policyRequired: ["transfer"],
    },
    dependencies: ["price-feed.oracle.sui"],
  };
}

describe("manifest utilities", () => {
  describe("validateManifest", () => {
    it("accepts a valid sui-agent-skill/v1 manifest", () => {
      expect(() => validateManifest(validManifest())).not.toThrow();
    });

    it("throws on invalid manifestType", () => {
      const manifest = {
        ...validManifest(),
        manifestType: "wrong-type" as "sui-agent-skill/v1",
      };
      expect(() => validateManifest(manifest)).toThrow(
        "Invalid manifestType: wrong-type. Expected sui-agent-skill/v1",
      );
    });

    it("throws on empty manifestType", () => {
      const manifest = {
        ...validManifest(),
        manifestType: "" as "sui-agent-skill/v1",
      };
      expect(() => validateManifest(manifest)).toThrow(
        "Invalid manifestType: . Expected sui-agent-skill/v1",
      );
    });

    it("throws when required field 'name' is missing", () => {
      const manifest = { ...validManifest() };
      // @ts-expect-error - testing missing field
      delete manifest.name;
      expect(() => validateManifest(manifest)).toThrow(
        'Invalid manifest: missing required field "name"',
      );
    });

    it("throws when required field 'version' is missing", () => {
      const manifest = { ...validManifest() };
      // @ts-expect-error - testing missing field
      delete manifest.version;
      expect(() => validateManifest(manifest)).toThrow(
        'Invalid manifest: missing required field "version"',
      );
    });

    it("throws when required field 'publisher' is missing", () => {
      const manifest = { ...validManifest() };
      // @ts-expect-error - testing missing field
      delete manifest.publisher;
      expect(() => validateManifest(manifest)).toThrow(
        'Invalid manifest: missing required field "publisher"',
      );
    });

    it("throws when required field 'mcp' is missing", () => {
      const manifest = { ...validManifest() };
      // @ts-expect-error - testing missing field
      delete manifest.mcp;
      expect(() => validateManifest(manifest)).toThrow(
        'Invalid manifest: missing required field "mcp"',
      );
    });

    it("throws when required field 'sui' is missing", () => {
      const manifest = { ...validManifest() };
      // @ts-expect-error - testing missing field
      delete manifest.sui;
      expect(() => validateManifest(manifest)).toThrow(
        'Invalid manifest: missing required field "sui"',
      );
    });

    it("throws when required field 'dependencies' is missing", () => {
      const manifest = { ...validManifest() };
      // @ts-expect-error - testing missing field
      delete manifest.dependencies;
      expect(() => validateManifest(manifest)).toThrow(
        'Invalid manifest: missing required field "dependencies"',
      );
    });
  });

  describe("serializeManifest / deserializeManifest", () => {
    it("round-trips a valid manifest", () => {
      const manifest = validManifest();
      const serialized = serializeManifest(manifest);
      const deserialized = deserializeManifest(serialized);
      expect(deserialized).toEqual(manifest);
    });

    it("produces deterministic output regardless of key order", () => {
      const manifest = validManifest();
      // Create same manifest with different key insertion order
      const reordered: SkillManifest = {
        dependencies: manifest.dependencies,
        sui: manifest.sui,
        mcp: manifest.mcp,
        manifestType: manifest.manifestType,
        publisher: manifest.publisher,
        version: manifest.version,
        name: manifest.name,
      };

      const bytes1 = serializeManifest(manifest);
      const bytes2 = serializeManifest(reordered);
      expect(bytes1).toEqual(bytes2);
    });

    it("serializes to valid UTF-8 JSON bytes", () => {
      const manifest = validManifest();
      const serialized = serializeManifest(manifest);
      const json = new TextDecoder().decode(serialized);
      expect(() => JSON.parse(json)).not.toThrow();
    });
  });

  describe("computeManifestHash", () => {
    it("returns a 64-character hex string (SHA-256)", () => {
      const data = new TextEncoder().encode('{"test": true}');
      const hash = computeManifestHash(data);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces the same hash for identical bytes", () => {
      const manifest = validManifest();
      const serialized = serializeManifest(manifest);
      const hash1 = computeManifestHash(serialized);
      const hash2 = computeManifestHash(serialized);
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different content", () => {
      const m1 = validManifest();
      const m2 = { ...validManifest(), version: "2.0.0" };
      const hash1 = computeManifestHash(serializeManifest(m1));
      const hash2 = computeManifestHash(serializeManifest(m2));
      expect(hash1).not.toBe(hash2);
    });

    it("hash is consistent with serialization determinism", () => {
      const manifest = validManifest();
      const hash1 = computeManifestHash(serializeManifest(manifest));
      // Serialize again — should get same hash
      const hash2 = computeManifestHash(serializeManifest(manifest));
      expect(hash1).toBe(hash2);
    });
  });
});
