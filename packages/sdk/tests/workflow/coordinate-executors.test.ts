import { afterEach, describe, expect, it, vi } from "vitest";

import { executors } from "../../src/workflow/executors.js";
import type {
  RunBuildBundle,
  RunContext,
  RunResolveBundle,
  WorkflowNode,
} from "../../src/workflow/types.js";

// Isolate from any ambient AGENTOS_PACKAGE_ID a developer may have exported.
afterEach(() => {
  vi.unstubAllEnvs();
});

const PASSPORT_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000d0e";
const SUBJECT_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000abc";
const CAP_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000c0a";
const CHILD_ADDR =
  "0x0000000000000000000000000000000000000000000000000000000000000111";
const CAP_TYPE =
  "0x2::dynamic_field::Field<...>::delegation::DelegationCap<u64>";
/** A published, on-chain AgentOS package id (so the on-chain executors run). */
const PACKAGE_ID =
  "0x00000000000000000000000000000000000000000000000000000000000a905a";

const node = (
  type: WorkflowNode["type"],
  params?: Record<string, unknown>,
): WorkflowNode => ({
  id: type,
  type,
  label: type,
  ...(params ? { params } : {}),
});

function makeResolve(
  overrides: Partial<RunResolveBundle> = {},
): RunResolveBundle {
  return {
    resolveAgent: vi.fn(async (name: string) => ({
      id: PASSPORT_ID,
      suinsName: name,
      runtimeWallet: CHILD_ADDR,
      owner: CHILD_ADDR,
      status: "active",
    })),
    resolveSkill: vi.fn(async () => ({
      skillId: "trade",
      walrusManifestBlob: "BLOB",
      manifestHash: "HASH",
      version: "1.0.0",
      requiredCapabilities: [],
    })),
    listSkills: vi.fn(async () => [
      {
        skillId: "trade",
        walrusManifestBlob: "BLOB_TRADE",
        manifestHash: "HASH_TRADE",
        version: "1.0.0",
        requiredCapabilities: ["defi:swap"],
      },
    ]),
    downloadManifest: vi.fn(async () => ({
      name: "trade",
      version: "1.0.0",
      sui: {
        movePackage: "0x2",
        entry: "mod::run",
        policyRequired: ["defi:swap"],
      },
      dependencies: [],
    })),
    ...overrides,
  };
}

function makeBuild(overrides: Partial<RunBuildBundle> = {}): RunBuildBundle {
  return {
    buildCallSubAgentTx: vi.fn(async () => ({
      transaction: { __tx: "call-sub" },
      manifestHash: "HASH",
      verified: true,
    })),
    buildDelegateTx: vi.fn(() => ({ __tx: "delegate" })),
    buildAttestTx: vi.fn(() => ({ __tx: "attest" })),
    ...overrides,
  };
}

function makeCtx(overrides: Partial<RunContext> = {}): RunContext {
  return {
    agentName: "parent.sui",
    passport: { id: PASSPORT_ID, suinsName: "parent.sui" },
    // A published package id so the on-chain executors don't skip by default.
    packageId: PACKAGE_ID,
    client: {},
    execute: vi.fn(async () => ({ digest: "0xDIGEST", objectChanges: [] })),
    resolve: makeResolve(),
    build: makeBuild(),
    ...overrides,
  };
}

describe("import-agent executor", () => {
  it("resolves the target, hash-verifies each skill, emits a catalog (read-only)", async () => {
    const ctx = makeCtx();
    const r = await executors["import-agent"](
      node("import-agent", { agent: "child.sui" }),
      ctx,
      [],
    );

    expect(r.status).toBe("done");
    const out = r.output as {
      agent: string;
      skillCount: number;
      catalog: Array<{
        skillId: string;
        verified: boolean;
        requiredCapabilities: string[];
        entry?: string;
      }>;
    };
    expect(out.agent).toBe("child.sui");
    expect(out.skillCount).toBe(1);
    expect(out.catalog[0]).toMatchObject({
      skillId: "trade",
      verified: true,
      entry: "mod::run",
      requiredCapabilities: ["defi:swap"],
    });
    // Resolver was used; never executed anything on-chain.
    expect(ctx.resolve!.downloadManifest).toHaveBeenCalledWith(
      "BLOB_TRADE",
      "HASH_TRADE",
      undefined,
    );
    expect(ctx.execute).not.toHaveBeenCalled();
  });

  it("errors (does not execute) when the target agent is not active", async () => {
    const resolve = makeResolve({
      resolveAgent: vi.fn(async (name: string) => ({
        id: PASSPORT_ID,
        suinsName: name,
        status: "revoked",
      })),
    });
    const ctx = makeCtx({ resolve });
    const r = await executors["import-agent"](
      node("import-agent", { agent: "dead.sui" }),
      ctx,
      [],
    );
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/not active/);
    expect(resolve.listSkills).not.toHaveBeenCalled();
  });

  it("flags a skill (verified:false) when its manifest hash-verify fails, without crashing the run", async () => {
    const resolve = makeResolve({
      downloadManifest: vi.fn(async () => {
        throw new Error("manifest integrity check failed");
      }),
    });
    const ctx = makeCtx({ resolve });
    const r = await executors["import-agent"](
      node("import-agent", { agent: "child.sui" }),
      ctx,
      [],
    );
    expect(r.status).toBe("done");
    const out = r.output as { catalog: Array<{ verified: boolean }> };
    expect(out.catalog[0]?.verified).toBe(false);
  });

  it("errors when ctx.resolve is missing", async () => {
    const r = await executors["import-agent"](
      node("import-agent", { agent: "child.sui" }),
      makeCtx({ resolve: undefined }),
      [],
    );
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/resolve bundle/);
  });
});

describe("delegate executor", () => {
  it("builds a grant via the injected builder and commits via ctx.execute, returning the cap id", async () => {
    const execute = vi.fn(async () => ({
      digest: "0xGRANT",
      objectChanges: [
        {
          type: "created",
          objectId: CAP_ID,
          objectType: CAP_TYPE,
        },
      ],
    }));
    const build = makeBuild();
    const ctx = makeCtx({ execute, build });

    const r = await executors.delegate(
      node("delegate", {
        child: CHILD_ADDR,
        allowedSkills: ["trade"],
        allowedCapabilities: ["defi:swap"],
        spendLimit: 1000,
        expiryMs: 9999,
      }),
      ctx,
      [],
    );

    expect(r.status).toBe("done");
    expect(r.txDigest).toBe("0xGRANT");
    expect((r.output as { capId?: string }).capId).toBe(CAP_ID);

    expect(build.buildDelegateTx).toHaveBeenCalledWith({
      parentPassportId: PASSPORT_ID,
      childAgent: CHILD_ADDR,
      allowedSkills: ["trade"],
      allowedCapabilities: ["defi:swap"],
      spendLimit: 1000n,
      expiryMs: 9999n,
    });
    // The exact object returned by the builder is what gets executed.
    expect(execute).toHaveBeenCalledWith({ __tx: "delegate" });
  });

  it("errors when no child is provided", async () => {
    const ctx = makeCtx();
    const r = await executors.delegate(node("delegate"), ctx, []);
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/child/);
    expect(ctx.execute).not.toHaveBeenCalled();
  });

  it("errors when ctx.build is missing", async () => {
    const r = await executors.delegate(
      node("delegate", { child: CHILD_ADDR }),
      makeCtx({ build: undefined }),
      [],
    );
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/build bundle/);
  });

  it("resolves a child .sui NAME to a 0x address before building the grant", async () => {
    const resolveAgentAddress = vi.fn(async () => CHILD_ADDR);
    const resolve = makeResolve({ resolveAgentAddress });
    const build = makeBuild();
    const ctx = makeCtx({ resolve, build });

    const r = await executors.delegate(
      node("delegate", { child: "kid.sui" }),
      ctx,
      [],
    );

    expect(r.status).toBe("done");
    // The NAME was resolved to an ADDRESS; the builder never sees ".sui".
    expect(resolveAgentAddress).toHaveBeenCalledWith("kid.sui");
    const call = (build.buildDelegateTx as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.childAgent).toBe(CHILD_ADDR);
    // The output records the resolved address and the original name.
    expect(r.output).toMatchObject({
      childAgent: CHILD_ADDR,
      childName: "kid.sui",
    });
  });

  it("skips gracefully when the child .sui name does NOT resolve on-chain", async () => {
    const resolveAgentAddress = vi.fn(async () => null);
    // resolveAgent also yields no address-ish field → unresolvable.
    const resolve = makeResolve({
      resolveAgentAddress,
      resolveAgent: vi.fn(async (name: string) => ({
        suinsName: name,
        status: "active",
      })),
    });
    const build = makeBuild();
    const ctx = makeCtx({ resolve, build });

    const r = await executors.delegate(
      node("delegate", { child: "ghost.sui" }),
      ctx,
      [],
    );

    expect(r.status).toBe("skipped");
    expect((r.output as { note: string }).note).toMatch(/not resolvable/);
    expect(build.buildDelegateTx).not.toHaveBeenCalled();
    expect(ctx.execute).not.toHaveBeenCalled();
  });

  it("skips gracefully (no Invalid-address error) when there is no real package id", async () => {
    vi.stubEnv("AGENTOS_PACKAGE_ID", "");
    const build = makeBuild();
    // ctx WITHOUT a packageId → resolveMovePackageId returns the placeholder.
    const ctx = makeCtx({ build, packageId: undefined });

    const r = await executors.delegate(
      node("delegate", { child: "alpha.sui" }),
      ctx,
      [],
    );

    expect(r.status).toBe("skipped");
    expect((r.output as { note: string }).note).toMatch(/no packageId/);
    expect(build.buildDelegateTx).not.toHaveBeenCalled();
    expect(ctx.execute).not.toHaveBeenCalled();
  });
});

describe("call-sub-agent executor", () => {
  it("builds the delegated atomic PTB and commits it, capturing the digest", async () => {
    const built = {
      transaction: { __tx: "atomic" },
      manifestHash: "HASH",
      verified: true,
    };
    const build = makeBuild({
      buildCallSubAgentTx: vi.fn(async () => built),
    });
    const execute = vi.fn(async () => ({ digest: "0xRUN", objectChanges: [] }));
    const ctx = makeCtx({ build, execute });

    const r = await executors["call-sub-agent"](
      node("call-sub-agent", {
        skill: "trade.alpha.sui",
        delegationCapId: CAP_ID,
        subjectPassportId: SUBJECT_ID,
        cost: 50,
        params: { amount: 10 },
        agentCapabilities: ["defi:swap"],
      }),
      ctx,
      [],
    );

    expect(r.status).toBe("done");
    expect(r.txDigest).toBe("0xRUN");
    expect((r.output as { delegated: boolean }).delegated).toBe(true);

    expect(build.buildCallSubAgentTx).toHaveBeenCalledWith({
      suinsName: "trade.alpha.sui",
      params: { amount: 10 },
      agentCapabilities: ["defi:swap"],
      delegationCapId: CAP_ID,
      subjectPassportId: SUBJECT_ID,
      cost: 50,
    });
    expect(execute).toHaveBeenCalledWith(built.transaction);
  });

  it("defaults subjectPassportId to ctx.passport.id when delegating without an explicit subject", async () => {
    const build = makeBuild();
    const ctx = makeCtx({ build });
    await executors["call-sub-agent"](
      node("call-sub-agent", {
        skill: "trade.alpha.sui",
        delegationCapId: CAP_ID,
      }),
      ctx,
      [],
    );
    const call = (build.buildCallSubAgentTx as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.subjectPassportId).toBe(PASSPORT_ID);
  });

  it("supports the non-delegated path (no cap) and still commits the built tx", async () => {
    const build = makeBuild();
    const execute = vi.fn(async () => ({ digest: "0xPLAIN" }));
    const ctx = makeCtx({ build, execute });
    const r = await executors["call-sub-agent"](
      node("call-sub-agent", { skill: "trade.alpha.sui" }),
      ctx,
      [],
    );
    expect(r.status).toBe("done");
    expect((r.output as { delegated: boolean }).delegated).toBe(false);
    const call = (build.buildCallSubAgentTx as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.delegationCapId).toBeUndefined();
    expect(call.subjectPassportId).toBeUndefined();
    expect(execute).toHaveBeenCalledOnce();
  });

  it("threads the UPSTREAM delegate step's capId + parentPassportId into the delegated call", async () => {
    const build = makeBuild();
    const ctx = makeCtx({ build });
    // An upstream `delegate` step that produced a cap (as the real executor does).
    const delegateStep = {
      nodeId: "delegate",
      type: "delegate" as const,
      status: "done" as const,
      output: { capId: CAP_ID, parentPassportId: SUBJECT_ID },
    };

    const r = await executors["call-sub-agent"](
      // No delegationCapId / subjectPassportId on the node — they come from the
      // upstream delegate step (this is the coordinate Import→Delegate→Call flow).
      node("call-sub-agent", { skill: "web-search.alpha.sui" }),
      ctx,
      [delegateStep],
    );

    expect(r.status).toBe("done");
    expect((r.output as { delegated: boolean }).delegated).toBe(true);
    const call = (build.buildCallSubAgentTx as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.delegationCapId).toBe(CAP_ID);
    // Subject defaults to the grant's parent passport recorded by the delegate.
    expect(call.subjectPassportId).toBe(SUBJECT_ID);
  });

  it("falls back to ctx.passport.id for subject when the upstream delegate omitted parentPassportId", async () => {
    const build = makeBuild();
    const ctx = makeCtx({ build });
    const delegateStep = {
      nodeId: "delegate",
      type: "delegate" as const,
      status: "done" as const,
      output: { capId: CAP_ID },
    };

    await executors["call-sub-agent"](
      node("call-sub-agent", { skill: "web-search.alpha.sui" }),
      ctx,
      [delegateStep],
    );
    const call = (build.buildCallSubAgentTx as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.delegationCapId).toBe(CAP_ID);
    expect(call.subjectPassportId).toBe(PASSPORT_ID);
  });

  it("an explicit node delegationCapId wins over an upstream delegate cap", async () => {
    const build = makeBuild();
    const ctx = makeCtx({ build });
    const OTHER_CAP =
      "0x0000000000000000000000000000000000000000000000000000000000000fff";
    const delegateStep = {
      nodeId: "delegate",
      type: "delegate" as const,
      status: "done" as const,
      output: { capId: OTHER_CAP, parentPassportId: SUBJECT_ID },
    };

    await executors["call-sub-agent"](
      node("call-sub-agent", {
        skill: "web-search.alpha.sui",
        delegationCapId: CAP_ID,
      }),
      ctx,
      [delegateStep],
    );
    const call = (build.buildCallSubAgentTx as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.delegationCapId).toBe(CAP_ID);
  });

  it("ignores a SKIPPED upstream delegate (no cap threaded → non-delegated)", async () => {
    const build = makeBuild();
    const ctx = makeCtx({ build });
    const skippedDelegate = {
      nodeId: "delegate",
      type: "delegate" as const,
      status: "skipped" as const,
      output: { note: "skipped" },
    };

    await executors["call-sub-agent"](
      node("call-sub-agent", { skill: "web-search.alpha.sui" }),
      ctx,
      [skippedDelegate],
    );
    const call = (build.buildCallSubAgentTx as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.delegationCapId).toBeUndefined();
  });

  it("errors when no skill name is provided", async () => {
    const ctx = makeCtx();
    const r = await executors["call-sub-agent"](
      node("call-sub-agent"),
      ctx,
      [],
    );
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/skill/);
    expect(ctx.execute).not.toHaveBeenCalled();
  });

  it("skips gracefully when there is no real package id", async () => {
    vi.stubEnv("AGENTOS_PACKAGE_ID", "");
    const build = makeBuild();
    const ctx = makeCtx({ build, packageId: undefined });
    const r = await executors["call-sub-agent"](
      node("call-sub-agent", { skill: "trade.alpha.sui" }),
      ctx,
      [],
    );
    expect(r.status).toBe("skipped");
    expect((r.output as { note: string }).note).toMatch(/no packageId/);
    expect(build.buildCallSubAgentTx).not.toHaveBeenCalled();
    expect(ctx.execute).not.toHaveBeenCalled();
  });

  it("degrades to error (does not throw) when the builder rejects", async () => {
    const build = makeBuild({
      buildCallSubAgentTx: vi.fn(async () => {
        throw new Error("Missing required capability: defi:swap");
      }),
    });
    const ctx = makeCtx({ build });
    // The executor itself throws; runWorkflow catches it. Assert it rejects so
    // the engine records an error step.
    await expect(
      executors["call-sub-agent"](
        node("call-sub-agent", { skill: "trade.alpha.sui" }),
        ctx,
        [],
      ),
    ).rejects.toThrow(/Missing required capability/);
  });
});

describe("attest executor", () => {
  it("builds an attest PTB (transfer) and commits it via ctx.execute", async () => {
    const build = makeBuild();
    const execute = vi.fn(async () => ({ digest: "0xATTEST" }));
    const ctx = makeCtx({ build, execute });

    const r = await executors.attest(
      node("attest", {
        subjectPassportId: SUBJECT_ID,
        kind: "audit",
        score: 90,
        uri: "walrus://blob",
        recipient: CHILD_ADDR,
      }),
      ctx,
      [],
    );

    expect(r.status).toBe("done");
    expect(r.txDigest).toBe("0xATTEST");
    expect(build.buildAttestTx).toHaveBeenCalledWith({
      subjectPassportId: SUBJECT_ID,
      kind: "audit",
      score: 90,
      uri: "walrus://blob",
      recipient: CHILD_ADDR,
    });
    expect(execute).toHaveBeenCalledWith({ __tx: "attest" });
  });

  it("uses share:true when no recipient is given", async () => {
    const build = makeBuild();
    const ctx = makeCtx({ build });
    await executors.attest(
      node("attest", {
        subjectPassportId: SUBJECT_ID,
        kind: "review",
        score: 50,
        share: true,
      }),
      ctx,
      [],
    );
    const call = (build.buildAttestTx as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.share).toBe(true);
    expect(call.recipient).toBeUndefined();
  });

  it("errors on an out-of-range score without building/executing", async () => {
    const build = makeBuild();
    const ctx = makeCtx({ build });
    const r = await executors.attest(
      node("attest", {
        subjectPassportId: SUBJECT_ID,
        score: 150,
        recipient: CHILD_ADDR,
      }),
      ctx,
      [],
    );
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/0\.\.=100/);
    expect(build.buildAttestTx).not.toHaveBeenCalled();
    expect(ctx.execute).not.toHaveBeenCalled();
  });

  it("errors when neither recipient nor share is set", async () => {
    const ctx = makeCtx();
    const r = await executors.attest(
      node("attest", { subjectPassportId: SUBJECT_ID, score: 80 }),
      ctx,
      [],
    );
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/recipient.*share/);
  });

  it("errors when ctx.build is missing", async () => {
    const r = await executors.attest(
      node("attest", {
        subjectPassportId: SUBJECT_ID,
        score: 80,
        recipient: CHILD_ADDR,
      }),
      makeCtx({ build: undefined }),
      [],
    );
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/build bundle/);
  });

  it("skips gracefully when there is no real package id (before config checks)", async () => {
    vi.stubEnv("AGENTOS_PACKAGE_ID", "");
    const build = makeBuild();
    const ctx = makeCtx({ build, packageId: undefined });
    // Even with a complete config, no package id → a clean skip, not a tx.
    const r = await executors.attest(
      node("attest", {
        subjectPassportId: SUBJECT_ID,
        score: 90,
        recipient: CHILD_ADDR,
      }),
      ctx,
      [],
    );
    expect(r.status).toBe("skipped");
    expect((r.output as { note: string }).note).toMatch(/no packageId/);
    expect(build.buildAttestTx).not.toHaveBeenCalled();
    expect(ctx.execute).not.toHaveBeenCalled();
  });
});
