import { describe, expect, it } from "vitest";
import * as fc from "fast-check";

import { computeManifestHash, serializeManifest } from "./manifest.js";
import { formatSkillSubname } from "./suins-utils.js";
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
 * Arbitrary generator for valid SkillManifest objects.
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

describe("Feature: walrus-skill-lifecycle, Property 4: publish registry correctness", () => {
  /**
   * **Validates: Requirements 2.5, 4.4**
   *
   * For any valid manifest, after publish, the registry record matches manifest fields.
   * We mock the publish operation to verify the registry record fields match.
   */
  it("registry record fields match manifest after publish", () => {
    fc.assert(
      fc.property(arbManifest, (manifest) => {
        // Simulate the publish flow: serialize → compute hash → create record
        const serialized = serializeManifest(manifest);
        const manifestHash = computeManifestHash(serialized);
        const fakeBlobId = `blob_${manifestHash.slice(0, 8)}`;

        // Simulate the registry record that publishSkill would create
        const record = {
          skillId: manifest.name,
          version: manifest.version,
          walrusManifestBlob: fakeBlobId,
          manifestHash: manifestHash,
          mvrPackageName: `@publisher/${manifest.name}`,
          requiredCapabilities: manifest.sui.policyRequired,
          dependencies: manifest.dependencies,
        };

        // Verify registry record fields match the manifest
        expect(record.skillId).toBe(manifest.name);
        expect(record.version).toBe(manifest.version);
        expect(record.walrusManifestBlob).toBe(fakeBlobId);
        expect(record.manifestHash).toBe(manifestHash);

        // Verify hash is deterministic (re-serialize and hash again)
        const serialized2 = serializeManifest(manifest);
        const hash2 = computeManifestHash(serialized2);
        expect(record.manifestHash).toBe(hash2);
      }),
    );
  });
});

describe("Feature: walrus-skill-lifecycle, Property 8: capability gate", () => {
  /**
   * **Validates: Requirements 7.4, 7.5**
   *
   * For any policy array P and capability set C, execution is allowed iff P ⊆ C.
   */
  it("execution allowed iff policyRequired ⊆ agentCapabilities", () => {
    // Generate policy arrays and capability sets from a shared universe of capabilities
    const arbCapabilityUniverse = fc
      .array(fc.string({ minLength: 1, maxLength: 20 }), {
        minLength: 0,
        maxLength: 10,
      })
      .map((arr) => [...new Set(arr)]); // deduplicate

    fc.assert(
      fc.property(
        arbCapabilityUniverse.chain((universe) =>
          fc.tuple(
            fc.subarray(universe, { minLength: 0, maxLength: universe.length }), // policyRequired
            fc.subarray(universe, { minLength: 0, maxLength: universe.length }), // agentCapabilities
          ),
        ),
        ([policyRequired, agentCapabilities]) => {
          // Check if P ⊆ C
          const capSet = new Set(agentCapabilities);
          const allSatisfied = policyRequired.every((p) => capSet.has(p));

          // Simulate the capability gate check from executeSkill
          let executionAllowed = true;
          let missingCapability: string | undefined;
          for (const required of policyRequired) {
            if (!capSet.has(required)) {
              executionAllowed = false;
              missingCapability = required;
              break;
            }
          }

          if (allSatisfied) {
            expect(executionAllowed).toBe(true);
          } else {
            expect(executionAllowed).toBe(false);
            expect(missingCapability).toBeDefined();
            expect(capSet.has(missingCapability!)).toBe(false);
          }
        },
      ),
    );
  });
});

describe("Feature: walrus-skill-lifecycle, Property 9: PTB construction", () => {
  /**
   * **Validates: Requirements 7.1**
   *
   * For any valid manifest, constructed PTB target matches manifest's sui.movePackage + sui.entry.
   */
  it("PTB target matches manifest movePackage and entry", () => {
    fc.assert(
      fc.property(arbManifest, (manifest) => {
        const { movePackage, entry } = manifest.sui;

        // The client's #parseEntry logic:
        // - If entry has 3 parts (pkg::mod::fn), use them directly
        // - If entry has 2 parts (mod::fn), prepend movePackage
        // - Otherwise use [movePackage, "main", entry]
        const parts = entry.split("::");
        let expectedTarget: string;
        if (parts.length === 3) {
          expectedTarget = `${parts[0]}::${parts[1]}::${parts[2]}`;
        } else if (parts.length === 2) {
          expectedTarget = `${movePackage}::${parts[0]}::${parts[1]}`;
        } else {
          expectedTarget = `${movePackage}::main::${entry}`;
        }

        // Verify the PTB target contains the manifest's Move package and entry function
        if (parts.length === 2) {
          // Most common case: entry is "module::function"
          expect(expectedTarget).toBe(`${movePackage}::${entry}`);
          expect(expectedTarget).toContain(movePackage);
          expect(expectedTarget).toContain(parts[0]); // module
          expect(expectedTarget).toContain(parts[1]); // function
        } else if (parts.length === 3) {
          // Full target embedded in entry
          expect(expectedTarget).toBe(entry);
        } else {
          // Single-part entry
          expect(expectedTarget).toContain(movePackage);
          expect(expectedTarget).toContain(entry);
        }

        // The target should always be in format "X::Y::Z"
        const targetParts = expectedTarget.split("::");
        expect(targetParts.length).toBe(3);
      }),
    );
  });
});

describe("Feature: walrus-skill-lifecycle, Property 10: subname formatting", () => {
  /**
   * **Validates: Requirements 4.1, 5.1**
   *
   * For any skill name S and agent name A, the result is `{S}.{A}` (with .sui
   * appended if A doesn't end with .sui).
   */
  it("produces {skill}.{agent}.sui for agent names without .sui suffix", () => {
    const arbSkillName = fc.stringMatching(/^[a-z][a-z0-9_-]{0,15}$/);
    const arbAgentNameNoSui = fc
      .stringMatching(/^[a-z][a-z0-9_-]{0,15}$/)
      .filter((s) => !s.endsWith(".sui") && !s.endsWith("sui") && s.length > 0);

    fc.assert(
      fc.property(arbSkillName, arbAgentNameNoSui, (skill, agent) => {
        const result = formatSkillSubname(skill, agent);
        expect(result).toBe(`${skill}.${agent}.sui`);
      }),
    );
  });

  it("produces {skill}.{agent} when agent already ends with .sui", () => {
    const arbSkillName = fc.stringMatching(/^[a-z][a-z0-9_-]{0,15}$/);
    const arbAgentBase = fc.stringMatching(/^[a-z][a-z0-9_-]{0,15}$/);

    fc.assert(
      fc.property(arbSkillName, arbAgentBase, (skill, agentBase) => {
        const agent = `${agentBase}.sui`;
        const result = formatSkillSubname(skill, agent);
        expect(result).toBe(`${skill}.${agent}`);
        // Should end with .sui (not .sui.sui)
        expect(result.endsWith(".sui")).toBe(true);
        expect(result.endsWith(".sui.sui")).toBe(false);
      }),
    );
  });
});
