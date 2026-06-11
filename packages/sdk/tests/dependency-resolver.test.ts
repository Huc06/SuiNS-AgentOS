import { describe, it, expect } from "vitest";
import { DependencyResolver } from "../src/dependency-resolver.js";
import type { SkillResolver } from "../src/dependency-resolver.js";
import type { SkillDescriptor, SkillManifest } from "../src/types.js";

function makeDescriptor(skillId: string, deps: string[] = []): SkillDescriptor {
  return {
    skillId,
    walrusManifestBlob: `blob-${skillId}`,
    manifestHash: `hash-${skillId}`,
    mvrPackageName: `@test/${skillId}`,
    version: "1.0.0",
    requiredCapabilities: [],
    dependencies: deps,
  };
}

function makeManifest(name: string, deps: string[] = []): SkillManifest {
  return {
    name,
    version: "1.0.0",
    publisher: "test",
    manifestType: "sui-agent-skill/v1",
    mcp: { compatible: true, tools: [] },
    sui: { movePackage: "0x1", entry: "run", policyRequired: [] },
    dependencies: deps,
  };
}

function createMockResolver(graph: Record<string, string[]>): SkillResolver {
  return {
    resolveSkill: async (name: string) => {
      if (!(name in graph)) {
        throw new Error(`Skill not found: ${name}`);
      }
      return makeDescriptor(name, graph[name]);
    },
    downloadManifest: async (blobId: string) => {
      const name = blobId.replace("blob-", "");
      if (!(name in graph)) {
        throw new Error(`Manifest blob not found: ${blobId}`);
      }
      return makeManifest(name, graph[name]);
    },
  };
}

describe("DependencyResolver", () => {
  describe("detectCycle", () => {
    it("returns null for an empty graph", () => {
      const resolver = new DependencyResolver(createMockResolver({}));
      const adj = new Map<string, string[]>();
      expect(resolver.detectCycle(adj)).toBeNull();
    });

    it("returns null for a DAG", () => {
      const resolver = new DependencyResolver(createMockResolver({}));
      const adj = new Map<string, string[]>([
        ["A", ["B", "C"]],
        ["B", ["D"]],
        ["C", ["D"]],
        ["D", []],
      ]);
      expect(resolver.detectCycle(adj)).toBeNull();
    });

    it("detects a simple cycle", () => {
      const resolver = new DependencyResolver(createMockResolver({}));
      const adj = new Map<string, string[]>([
        ["A", ["B"]],
        ["B", ["C"]],
        ["C", ["A"]],
      ]);
      const cycle = resolver.detectCycle(adj);
      expect(cycle).not.toBeNull();
      // The cycle should start and end with the same node
      expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
    });

    it("detects a self-loop", () => {
      const resolver = new DependencyResolver(createMockResolver({}));
      const adj = new Map<string, string[]>([["A", ["A"]]]);
      const cycle = resolver.detectCycle(adj);
      expect(cycle).not.toBeNull();
      expect(cycle).toEqual(["A", "A"]);
    });
  });

  describe("topologicalSort", () => {
    it("returns empty array for empty graph", () => {
      const resolver = new DependencyResolver(createMockResolver({}));
      const adj = new Map<string, string[]>();
      expect(resolver.topologicalSort(adj)).toEqual([]);
    });

    it("returns single node for single-node graph", () => {
      const resolver = new DependencyResolver(createMockResolver({}));
      const adj = new Map<string, string[]>([["A", []]]);
      expect(resolver.topologicalSort(adj)).toEqual(["A"]);
    });

    it("returns dependencies before dependents (linear chain)", () => {
      const resolver = new DependencyResolver(createMockResolver({}));
      // A depends on B, B depends on C
      const adj = new Map<string, string[]>([
        ["A", ["B"]],
        ["B", ["C"]],
        ["C", []],
      ]);
      const result = resolver.topologicalSort(adj);
      expect(result.indexOf("C")).toBeLessThan(result.indexOf("B"));
      expect(result.indexOf("B")).toBeLessThan(result.indexOf("A"));
    });

    it("returns dependencies before dependents (diamond graph)", () => {
      const resolver = new DependencyResolver(createMockResolver({}));
      // A depends on B and C, both depend on D
      const adj = new Map<string, string[]>([
        ["A", ["B", "C"]],
        ["B", ["D"]],
        ["C", ["D"]],
        ["D", []],
      ]);
      const result = resolver.topologicalSort(adj);
      // D must come before B and C
      expect(result.indexOf("D")).toBeLessThan(result.indexOf("B"));
      expect(result.indexOf("D")).toBeLessThan(result.indexOf("C"));
      // B and C must come before A
      expect(result.indexOf("B")).toBeLessThan(result.indexOf("A"));
      expect(result.indexOf("C")).toBeLessThan(result.indexOf("A"));
    });
  });

  describe("resolve", () => {
    it("returns empty array when manifest has no dependencies", async () => {
      const resolver = new DependencyResolver(createMockResolver({}));
      const manifest = makeManifest("root", []);
      const result = await resolver.resolve(manifest);
      expect(result).toEqual([]);
    });

    it("resolves a single dependency", async () => {
      const mockResolver = createMockResolver({ "dep.agent.sui": [] });
      const resolver = new DependencyResolver(mockResolver);
      const manifest = makeManifest("root", ["dep.agent.sui"]);

      const result = await resolver.resolve(manifest);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("dep.agent.sui");
    });

    it("resolves transitive dependencies in topological order", async () => {
      const mockResolver = createMockResolver({
        "b.agent.sui": ["d.agent.sui"],
        "c.agent.sui": ["d.agent.sui"],
        "d.agent.sui": [],
      });
      const resolver = new DependencyResolver(mockResolver);
      const manifest = makeManifest("root", ["b.agent.sui", "c.agent.sui"]);

      const result = await resolver.resolve(manifest);
      expect(result).toHaveLength(3);

      const names = result.map((r) => r.name);
      // D must come before B and C
      expect(names.indexOf("d.agent.sui")).toBeLessThan(
        names.indexOf("b.agent.sui"),
      );
      expect(names.indexOf("d.agent.sui")).toBeLessThan(
        names.indexOf("c.agent.sui"),
      );
    });

    it("throws on circular dependency with cycle path", async () => {
      const mockResolver = createMockResolver({
        "a.agent.sui": ["b.agent.sui"],
        "b.agent.sui": ["c.agent.sui"],
        "c.agent.sui": ["a.agent.sui"],
      });
      const resolver = new DependencyResolver(mockResolver);
      const manifest = makeManifest("root", ["a.agent.sui"]);

      await expect(resolver.resolve(manifest)).rejects.toThrow(
        /Circular dependency detected:.*→/,
      );
    });

    it("throws with formatted cycle path using arrow separator", async () => {
      const mockResolver = createMockResolver({
        "a.agent.sui": ["b.agent.sui"],
        "b.agent.sui": ["a.agent.sui"],
      });
      const resolver = new DependencyResolver(mockResolver);
      const manifest = makeManifest("root", ["a.agent.sui"]);

      await expect(resolver.resolve(manifest)).rejects.toThrow(
        "Circular dependency detected: a.agent.sui → b.agent.sui → a.agent.sui",
      );
    });

    it("throws on resolution failure", async () => {
      const mockResolver: SkillResolver = {
        resolveSkill: async () => {
          throw new Error("Skill not found");
        },
        downloadManifest: async () => makeManifest("x"),
      };
      const resolver = new DependencyResolver(mockResolver);
      const manifest = makeManifest("root", ["missing.agent.sui"]);

      await expect(resolver.resolve(manifest)).rejects.toThrow(
        "Failed to resolve dependency: missing.agent.sui",
      );
    });

    it("handles diamond dependencies without duplication", async () => {
      // A depends on B and C, both depend on D
      const mockResolver = createMockResolver({
        "b.agent.sui": ["d.agent.sui"],
        "c.agent.sui": ["d.agent.sui"],
        "d.agent.sui": [],
      });
      const resolver = new DependencyResolver(mockResolver);
      const manifest = makeManifest("root", ["b.agent.sui", "c.agent.sui"]);

      const result = await resolver.resolve(manifest);
      const names = result.map((r) => r.name);
      // D should appear exactly once
      expect(names.filter((n) => n === "d.agent.sui")).toHaveLength(1);
    });
  });
});
