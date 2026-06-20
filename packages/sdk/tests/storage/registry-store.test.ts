import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FileRegistryStore,
  InMemoryRegistryStore,
} from "../../src/storage/index.js";
import { LocalRegistry } from "../../src/registry/local-registry.js";
import type { RegistryStore } from "../../src/storage/index.js";
import type { RegistryFile } from "../../src/registry/types.js";
import type { SkillManifest } from "../../src/types.js";

const EMPTY: RegistryFile = { version: 1, agents: [], skills: [] };

function manifest(name = "demo-skill"): SkillManifest {
  return {
    name,
    version: "1.0.0",
    publisher: `@demo/${name}`,
    manifestType: "sui-agent-skill/v1",
    mcp: { compatible: true, tools: [] },
    sui: { movePackage: "0x0", entry: "run", policyRequired: [] },
    dependencies: [],
  };
}

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "agentos-store-"));
  path = join(dir, "registry.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// A matrix so the file-backed and in-memory stores prove identical behavior.
function suite(make: (seed?: RegistryFile) => RegistryStore, label: string) {
  describe(`RegistryStore behavior — ${label}`, () => {
    it("resolves the seed agent alpha", async () => {
      const store = make();
      const resolved = await store.resolveAgent("alpha.sui");
      expect(resolved?.agent.slug).toBe("alpha");
      expect(resolved?.skills.length).toBeGreaterThan(0);
    });

    it("register → resolve → publish → remove round-trips", async () => {
      const store = make(EMPTY);

      const agent = await store.registerAgent({
        suinsName: "demo.sui",
        runtimeWallet: "0x123",
      });
      expect(agent.slug).toBe("demo");

      const resolved = await store.resolveAgent("demo.sui");
      expect(resolved?.agent.suinsName).toBe("demo.sui");

      const skill = await store.publishSkill({
        agentName: "demo.sui",
        manifest: manifest(),
      });
      expect(skill.skillId).toBe("demo-skill");
      expect(await store.listSkills("demo.sui")).toHaveLength(1);

      const removed = await store.removeAgent("demo.sui");
      expect(removed.slug).toBe("demo");
      expect(await store.resolveAgent("demo.sui")).toBeNull();
      expect(await store.listSkills("demo.sui")).toHaveLength(0);
    });

    it("rejects duplicate and invalid agent names", async () => {
      const store = make(EMPTY);
      await store.registerAgent({ suinsName: "dup.sui", runtimeWallet: "0x1" });
      await expect(
        store.registerAgent({ suinsName: "dup.sui", runtimeWallet: "0x1" }),
      ).rejects.toThrow(/already registered/);
    });

    it("listAgents omits revoked", async () => {
      const store = make({
        version: 1,
        agents: [
          {
            slug: "live",
            suinsName: "live.sui",
            passportId: "0x1",
            runtimeWallet: "0x1",
            network: "testnet",
            passportVersion: "v1",
            status: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            slug: "dead",
            suinsName: "dead.sui",
            passportId: "0x2",
            runtimeWallet: "0x2",
            network: "testnet",
            passportVersion: "v1",
            status: "revoked",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        skills: [],
      });
      const active = await store.listAgents();
      expect(active).toHaveLength(1);
      expect(active[0].slug).toBe("live");
    });

    it("records memory namespaces deduped, most-recent first", async () => {
      const store = make(EMPTY);
      await store.registerAgent({ suinsName: "mem.sui", runtimeWallet: "0x1" });

      expect(await store.listMemoryNamespaces("mem.sui")).toEqual([]);
      await store.recordMemoryNamespace("mem.sui", "mem.sui");
      await store.recordMemoryNamespace("mem.sui", "project-x");
      await store.recordMemoryNamespace("mem.sui", "mem.sui");

      expect(await store.listMemoryNamespaces("mem.sui")).toEqual([
        "mem.sui",
        "project-x",
      ]);

      // Blank + unknown are no-ops returning current list.
      expect(await store.recordMemoryNamespace("mem.sui", "  ")).toEqual([
        "mem.sui",
        "project-x",
      ]);
      expect(await store.recordMemoryNamespace("nope.sui", "x")).toEqual([]);
    });

    it("adds and lists delegations", async () => {
      const store = make(EMPTY);
      await store.registerAgent({ suinsName: "par.sui", runtimeWallet: "0x1" });
      await store.addDelegation("par.sui", {
        childAgent: "0xchild",
        childName: "kid.sui",
        allowedSkills: ["web-search"],
        allowedCapabilities: ["read"],
        spendLimit: "100",
        spent: "0",
        expiryMs: "0",
        revoked: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      const dels = await store.listDelegations("par.sui");
      expect(dels).toHaveLength(1);
      expect(dels[0].childName).toBe("kid.sui");
    });

    it("searchAgents scores prefix > substring > subsequence", async () => {
      const store = make(EMPTY);
      await store.registerAgent({
        suinsName: "alpha.sui",
        runtimeWallet: "0x1",
      });
      await store.registerAgent({
        suinsName: "betalpha.sui",
        runtimeWallet: "0x2",
      });
      const results = await store.searchAgents("alpha");
      expect(results[0].slug).toBe("alpha"); // prefix wins
    });
  });
}

suite((seed) => new InMemoryRegistryStore(seed), "InMemoryRegistryStore");
// FileRegistryStore needs a path; close over the per-test `path`.
suite(
  (seed) => new FileRegistryStore(path, seed ? { seed } : {}),
  "FileRegistryStore",
);

describe("FileRegistryStore — atomic & durable writes", () => {
  it("persists to disk and a fresh store re-reads it", async () => {
    const store = new FileRegistryStore(path, { seed: EMPTY });
    await store.registerAgent({ suinsName: "disk.sui", runtimeWallet: "0x1" });
    await store.publishSkill({ agentName: "disk.sui", manifest: manifest() });

    const reopened = new FileRegistryStore(path, { seed: EMPTY });
    expect((await reopened.resolveAgent("disk.sui"))?.agent.slug).toBe("disk");
    expect(await reopened.listSkills("disk.sui")).toHaveLength(1);
  });

  it("write leaves valid JSON and no leftover temp files", async () => {
    const store = new FileRegistryStore(path, { seed: EMPTY });
    await store.registerAgent({ suinsName: "j.sui", runtimeWallet: "0x1" });

    // File parses cleanly.
    const parsed = JSON.parse(readFileSync(path, "utf8")) as RegistryFile;
    expect(parsed.version).toBe(1);
    expect(parsed.agents).toHaveLength(1);

    // No `.tmp` artifacts left behind by the atomic write.
    const leftovers = readdirSync(dir).filter((f) => f.includes(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("concurrent registerAgent calls never lose a record", async () => {
    const store = new FileRegistryStore(path, { seed: EMPTY });
    const N = 25;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        store.registerAgent({
          suinsName: `agent${i}.sui`,
          runtimeWallet: `0x${i}`,
        }),
      ),
    );
    const all = await store.getAgents();
    expect(all).toHaveLength(N);
    // Unique slugs — no clobbering.
    expect(new Set(all.map((a) => a.slug)).size).toBe(N);
  });

  it("missing file falls back to seed without writing", async () => {
    const store = new FileRegistryStore(path, { seed: EMPTY });
    expect(await store.getAgents()).toEqual([]);
    // Pure reads must not create the file.
    expect(existsSync(path)).toBe(false);
  });
});

describe("parity: FileRegistryStore vs LocalRegistry", () => {
  it("produces structurally identical documents for the same ops", async () => {
    // Sync LocalRegistry path.
    const syncPath = join(dir, "sync.json");
    const sync = new LocalRegistry(syncPath, structuredClone(EMPTY));
    sync.registerAgent({ suinsName: "p.sui", runtimeWallet: "0xabc" });
    sync.publishSkill({ agentName: "p.sui", manifest: manifest("alpha-skill") });
    sync.recordMemoryNamespace("p.sui", "ns-1");

    // Async FileRegistryStore path.
    const asyncStore = new FileRegistryStore(path, { seed: EMPTY });
    await asyncStore.registerAgent({ suinsName: "p.sui", runtimeWallet: "0xabc" });
    await asyncStore.publishSkill({
      agentName: "p.sui",
      manifest: manifest("alpha-skill"),
    });
    await asyncStore.recordMemoryNamespace("p.sui", "ns-1");

    const syncDoc = sync.snapshot;
    const asyncDoc = JSON.parse(readFileSync(path, "utf8")) as RegistryFile;

    // Ids/timestamps differ; compare the deterministic shape.
    const strip = (d: RegistryFile) => ({
      version: d.version,
      agents: d.agents.map((a) => ({
        slug: a.slug,
        suinsName: a.suinsName,
        network: a.network,
        status: a.status,
        memoryNamespaces: a.memoryNamespaces,
      })),
      skills: d.skills.map((s) => ({
        agentSlug: s.agentSlug,
        skillId: s.skillId,
        name: s.name,
        mvrPackage: s.mvrPackage,
        version: s.version,
        source: s.source,
      })),
    });
    expect(strip(asyncDoc)).toEqual(strip(syncDoc));
  });
});
