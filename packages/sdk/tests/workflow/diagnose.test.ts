import { describe, expect, it } from "vitest";

import {
  classifyError,
  diagnoseStep,
  preflight,
  ONCHAIN_NODE_TYPES,
  type PreflightEnv,
} from "../../src/workflow/diagnose.js";
import type { StepResult, WorkflowGraph } from "../../src/workflow/types.js";

describe("classifyError", () => {
  it("classifies the motivating SUI_PRIVATE_KEY error as ENV_MISSING", () => {
    const c = classifyError(
      "SUI_PRIVATE_KEY is not set — required to sign sponsored transactions server-side.",
    );
    expect(c.code).toBe("ENV_MISSING");
    expect(c.hint).toMatch(/SUI_PRIVATE_KEY/);
  });

  it("classifies ENOKI_SECRET_KEY as ENV_MISSING", () => {
    expect(classifyError("ENOKI_SECRET_KEY is not set — …").code).toBe(
      "ENV_MISSING",
    );
  });

  it("classifies a manifest hash mismatch as MANIFEST_INTEGRITY", () => {
    expect(
      classifyError("Manifest integrity check failed: expected abc, got def")
        .code,
    ).toBe("MANIFEST_INTEGRITY");
  });

  it("classifies a missing capability", () => {
    expect(classifyError("Missing required capability: defi.swap").code).toBe(
      "MISSING_CAPABILITY",
    );
  });

  it("classifies a Walrus upload failure", () => {
    expect(classifyError("Walrus upload failed: 451 <body>").code).toBe(
      "WALRUS_UPLOAD",
    );
  });

  it("classifies a resolve failure", () => {
    expect(classifyError("Agent not found: alice.sui").code).toBe(
      "RESOLVE_FAILED",
    );
    expect(classifyError("Skill not found: alice.sui").code).toBe(
      "RESOLVE_FAILED",
    );
  });

  it("classifies a passport-not-on-chain error", () => {
    expect(
      classifyError(
        "delegate: no parent passport id (set params.parentPassportId or ctx.passport.id)",
      ).code,
    ).toBe("PASSPORT_NOT_ONCHAIN");
  });

  it("classifies a host-misconfig (bundle not injected)", () => {
    expect(
      classifyError("delegate: ctx.build bundle not injected by host").code,
    ).toBe("HOST_MISCONFIG");
  });

  it("falls back to UNKNOWN with the raw message as the hint", () => {
    const c = classifyError("something totally unexpected happened");
    expect(c.code).toBe("UNKNOWN");
    expect(c.hint).toBe("something totally unexpected happened");
  });

  it("handles empty/undefined input", () => {
    expect(classifyError(undefined).code).toBe("UNKNOWN");
    expect(classifyError("").code).toBe("UNKNOWN");
  });
});

describe("diagnoseStep", () => {
  const mk = (over: Partial<StepResult>): StepResult => ({
    nodeId: "n",
    type: "sui",
    status: "error",
    ...over,
  });

  it("returns cause + remediation + error severity for the env bug", () => {
    const d = diagnoseStep(
      mk({
        status: "error",
        error: "SUI_PRIVATE_KEY is not set — required to sign sponsored transactions server-side.",
      }),
    );
    expect(d.code).toBe("ENV_MISSING");
    expect(d.severity).toBe("error");
    expect(d.cause).toMatch(/SUI_PRIVATE_KEY/);
    expect(d.remediation).toMatch(/\.env/);
  });

  it("treats a public-skill skip as a neutral PUBLIC_SKIP (severity skip)", () => {
    const d = diagnoseStep(
      mk({
        type: "harbor",
        status: "skipped",
        output: { note: "public skill — Seal encryption skipped" },
      }),
    );
    expect(d.code).toBe("PUBLIC_SKIP");
    expect(d.severity).toBe("skip");
  });

  it("treats memwal-not-configured as MEMWAL_SKIP, not a failure", () => {
    const d = diagnoseStep(
      mk({
        type: "memory",
        status: "skipped",
        output: { note: "memwal not configured" },
      }),
    );
    expect(d.code).toBe("MEMWAL_SKIP");
    expect(d.severity).toBe("skip");
    expect(d.cause).toMatch(/MEMWAL_API_KEY/i);
    // The remediation tells the user the URL defaults to staging.
    expect(d.remediation).toMatch(/staging/i);
  });

  it("SPONSOR_REJECTED: names the EXACT runtime sender from the error", () => {
    const d = diagnoseStep(
      mk({
        status: "error",
        error:
          "Enoki: sender address not allowed: 0x010030a0afc40b6d8fe99cee368cab5652baa0d36b7be60a9b017d5228c0bdfd",
      }),
    );
    expect(d.code).toBe("SPONSOR_REJECTED");
    expect(d.severity).toBe("error");
    // The exact runtime sender from the error is echoed into the fix text.
    expect(d.remediation).toContain(
      "0x010030a0afc40b6d8fe99cee368cab5652baa0d36b7be60a9b017d5228c0bdfd",
    );
    // ...alongside the portal, the move-call targets, and the network.
    expect(d.remediation).toMatch(/portal\.enoki\.mystenlabs\.com/);
    expect(d.remediation).toMatch(/move-call targets/i);
    expect(d.remediation).toMatch(/testnet/i);
  });

  it("SPONSOR_REJECTED: falls back to SUI_PRIVATE_KEY when no address in error", () => {
    const d = diagnoseStep(
      mk({
        status: "error",
        error: "Enoki sponsor rejected: sender not allowed",
      }),
    );
    expect(d.code).toBe("SPONSOR_REJECTED");
    expect(d.remediation).toMatch(/SUI_PRIVATE_KEY/);
    expect(d.remediation).toMatch(/portal\.enoki\.mystenlabs\.com/);
  });

  it("labels a pending node as BLOCKED_UPSTREAM (info), distinct from skip", () => {
    const d = diagnoseStep(mk({ type: "memory", status: "pending" }));
    expect(d.code).toBe("BLOCKED_UPSTREAM");
    expect(d.severity).toBe("info");
    expect(d.cause).toMatch(/upstream/i);
  });

  it("reports a done step as ok", () => {
    const d = diagnoseStep(mk({ status: "done" }));
    expect(d.severity).toBe("ok");
  });
});

describe("preflight", () => {
  const envAllSet: PreflightEnv = {
    suiKey: true,
    enokiKey: true,
    memwal: true,
    packageId: true,
    passportOnChain: true,
    network: "testnet",
  };

  const graph: WorkflowGraph = {
    nodes: [
      { id: "trigger", type: "trigger", label: "Trigger" },
      { id: "walrus", type: "walrus", label: "Walrus" },
      { id: "harbor", type: "harbor", label: "Harbor" },
      { id: "sui", type: "sui", label: "Sui" },
      { id: "memory", type: "memory", label: "Memory" },
    ],
    edges: [],
  };

  it("predicts the motivating run: sui will-error when SUI_PRIVATE_KEY missing", () => {
    const report = preflight(graph, { ...envAllSet, suiKey: false });
    const sui = report.nodes.find((n) => n.nodeId === "sui");
    expect(sui?.outcome).toBe("will-error");
    expect(sui?.code).toBe("ENV_MISSING");
    expect(sui?.reason).toMatch(/SUI_PRIVATE_KEY/);
    // The hard blocker is set because an on-chain node will error on env.
    expect(report.hasHardBlocker).toBe(true);
  });

  it("predicts harbor will-skip for a public (non-private) node", () => {
    const report = preflight(graph, envAllSet);
    const harbor = report.nodes.find((n) => n.nodeId === "harbor");
    expect(harbor?.outcome).toBe("will-skip");
    expect(harbor?.code).toBe("PUBLIC_SKIP");
  });

  it("predicts memory will-skip when no relayer is configured", () => {
    const report = preflight(graph, { ...envAllSet, memwal: false });
    const memory = report.nodes.find((n) => n.nodeId === "memory");
    expect(memory?.outcome).toBe("will-skip");
    expect(memory?.code).toBe("MEMWAL_SKIP");
  });

  it("predicts every node will-run when fully configured", () => {
    const privateGraph: WorkflowGraph = {
      nodes: [
        { id: "trigger", type: "trigger", label: "Trigger" },
        { id: "walrus", type: "walrus", label: "Walrus" },
        {
          id: "harbor",
          type: "harbor",
          label: "Harbor",
          params: { private: "true", sealPolicyId: "0xpolicy" },
        },
        { id: "sui", type: "sui", label: "Sui" },
        { id: "memory", type: "memory", label: "Memory" },
      ],
      edges: [],
    };
    const report = preflight(privateGraph, envAllSet);
    expect(report.nodes.every((n) => n.outcome === "will-run")).toBe(true);
    expect(report.hasHardBlocker).toBe(false);
  });

  it("predicts walrus will-error on mainnet with no custom publisher", () => {
    const report = preflight(graph, {
      ...envAllSet,
      network: "mainnet",
      customWalrusPublisher: false,
    });
    const walrus = report.nodes.find((n) => n.nodeId === "walrus");
    expect(walrus?.outcome).toBe("will-error");
    expect(walrus?.code).toBe("WALRUS_UPLOAD");
  });

  it("predicts sui will-skip when there is no passport and no move target", () => {
    const report = preflight(graph, { ...envAllSet, passportOnChain: false });
    const sui = report.nodes.find((n) => n.nodeId === "sui");
    expect(sui?.outcome).toBe("will-skip");
    expect(sui?.code).toBe("NOTHING_TO_RUN");
    // A skip is not a hard blocker.
    expect(report.hasHardBlocker).toBe(false);
  });

  it("flags missing required fields on coordinate nodes", () => {
    const coordGraph: WorkflowGraph = {
      nodes: [
        { id: "import", type: "import-agent", label: "Import Agent" },
        { id: "delegate", type: "delegate", label: "Delegate" },
        { id: "attest", type: "attest", label: "Attest" },
      ],
      edges: [],
    };
    const report = preflight(coordGraph, envAllSet);
    const imp = report.nodes.find((n) => n.nodeId === "import");
    expect(imp?.outcome).toBe("will-error");
    expect(imp?.code).toBe("MISSING_CONFIG");
  });

  it("exposes the on-chain node-type set", () => {
    expect(ONCHAIN_NODE_TYPES.has("sui")).toBe(true);
    expect(ONCHAIN_NODE_TYPES.has("delegate")).toBe(true);
    expect(ONCHAIN_NODE_TYPES.has("trigger")).toBe(false);
  });
});
