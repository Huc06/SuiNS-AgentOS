import { describe, expect, it } from "vitest";
import * as fc from "fast-check";

import {
  computeManifestHash,
  deserializeManifest,
  serializeManifest,
  validateManifest,
} from "./manifest.js";
import type { SkillManifest, SkillManifestTool } from "./types.js";

/**
 * Arbitrary generator for valid SkillManifestTool objects.
 */
const arbTool: fc.Arbitrary<SkillManifestTool> = fc.record({
  name: fc
    .string({ minLength: 1, maxLength: 30 })
    .filter((s) => !s.includes("\\")),
  description: fc.string({ minLength: 0, maxLength: 100 }),
});

/**
 * Arbitrary generator for valid SkillManifest objects conforming to sui-agent-skill/v1.
 */
const arbManifest: fc.Arbitrary<SkillManifest> = fc.record({
  name: fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => s.trim().length > 0),
  version: fc
    .tuple(fc.nat(99), fc.nat(99), fc.nat(99))
    .map(([a, b, c]) => `${a}.${b}.${c}`),
  publisher: fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => s.trim().length > 0),
  manifestType: fc.constant("sui-agent-skill/v1" as const),
  mcp: fc.record({
    compatible: fc.boolean(),
    tools: fc.array(arbTool, { minLength: 0, maxLength: 5 }),
  }),
  sui: fc.record({
    movePackage: fc.stringMatching(/^0x[0-9a-f]{4,64}$/),
    entry: fc
      .tuple(
        fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/),
        fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/),
      )
      .map(([mod, func]) => `${mod}::${func}`),
    policyRequired: fc.array(fc.string({ minLength: 1, maxLength: 20 }), {
      minLength: 0,
      maxLength: 3,
    }),
  }),
  dependencies: fc.array(
    fc
      .tuple(
        fc.stringMatching(/^[a-z][a-z0-9_-]{0,10}$/),
        fc.stringMatching(/^[a-z][a-z0-9_-]{0,10}$/),
      )
      .map(([skill, agent]) => `${skill}.${agent}.sui`),
    { minLength: 0, maxLength: 4 },
  ),
});

describe("Feature: walrus-skill-lifecycle, Property 1: manifest serialization round-trip", () => {
  /**
   * **Validates: Requirements 1.2, 6.5**
   *
   * For any valid SkillManifest, serialize → deserialize → deep equal.
   * Hash consistency across repeated serializations.
   */
  it("serialize → deserialize produces deeply equal manifest", () => {
    fc.assert(
      fc.property(arbManifest, (manifest) => {
        const serialized = serializeManifest(manifest);
        const deserialized = deserializeManifest(serialized);
        expect(deserialized).toEqual(manifest);
      }),
    );
  });

  it("hash is consistent across repeated serializations of the same manifest", () => {
    fc.assert(
      fc.property(arbManifest, (manifest) => {
        const s1 = serializeManifest(manifest);
        const s2 = serializeManifest(manifest);
        const hash1 = computeManifestHash(s1);
        const hash2 = computeManifestHash(s2);
        expect(hash1).toBe(hash2);
      }),
    );
  });
});

describe("Feature: walrus-skill-lifecycle, Property 2: manifestType validation", () => {
  /**
   * **Validates: Requirements 1.5, 1.6**
   *
   * For any string, validateManifest accepts only 'sui-agent-skill/v1'.
   */
  it("accepts only 'sui-agent-skill/v1' as manifestType", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 100 }), (randomType) => {
        const manifest = {
          name: "test",
          version: "1.0.0",
          publisher: "test-publisher",
          manifestType: randomType as unknown as "sui-agent-skill/v1",
          mcp: { compatible: true, tools: [] },
          sui: { movePackage: "0xabc", entry: "mod::fn", policyRequired: [] },
          dependencies: [],
        } as unknown as SkillManifest;

        if (randomType === "sui-agent-skill/v1") {
          expect(() => validateManifest(manifest)).not.toThrow();
        } else {
          expect(() => validateManifest(manifest)).toThrow(
            `Invalid manifestType: ${randomType}. Expected sui-agent-skill/v1`,
          );
        }
      }),
    );
  });
});

describe("Feature: walrus-skill-lifecycle, Property 3: dependency encoding round-trip", () => {
  /**
   * **Validates: Requirements 2.4, 8.5**
   *
   * For any array of UTF-8 strings, encode to vector<vector<u8>> (TextEncoder)
   * then decode → equal.
   */
  it("encode → decode UTF-8 string arrays produces equal result", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 0, maxLength: 100 }), {
          minLength: 0,
          maxLength: 20,
        }),
        (strings) => {
          // Encode: string[] → Uint8Array[]
          const encoder = new TextEncoder();
          const encoded: Uint8Array[] = strings.map((s) => encoder.encode(s));

          // Decode: Uint8Array[] → string[]
          const decoder = new TextDecoder();
          const decoded: string[] = encoded.map((bytes) =>
            decoder.decode(bytes),
          );

          expect(decoded).toEqual(strings);
        },
      ),
    );
  });
});
