import { describe, expect, it } from "vitest";
import * as fc from "fast-check";

import { DependencyResolver } from "./dependency-resolver.js";

/**
 * Helper: create a DependencyResolver with a dummy resolver (only needed for detect/sort).
 */
function makeResolver(): DependencyResolver {
  return new DependencyResolver({
    resolveSkill: async () => {
      throw new Error("not used in graph tests");
    },
    downloadManifest: async () => {
      throw new Error("not used in graph tests");
    },
  });
}

/**
 * Arbitrary generator for a random DAG (directed acyclic graph).
 * Strategy: generate N nodes with indices 0..N-1. Only allow edges from
 * lower-index to higher-index nodes (this guarantees acyclicity since
 * a path can never go backwards to form a cycle).
 */
const arbDAG: fc.Arbitrary<Map<string, string[]>> = fc
  .integer({ min: 1, max: 15 })
  .chain((n) => {
    // Generate possible edges: from i to j where i < j
    const possibleEdges: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        possibleEdges.push([i, j]);
      }
    }
    return fc
      .subarray(possibleEdges, {
        minLength: 0,
        maxLength: possibleEdges.length,
      })
      .map((edges) => {
        const adj = new Map<string, string[]>();
        for (let i = 0; i < n; i++) {
          adj.set(`node${i}`, []);
        }
        for (const [from, to] of edges) {
          adj.get(`node${from}`)!.push(`node${to}`);
        }
        return adj;
      });
  });

/**
 * Arbitrary generator for a graph that is guaranteed to have at least one cycle.
 * Strategy: generate a cycle of length k (2..n) among a subset of nodes
 * (node0 → node1 → ... → node(k-1) → node0). This guarantees the cycle exists
 * regardless of any additional edges.
 */
const arbGraphWithCycle: fc.Arbitrary<Map<string, string[]>> = fc
  .integer({ min: 2, max: 8 })
  .chain((n) => {
    return fc.integer({ min: 2, max: n }).chain((cycleLen) => {
      // Optionally generate extra forward edges
      const possibleEdges: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          possibleEdges.push([i, j]);
        }
      }
      return fc
        .subarray(possibleEdges, {
          minLength: 0,
          maxLength: possibleEdges.length,
        })
        .map((extraEdges) => {
          const adj = new Map<string, string[]>();
          for (let i = 0; i < n; i++) {
            adj.set(`node${i}`, []);
          }
          // Create a guaranteed cycle: node0 → node1 → ... → node(cycleLen-1) → node0
          for (let i = 0; i < cycleLen; i++) {
            const next = (i + 1) % cycleLen;
            adj.get(`node${i}`)!.push(`node${next}`);
          }
          // Add extra forward edges (won't break the cycle)
          for (const [from, to] of extraEdges) {
            const existing = adj.get(`node${from}`)!;
            if (!existing.includes(`node${to}`)) {
              existing.push(`node${to}`);
            }
          }
          return adj;
        });
    });
  });

describe("Feature: walrus-skill-lifecycle, Property 6: topological sort", () => {
  /**
   * **Validates: Requirements 7.2, 8.2, 8.4**
   *
   * For any DAG, sorted output has all edges going from earlier to later in the output.
   */
  it("all edges in a DAG go from earlier to later in the topological sort output", () => {
    const resolver = makeResolver();

    fc.assert(
      fc.property(arbDAG, (adj) => {
        const sorted = resolver.topologicalSort(adj);

        // Build position map
        const position = new Map<string, number>();
        sorted.forEach((node, idx) => position.set(node, idx));

        // Verify all edges respect topological order
        // Note: in the DependencyResolver, edges A → B mean "A depends on B",
        // so B should come BEFORE A in the output (B has earlier position).
        for (const [node, deps] of adj.entries()) {
          for (const dep of deps) {
            const nodePos = position.get(node);
            const depPos = position.get(dep);
            // Both must be present in the output
            expect(nodePos).toBeDefined();
            expect(depPos).toBeDefined();
            // Dependency should appear before the dependent
            expect(depPos!).toBeLessThan(nodePos!);
          }
        }
      }),
    );
  });

  it("sorted output contains all nodes from the DAG", () => {
    const resolver = makeResolver();

    fc.assert(
      fc.property(arbDAG, (adj) => {
        const sorted = resolver.topologicalSort(adj);

        // Collect all nodes (including those only referenced as dependencies)
        const allNodes = new Set<string>();
        for (const [node, deps] of adj.entries()) {
          allNodes.add(node);
          for (const dep of deps) {
            allNodes.add(dep);
          }
        }

        expect(sorted.length).toBe(allNodes.size);
        for (const node of allNodes) {
          expect(sorted).toContain(node);
        }
      }),
    );
  });
});

describe("Feature: walrus-skill-lifecycle, Property 7: cycle detection", () => {
  /**
   * **Validates: Requirements 8.3**
   *
   * For any graph with a cycle, detectCycle returns non-null.
   * For any DAG, detectCycle returns null.
   */
  it("detects cycles in graphs that contain cycles", () => {
    const resolver = makeResolver();

    fc.assert(
      fc.property(arbGraphWithCycle, (adj) => {
        const cycle = resolver.detectCycle(adj);
        expect(cycle).not.toBeNull();
        // The cycle should have length >= 2 (at least one node + closing node)
        expect(cycle!.length).toBeGreaterThanOrEqual(2);
        // First and last element should be the same (cycle closes)
        expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
      }),
    );
  });

  it("returns null for directed acyclic graphs", () => {
    const resolver = makeResolver();

    fc.assert(
      fc.property(arbDAG, (adj) => {
        const cycle = resolver.detectCycle(adj);
        expect(cycle).toBeNull();
      }),
    );
  });
});
