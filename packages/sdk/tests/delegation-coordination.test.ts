import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentOSClient } from "../src/client.js";
import * as contracts from "../src/contracts/index.js";
import {
  computeManifestHash,
  serializeManifest,
} from "../src/manifest.js";
import type { SkillManifest } from "../src/types.js";
import { Transaction } from "@mysten/sui/transactions";

// Mock global fetch for Walrus/Harbor blob downloads.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const CLOCK_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000006";
const PKG =
  "0x00000000000000000000000000000000000000000000000000000000000000aa";
const SKILL_OBJ =
  "0x0000000000000000000000000000000000000000000000000000000000000099";
const CAP_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000c0a";
const PASSPORT_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000d0e";

function validManifest(overrides?: Partial<SkillManifest>): SkillManifest {
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
      movePackage:
        "0x0000000000000000000000000000000000000000000000000000000000000002",
      entry: "mod::run",
      policyRequired: [],
    },
    dependencies: [],
    ...overrides,
  };
}

function createMockSuiClient(opts?: {
  resolveAddress?: string | null;
  objectFields?: Record<string, unknown> | null;
}) {
  return {
    resolveNameServiceAddress: vi
      .fn()
      .mockResolvedValue(opts?.resolveAddress ?? null),
    getObject: vi.fn().mockResolvedValue({
      data: opts?.objectFields
        ? { content: { fields: opts.objectFields } }
        : undefined,
    }),
  };
}

/** Extract `${module}::${function}` for every MoveCall in PTB order. */
function moveCallOrder(tx: Transaction): string[] {
  return tx
    .getData()
    .commands.filter((c) => "MoveCall" in c && c.MoveCall)
    .map((c) => {
      const mc = (c as { MoveCall: { module: string; function: string } })
        .MoveCall;
      return `${mc.module}::${mc.function}`;
    });
}

/**
 * Collect every object id referenced by the PTB inputs. Before a tx is built,
 * object inputs appear as `UnresolvedObject` (id only); after resolution they
 * become `Object`. Handle both shapes.
 */
function objectInputIds(tx: Transaction): (string | undefined)[] {
  return tx.getData().inputs.map((i) => {
    const rec = i as {
      $kind: string;
      UnresolvedObject?: { objectId?: string };
      Object?: Record<string, { objectId?: string }>;
    };
    if (rec.$kind === "UnresolvedObject") return rec.UnresolvedObject?.objectId;
    if (rec.$kind === "Object" && rec.Object) {
      return Object.values(rec.Object).find((v) => v?.objectId)?.objectId;
    }
    return undefined;
  });
}

describe("buildExecuteSkillTx — delegated path", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  async function setupClient(manifest: SkillManifest) {
    const serialized = serializeManifest(manifest);
    const hash = computeManifestHash(serialized);

    // Walrus download returns the serialized manifest bytes.
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        serialized.buffer.slice(
          serialized.byteOffset,
          serialized.byteOffset + serialized.byteLength,
        ),
    });

    const mockClient = createMockSuiClient({
      resolveAddress: SKILL_OBJ,
      objectFields: {
        skill_id: "trade",
        walrus_manifest_blob: "blob-exec",
        manifest_hash: hash,
        mvr_package_name: "@alpha/trade",
        version: "1.0.0",
        required_capabilities: [],
        dependencies: [],
        seal_policy_id: "",
      },
    });

    return new AgentOSClient({ client: mockClient as never, packageId: PKG });
  }

  it("injects assert_valid → entry → consume → record_subagent_execution IN ORDER", async () => {
    const client = await setupClient(validManifest());

    const { transaction } = await client.buildExecuteSkillTx({
      suinsName: "trade.alpha.sui",
      delegationCapId: CAP_ID,
      cost: 500n,
      subjectPassportId: PASSPORT_ID,
    });

    const order = moveCallOrder(transaction);
    expect(order).toEqual([
      "delegation::assert_valid",
      "mod::run",
      "delegation::consume",
      "delegation::record_subagent_execution",
    ]);
  });

  it("targets the configured package for the coordination calls", async () => {
    const client = await setupClient(validManifest());

    const { transaction } = await client.buildExecuteSkillTx({
      suinsName: "trade.alpha.sui",
      delegationCapId: CAP_ID,
      cost: 0,
      subjectPassportId: PASSPORT_ID,
    });

    const delegationCalls = transaction
      .getData()
      .commands.filter(
        (c) => "MoveCall" in c && c.MoveCall?.module === "delegation",
      )
      .map((c) => (c as { MoveCall: { package: string } }).MoveCall.package);

    expect(delegationCalls.length).toBe(3);
    for (const pkg of delegationCalls) {
      expect(pkg).toBe(PKG);
    }
  });

  it("references the 0x6 Clock in assert_valid and record_subagent_execution", async () => {
    const client = await setupClient(validManifest());

    const { transaction } = await client.buildExecuteSkillTx({
      suinsName: "trade.alpha.sui",
      delegationCapId: CAP_ID,
      subjectPassportId: PASSPORT_ID,
    });

    const objectIds = objectInputIds(transaction);
    expect(objectIds).toContain(CLOCK_ID);
    expect(objectIds).toContain(CAP_ID);
  });

  it("non-delegated path emits ONLY the skill entry call (no regression)", async () => {
    const client = await setupClient(validManifest());

    const { transaction } = await client.buildExecuteSkillTx({
      suinsName: "trade.alpha.sui",
    });

    expect(moveCallOrder(transaction)).toEqual(["mod::run"]);
  });

  it("OMITS the skill entry call for a placeholder movePackage but STILL runs the delegation accounting", async () => {
    // A manifest whose move target is a non-0x placeholder (e.g. a seeded skill
    // that documents an intended target but isn't directly move-callable).
    const client = await setupClient(
      validManifest({
        sui: {
          movePackage: "0xYOUR_NFT_PACKAGE",
          entry: "nft::mint",
          policyRequired: [],
        },
      }),
    );

    const { transaction } = await client.buildExecuteSkillTx({
      suinsName: "trade.alpha.sui",
      delegationCapId: CAP_ID,
      cost: 0,
      subjectPassportId: PASSPORT_ID,
    });

    // No `nft::mint` / `mod::run` skill entry call — only the 3 delegation calls,
    // in order. The Call still produces a real on-chain tx.
    expect(moveCallOrder(transaction)).toEqual([
      "delegation::assert_valid",
      "delegation::consume",
      "delegation::record_subagent_execution",
    ]);
  });

  it("throws (does not build an empty PTB) for a placeholder skill with NO delegation cap", async () => {
    const client = await setupClient(
      validManifest({
        sui: {
          movePackage: "0xYOUR_NFT_PACKAGE",
          entry: "nft::mint",
          policyRequired: [],
        },
      }),
    );

    await expect(
      client.buildExecuteSkillTx({ suinsName: "trade.alpha.sui" }),
    ).rejects.toThrow(/placeholder move target/);
  });

  it("OMITS the entry call when the skill targets the AgentOS package with a non-AgentOS module (seeded `main::execute`)", async () => {
    // The seeded `web-search` manifest points movePackage at the published
    // AgentOS package (`PKG`) with a DOCUMENTARY `main::execute` entry the
    // package does not expose. Calling it would abort on-chain — so the skill's
    // own entry is omitted and only the real delegation accounting runs.
    const client = await setupClient(
      validManifest({
        sui: {
          movePackage: PKG,
          entry: "main::execute",
          policyRequired: [],
        },
      }),
    );

    const { transaction } = await client.buildExecuteSkillTx({
      suinsName: "web-search.alpha.sui",
      delegationCapId: CAP_ID,
      cost: 0,
      subjectPassportId: PASSPORT_ID,
    });

    expect(moveCallOrder(transaction)).toEqual([
      "delegation::assert_valid",
      "delegation::consume",
      "delegation::record_subagent_execution",
    ]);
  });

  it("EMITS the entry call when the skill targets the AgentOS package with a REAL AgentOS module", async () => {
    // A real AgentOS module (e.g. `skill_descriptor`) IS callable on that
    // package — the entry stays in the PTB alongside the accounting calls.
    const client = await setupClient(
      validManifest({
        sui: {
          movePackage: PKG,
          entry: "skill_descriptor::touch",
          policyRequired: [],
        },
      }),
    );

    const { transaction } = await client.buildExecuteSkillTx({
      suinsName: "trade.alpha.sui",
      delegationCapId: CAP_ID,
      cost: 0,
      subjectPassportId: PASSPORT_ID,
    });

    expect(moveCallOrder(transaction)).toEqual([
      "delegation::assert_valid",
      "skill_descriptor::touch",
      "delegation::consume",
      "delegation::record_subagent_execution",
    ]);
  });

  it("throws for the seeded AgentOS-placeholder skill when called WITHOUT a delegation cap", async () => {
    // No cap + non-callable entry = empty PTB → fail loudly rather than submit.
    const client = await setupClient(
      validManifest({
        sui: { movePackage: PKG, entry: "main::execute", policyRequired: [] },
      }),
    );

    await expect(
      client.buildExecuteSkillTx({ suinsName: "web-search.alpha.sui" }),
    ).rejects.toThrow(/placeholder move target/);
  });

  it("binds an object-ref param via tx.object and a primitive via pure", async () => {
    const objArg =
      "0x0000000000000000000000000000000000000000000000000000000000000abc";
    const client = await setupClient(validManifest());

    const { transaction } = await client.buildExecuteSkillTx({
      suinsName: "trade.alpha.sui",
      params: { amount: 42, target: { object: objArg } },
    });

    const inputs = transaction.getData().inputs;
    const objectIds = objectInputIds(transaction);
    // The object-ref param must appear as a real object input, not a pure arg.
    expect(objectIds).toContain(objArg);
    // And there is a pure input for the numeric param.
    expect(inputs.some((i) => i.$kind === "Pure")).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Resilient Call: an UNRESOLVABLE skill must not abort a delegated Call.
  //
  // Saved/older canvas graphs sometimes pass the AGENT name (e.g. `alpha.sui`)
  // as the Call node's skill — `resolveSkill` then throws "Skill not found". The
  // on-chain value of the coordinate flow is the delegation accounting, so a
  // present DelegationCap means the Call should still build a real tx.
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * A client whose `resolveSkill(suinsName)` ALWAYS throws "Skill not found":
   * the SuiNS name does not resolve on-chain (resolveAddress=null) and there is
   * NO local registry, so the registry fallback also throws.
   */
  function clientWithUnresolvableSkill() {
    const mockClient = createMockSuiClient({ resolveAddress: null });
    // No registryPath ⇒ no LocalRegistry ⇒ resolveSkill's fallback throws.
    return new AgentOSClient({ client: mockClient as never, packageId: PKG });
  }

  it("builds a delegation-accounting tx (no skill move-call) for an UNRESOLVABLE skill WHEN a delegationCapId is present — does not throw", async () => {
    const client = clientWithUnresolvableSkill();

    const built = await client.buildExecuteSkillTx({
      suinsName: "alpha.sui", // an AGENT name, not a real skill
      delegationCapId: CAP_ID,
      cost: 250n,
      subjectPassportId: PASSPORT_ID,
    });

    // The skill never resolved → no descriptor/manifest, no skill move-call.
    expect(built.descriptor).toBeNull();
    expect(built.manifest).toBeNull();
    expect(built.manifestHash).toBe("");
    // Only the 3 delegation accounting calls, in order — a real on-chain tx.
    expect(moveCallOrder(built.transaction)).toEqual([
      "delegation::assert_valid",
      "delegation::consume",
      "delegation::record_subagent_execution",
    ]);
    // assert_valid still references the cap + Clock; record bumps the passport.
    const objectIds = objectInputIds(built.transaction);
    expect(objectIds).toContain(CAP_ID);
    expect(objectIds).toContain(CLOCK_ID);
    expect(objectIds).toContain(PASSPORT_ID);
  });

  it("RE-THROWS the original 'Skill not found' for an UNRESOLVABLE skill with NO delegationCapId (genuine misuse)", async () => {
    const client = clientWithUnresolvableSkill();

    await expect(
      client.buildExecuteSkillTx({ suinsName: "alpha.sui" }),
    ).rejects.toThrow(/Skill not found/);
  });

  it("leaves the RESOLVABLE skill path unchanged (descriptor + entry call present)", async () => {
    const client = await setupClient(validManifest());

    const built = await client.buildExecuteSkillTx({
      suinsName: "trade.alpha.sui",
      delegationCapId: CAP_ID,
      cost: 0,
      subjectPassportId: PASSPORT_ID,
    });

    // Descriptor + manifest resolved; the skill's own entry call is emitted
    // between the accounting calls — exactly the pre-fix behaviour.
    expect(built.descriptor).not.toBeNull();
    expect(built.manifest).not.toBeNull();
    expect(built.manifestHash).not.toBe("");
    expect(moveCallOrder(built.transaction)).toEqual([
      "delegation::assert_valid",
      "mod::run",
      "delegation::consume",
      "delegation::record_subagent_execution",
    ]);
  });
});

describe("delegateSubAgent — child resolution & skill scoping", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockSigner() {
    return {
      toSuiAddress: () =>
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      signTransaction: vi.fn().mockResolvedValue({ signature: "sig_mock" }),
    };
  }

  it("sets child_agent to the resolved runtime wallet (not the signer) and scopes allowed_skills", async () => {
    const childRuntime =
      "0x00000000000000000000000000000000000000000000000000000000000beef0";

    // The client resolves the child's passport (runtime wallet) and its skills
    // through public methods; spy on those rather than the chain plumbing.
    const mockClient = createMockSuiClient();
    const client = new AgentOSClient({
      client: mockClient as never,
      packageId: PKG,
    });

    vi.spyOn(client, "resolveAgent").mockResolvedValue({
      id: PASSPORT_ID,
      owner: "0xowner",
      suinsName: "beta.sui",
      runtimeWallet: childRuntime,
      policyRoot: "",
      skillRoot: "",
      memoryNamespace: "",
      activityLogPointer: "",
      status: "active",
    });
    vi.spyOn(client, "listSkills").mockResolvedValue([
      {
        skillId: "summarize",
        walrusManifestBlob: "b",
        manifestHash: "h",
        mvrPackageName: "@beta/summarize",
        version: "1.0.0",
        requiredCapabilities: [],
        dependencies: [],
      },
      {
        skillId: "translate",
        walrusManifestBlob: "b2",
        manifestHash: "h2",
        mvrPackageName: "@beta/translate",
        version: "1.0.0",
        requiredCapabilities: [],
        dependencies: [],
      },
    ]);

    // Capture the grant builder args by spying on the contracts builder.
    const grantSpy = vi.spyOn(contracts.delegation, "grant");

    // No packageId-on-registry path: there is no registry, so this falls back
    // to registry persistence (which is null) — but #resolveChild still runs and
    // the grant builder is only invoked on the on-chain branch. To exercise the
    // grant builder we need a parentPassportId, which comes from the registry.
    // Without a registry we assert the resolved values directly instead.
    const result = await client.delegateSubAgent({
      signer: createMockSigner() as never,
      parent: "alpha.sui",
      child: {
        name: "beta.sui",
        permissions: ["read"],
        budget: 1000n,
        expiry: 9999999999,
      },
    });

    // No registry → registry fallback, but child resolution must have run.
    expect(result.registryFallback).toBe(true);
    expect(client.resolveAgent).toHaveBeenCalledWith("beta.sui");
    expect(client.listSkills).toHaveBeenCalledWith("beta.sui");
    grantSpy.mockRestore();
  });

  it("invokes grant with the runtime wallet child and real skill ids when a parent passport exists", async () => {
    const childRuntime =
      "0x00000000000000000000000000000000000000000000000000000000000beef0";

    // A registry path in a fresh temp dir: the file doesn't exist yet, so the
    // SDK loads the default seed which already contains `alpha.sui` (with a
    // passportId). That gives #registry a parentPassportId so the on-chain
    // grant branch runs.
    const dir = mkdtempSync(join(tmpdir(), "agentos-deleg-"));
    const registryPath = join(dir, "registry.json");

    const mockClient = createMockSuiClient();
    const client = new AgentOSClient({
      client: mockClient as never,
      packageId: PKG,
      registryPath,
    });

    vi.spyOn(client, "resolveAgent").mockResolvedValue({
      id: PASSPORT_ID,
      owner: "0xowner",
      suinsName: "beta.sui",
      runtimeWallet: childRuntime,
      policyRoot: "",
      skillRoot: "",
      memoryNamespace: "",
      activityLogPointer: "",
      status: "active",
    });
    vi.spyOn(client, "listSkills").mockResolvedValue([
      {
        skillId: "summarize",
        walrusManifestBlob: "b",
        manifestHash: "h",
        mvrPackageName: "@beta/summarize",
        version: "1.0.0",
        requiredCapabilities: [],
        dependencies: [],
      },
    ]);

    const grantSpy = vi.spyOn(contracts.delegation, "grant");
    // Stub Transaction.build / signing so we don't hit the real Sui pipeline.
    const buildSpy = vi
      .spyOn(Transaction.prototype, "build")
      .mockResolvedValue(new Uint8Array([1, 2, 3]));
    (
      mockClient as unknown as { executeTransactionBlock: ReturnType<typeof vi.fn> }
    ).executeTransactionBlock = vi.fn().mockResolvedValue({
      digest: "d1",
      objectChanges: [
        {
          type: "created",
          objectId: CAP_ID,
          objectType: `${PKG}::delegation::DelegationCap`,
        },
      ],
    });

    try {
      const result = await client.delegateSubAgent({
        signer: createMockSigner() as never,
        parent: "alpha.sui",
        child: {
          name: "beta.sui",
          permissions: ["read"],
          budget: 1000n,
          expiry: 9999999999,
        },
      });

      expect(grantSpy).toHaveBeenCalledTimes(1);
      const grantArgs = grantSpy.mock.calls[0][0];
      expect(grantArgs.childAgent).toBe(childRuntime);
      expect(grantArgs.allowedSkills).toEqual(["summarize"]);
      expect(grantArgs.allowedCapabilities).toEqual(["read"]);
      expect(result.capId).toBe(CAP_ID);
      expect(result.registryFallback).toBe(false);
    } finally {
      grantSpy.mockRestore();
      buildSpy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("attestation builder", () => {
  it("calls attestation::attest with 0x6 clock and transfers to recipient", () => {
    const tx = new Transaction();
    tx.add(
      contracts.attestation.attest({
        subjectPassport: tx.object(PASSPORT_ID),
        kind: "review",
        score: 90,
        uri: "walrus://blob",
        recipient:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
        packageId: PKG,
      }),
    );

    const commands = tx.getData().commands;
    const attestCall = commands.find(
      (c) => "MoveCall" in c && c.MoveCall?.module === "attestation",
    );
    expect(attestCall).toBeDefined();
    expect(
      (attestCall as { MoveCall: { function: string; package: string } })
        .MoveCall.function,
    ).toBe("attest");
    expect(
      (attestCall as { MoveCall: { package: string } }).MoveCall.package,
    ).toBe(PKG);

    // The returned Attestation must be consumed by a TransferObjects command.
    expect(commands.some((c) => "TransferObjects" in c)).toBe(true);

    // The 0x6 Clock must be referenced as an object input.
    expect(objectInputIds(tx)).toContain(CLOCK_ID);
  });

  it("shares the Attestation when share:true (no recipient)", () => {
    const tx = new Transaction();
    tx.add(
      contracts.attestation.attest({
        subjectPassport: tx.object(PASSPORT_ID),
        kind: "audit",
        score: 100,
        uri: "",
        share: true,
        packageId: PKG,
      }),
    );

    const commands = tx.getData().commands;
    const shareCall = commands.find(
      (c) =>
        "MoveCall" in c &&
        c.MoveCall?.module === "transfer" &&
        c.MoveCall?.function === "public_share_object",
    );
    expect(shareCall).toBeDefined();
  });

  it("rejects a score out of range", () => {
    const tx = new Transaction();
    expect(() =>
      tx.add(
        contracts.attestation.attest({
          subjectPassport: tx.object(PASSPORT_ID),
          kind: "review",
          score: 101,
          uri: "",
          recipient: "0x1",
          packageId: PKG,
        }),
      ),
    ).toThrow(/score out of range/);
  });

  it("requires either a recipient or share", () => {
    const tx = new Transaction();
    expect(() =>
      tx.add(
        contracts.attestation.attest({
          subjectPassport: tx.object(PASSPORT_ID),
          kind: "review",
          score: 50,
          uri: "",
          packageId: PKG,
        }),
      ),
    ).toThrow(/recipient.*share/);
  });
});
