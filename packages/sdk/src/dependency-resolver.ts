import type { SkillDescriptor, SkillManifest } from "./types.js";

/**
 * A resolved dependency with its on-chain descriptor and downloaded manifest.
 */
export interface ResolvedDependency {
  /** SuiNS subname of the dependency skill. */
  name: string;
  /** On-chain SkillDescriptor fetched via SuiNS resolution. */
  descriptor: SkillDescriptor;
  /** Downloaded and verified manifest from Walrus. */
  manifest: SkillManifest;
}

/**
 * Interface for resolving skills by SuiNS name and downloading their manifests.
 * Allows constructor injection for testability and decoupling from AgentOSClient.
 */
export interface SkillResolver {
  resolveSkill(suinsName: string): Promise<SkillDescriptor>;
  downloadManifest(
    blobId: string,
    expectedHash: string,
  ): Promise<SkillManifest>;
}

/** DFS node coloring for cycle detection. */
const enum Color {
  White = 0, // unvisited
  Gray = 1, // in current DFS stack
  Black = 2, // fully processed
}

/**
 * Resolves skill dependencies recursively from SuiNS names, detects cycles,
 * and returns dependencies in topological order (dependencies before dependents).
 */
export class DependencyResolver {
  constructor(private resolver: SkillResolver) {}

  /**
   * Detect a cycle in a directed graph represented as an adjacency list.
   * Uses DFS with three-color marking (white/gray/black).
   *
   * @returns The cycle path as an array of node names (e.g. ["A", "B", "C", "A"]) or null if no cycle exists.
   */
  detectCycle(adjacencyList: Map<string, string[]>): string[] | null {
    const color = new Map<string, Color>();
    const parent = new Map<string, string | null>();

    // Initialize all nodes as white (unvisited)
    for (const node of adjacencyList.keys()) {
      color.set(node, Color.White);
    }

    for (const node of adjacencyList.keys()) {
      if (color.get(node) === Color.White) {
        const cycle = this.dfsVisit(node, adjacencyList, color, parent, []);
        if (cycle) {
          return cycle;
        }
      }
    }

    return null;
  }

  private dfsVisit(
    node: string,
    adjacencyList: Map<string, string[]>,
    color: Map<string, Color>,
    _parent: Map<string, string | null>,
    stack: string[],
  ): string[] | null {
    color.set(node, Color.Gray);
    stack.push(node);

    const neighbors = adjacencyList.get(node) ?? [];
    for (const neighbor of neighbors) {
      const neighborColor = color.get(neighbor);

      if (neighborColor === Color.Gray) {
        // Found a cycle — extract the cycle path from the stack
        const cycleStart = stack.indexOf(neighbor);
        const cyclePath = stack.slice(cycleStart);
        cyclePath.push(neighbor); // close the cycle
        return cyclePath;
      }

      if (neighborColor === Color.White) {
        const cycle = this.dfsVisit(
          neighbor,
          adjacencyList,
          color,
          _parent,
          stack,
        );
        if (cycle) {
          return cycle;
        }
      }
    }

    stack.pop();
    color.set(node, Color.Black);
    return null;
  }

  /**
   * Topological sort of a directed acyclic graph using Kahn's algorithm.
   * The adjacency list encodes edges as "node → [dependencies]" (i.e., A → B
   * means A depends on B). The returned order places dependencies before
   * dependents so that execution can proceed bottom-up.
   *
   * @throws if the graph contains a cycle (callers should use detectCycle first).
   */
  topologicalSort(adjacencyList: Map<string, string[]>): string[] {
    // Build a reversed graph: dependency → dependents (for Kahn's processing)
    const reversedAdj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Collect all nodes
    for (const node of adjacencyList.keys()) {
      if (!reversedAdj.has(node)) {
        reversedAdj.set(node, []);
      }
      if (!inDegree.has(node)) {
        inDegree.set(node, 0);
      }
      const deps = adjacencyList.get(node) ?? [];
      for (const dep of deps) {
        if (!reversedAdj.has(dep)) {
          reversedAdj.set(dep, []);
        }
        if (!inDegree.has(dep)) {
          inDegree.set(dep, 0);
        }
      }
    }

    // In the original graph, edge A→B means A depends on B.
    // In-degree for "dependencies first": count how many things each node
    // depends on (out-degree in reversed = in-degree in original direction).
    // Actually, we reverse the edges: for edge A→B (A depends on B),
    // reversed has B→A. Then Kahn's on the reversed graph processes
    // nodes with no incoming edges first — those are leaf dependencies.
    for (const [node, deps] of adjacencyList.entries()) {
      for (const dep of deps) {
        reversedAdj.get(dep)!.push(node);
        inDegree.set(node, (inDegree.get(node) ?? 0) + 1);
      }
    }

    // Start with nodes that have no dependencies (in-degree 0 in original)
    const queue: string[] = [];
    for (const [node, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(node);
      }
    }

    // Sort the initial queue for deterministic output
    queue.sort();

    const result: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);

      const dependents = reversedAdj.get(node) ?? [];
      const newZero: string[] = [];
      for (const dependent of dependents) {
        const newDegree = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          newZero.push(dependent);
        }
      }
      // Sort newly-available nodes for deterministic output
      newZero.sort();
      queue.push(...newZero);
    }

    return result;
  }

  /**
   * Recursively resolve all dependencies of a manifest in topological order.
   *
   * Steps:
   * 1. Walk the manifest's `dependencies` array (SuiNS subnames)
   * 2. For each dependency, resolve the SuiNS name → SkillDescriptor
   * 3. Download the manifest from Walrus using descriptor's blobId + hash
   * 4. Recursively resolve that manifest's dependencies
   * 5. Build an adjacency list of the full dependency graph
   * 6. Check for cycles — throw with cycle path if found
   * 7. Topologically sort
   * 8. Return ResolvedDependency[] in topological order (deps before dependents)
   *
   * @throws "Circular dependency detected: A → B → C → A" if a cycle is found
   * @throws "Failed to resolve dependency: {name}" if resolution fails
   */
  async resolve(manifest: SkillManifest): Promise<ResolvedDependency[]> {
    if (!manifest.dependencies || manifest.dependencies.length === 0) {
      return [];
    }

    // Maps to store resolved data
    const descriptors = new Map<string, SkillDescriptor>();
    const manifests = new Map<string, SkillManifest>();
    const adjacencyList = new Map<string, string[]>();

    // Recursively resolve all dependencies starting from the root manifest
    await this.resolveRecursive(
      manifest.dependencies,
      descriptors,
      manifests,
      adjacencyList,
    );

    // Check for cycles
    const cycle = this.detectCycle(adjacencyList);
    if (cycle) {
      const cyclePath = cycle.join(" → ");
      throw new Error(`Circular dependency detected: ${cyclePath}`);
    }

    // Topological sort to determine resolution order
    const sorted = this.topologicalSort(adjacencyList);

    // Build result in topological order, filtering to only include
    // actual dependencies (not nodes that might not be in our resolved set)
    const result: ResolvedDependency[] = [];
    for (const name of sorted) {
      const descriptor = descriptors.get(name);
      const depManifest = manifests.get(name);
      if (descriptor && depManifest) {
        result.push({ name, descriptor, manifest: depManifest });
      }
    }

    return result;
  }

  private async resolveRecursive(
    dependencies: string[],
    descriptors: Map<string, SkillDescriptor>,
    manifests: Map<string, SkillManifest>,
    adjacencyList: Map<string, string[]>,
  ): Promise<void> {
    for (const depName of dependencies) {
      // Skip if already resolved (avoid redundant work in diamond graphs)
      if (descriptors.has(depName)) {
        continue;
      }

      // Resolve SuiNS name → SkillDescriptor
      let descriptor: SkillDescriptor;
      try {
        descriptor = await this.resolver.resolveSkill(depName);
      } catch {
        throw new Error(`Failed to resolve dependency: ${depName}`);
      }
      descriptors.set(depName, descriptor);

      // Download manifest from Walrus
      let depManifest: SkillManifest;
      try {
        depManifest = await this.resolver.downloadManifest(
          descriptor.walrusManifestBlob,
          descriptor.manifestHash,
        );
      } catch {
        throw new Error(`Failed to resolve dependency: ${depName}`);
      }
      manifests.set(depName, depManifest);

      // Build adjacency list: depName → its own dependencies
      const childDeps = depManifest.dependencies ?? [];
      adjacencyList.set(depName, childDeps);

      // Recursively resolve child dependencies
      if (childDeps.length > 0) {
        await this.resolveRecursive(
          childDeps,
          descriptors,
          manifests,
          adjacencyList,
        );
      }
    }
  }
}
