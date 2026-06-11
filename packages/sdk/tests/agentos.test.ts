import type { ClientWithCoreApi } from "@mysten/sui/experimental";
import { describe, expect, it } from "vitest";

import { agentOS } from "../src/agentos.js";
import { AgentOSClient } from "../src/client.js";

describe("agentOS extension", () => {
  it("exports agentOS factory", () => {
    expect(typeof agentOS).toBe("function");
  });

  it("registers AgentOSClient with tx, call, and view", () => {
    const extension = agentOS();
    expect(extension.name).toBe("agentOS");

    const sdk = extension.register({ core: {} } as ClientWithCoreApi);
    expect(sdk).toBeInstanceOf(AgentOSClient);
    expect(sdk.tx).toBeDefined();
    expect(sdk.call).toBeDefined();
    expect(sdk.view).toBeDefined();
    expect(typeof sdk.resolveAgent).toBe("function");
    expect(typeof sdk.createAgent).toBe("function");
    expect(typeof sdk.revokeAgent).toBe("function");
    expect(typeof sdk.publishSkill).toBe("function");
    expect(typeof sdk.resolveSkill).toBe("function");
    expect(typeof sdk.listSkills).toBe("function");
    expect(typeof sdk.createSkillBucket).toBe("function");
    expect(typeof sdk.uploadManifest).toBe("function");
    expect(typeof sdk.downloadManifest).toBe("function");
    expect(typeof sdk.delegateSubAgent).toBe("function");
  });

  it("exposes move call thunks on call", () => {
    const sdk = agentOS().register({ core: {} } as ClientWithCoreApi);
    expect(typeof sdk.call.createAgent).toBe("function");
    expect(typeof sdk.call.revokeAgent).toBe("function");
    expect(typeof sdk.call.createSkillDescriptor).toBe("function");
    expect(typeof sdk.call.createBucketPolicy).toBe("function");
    expect(typeof sdk.call.sealApprove).toBe("function");
  });

  it("exposes transaction builders on tx", () => {
    const sdk = agentOS().register({ core: {} } as ClientWithCoreApi);
    expect(typeof sdk.tx.createAgent).toBe("function");
    expect(typeof sdk.tx.revokeAgent).toBe("function");
    expect(typeof sdk.tx.createSkillDescriptor).toBe("function");
    expect(typeof sdk.tx.createBucketPolicy).toBe("function");
  });
});
