import type {
  RegistryAgentRecord,
  RegistrySkillRecord,
  RegistryWorkflowRecord,
} from "@agentos-sui/sdk/node";

import type { AgentCardData } from "../components/dashboard/agent-card";
import type { AgentSkillRow } from "./agent-types";
import { computeAgentReputation, isAgentVerified } from "./reputation";

export function shortObjectId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-6)}`;
}

export function registryAgentToCard(
  agent: RegistryAgentRecord,
  skillCount: number,
): AgentCardData {
  const verified = isAgentVerified(agent);
  const reputation = computeAgentReputation({
    skillCount,
    resolutions: 0, // TODO: wire real resolution count when indexed
    status: agent.status,
    hasOnchainPassport: Boolean(
      agent.passportId && !agent.passportId.startsWith("0x00"),
    ),
  });

  return {
    slug: agent.slug,
    suinsName: agent.suinsName,
    displayName: agent.suinsName.startsWith("@")
      ? agent.suinsName
      : `@${agent.slug}`,
    version: agent.passportVersion,
    network: agent.network,
    metric:
      skillCount === 0
        ? "No skills yet"
        : `${skillCount} skill${skillCount === 1 ? "" : "s"}`,
    trend: skillCount >= 2 ? "up" : "flat",
    icon: "package",
    verified,
    reputationScore: reputation.score,
    reputationTier: reputation.tier,
  };
}

/** Card shape for the Workflows list page. */
export interface WorkflowCardData {
  slug: string;
  name: string;
  suinsName: string;
  /** Owning agent slug. */
  agentSlug: string;
  network: "mainnet" | "testnet";
  status: "draft" | "active" | "archived";
  /** Number of nodes in the published graph, when known. */
  nodeCount?: number;
  description?: string;
  lastUpdated: string;
  /** True once the graph has been published to Walrus. */
  published: boolean;
}

export function registryWorkflowToCard(
  workflow: RegistryWorkflowRecord,
  nodeCount?: number,
): WorkflowCardData {
  return {
    slug: workflow.slug,
    name: workflow.name,
    suinsName: workflow.suinsName,
    agentSlug: workflow.agentSlug,
    network: workflow.network,
    status: workflow.status,
    published: Boolean(workflow.walrusManifestBlob),
    lastUpdated: workflow.lastUpdated,
    ...(typeof nodeCount === "number" ? { nodeCount } : {}),
    ...(workflow.description ? { description: workflow.description } : {}),
  };
}

export function registrySkillToRow(skill: RegistrySkillRecord): AgentSkillRow {
  return {
    id: skill.skillId,
    name: skill.name,
    mvrPackage: skill.mvrPackage,
    network: skill.network,
    version: skill.version,
    objectId: shortObjectId(skill.objectId),
    objectIdFull: skill.objectId,
    blobId: skill.walrusManifestBlob,
    sealPolicyId: skill.sealPolicyId,
    status: skill.status,
    resolutions: skill.resolutions,
    lastUpdated: skill.lastUpdated,
    icon: skill.icon,
    dependencies: skill.dependencies ?? [],
    source: skill.source ?? "custom",
  };
}
