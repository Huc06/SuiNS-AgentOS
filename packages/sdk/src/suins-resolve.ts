/**
 * Browser-safe SuiNS resolution helpers for agents and skills.
 *
 * These utilities resolve `.sui` names to on-chain addresses and objects
 * without requiring a local registry file. They work in both Node and browser
 * environments by using only the SuiClient RPC.
 */

import type { ClientWithCoreApi } from "@mysten/sui/experimental";
import type { AgentPassport, SkillDescriptor } from "./types.js";

/** A SuiClient-like interface exposing the resolution methods we need. */
type ResolvableClient = ClientWithCoreApi & {
  resolveNameServiceAddress?: (params: { name: string }) => Promise<string | null>;
  resolveNameServiceNames?: (params: { address: string }) => Promise<{ data?: string[] }>;
  getObject?: (params: {
    id: string;
    options: { showContent: boolean };
  }) => Promise<{
    data?: {
      content?: {
        dataType?: string;
        type?: string;
        fields?: Record<string, unknown>;
      };
    };
  }>;
};

/**
 * Resolve a `.sui` name to an on-chain address.
 * Returns null if the name is not registered.
 */
export async function resolveAgentAddress(
  client: ClientWithCoreApi,
  name: string,
): Promise<string | null> {
  const c = client as unknown as ResolvableClient;
  if (!c.resolveNameServiceAddress) {
    return null;
  }
  const normalized = normalizeName(name);
  return c.resolveNameServiceAddress({ name: normalized });
}

/**
 * Resolve a `.sui` name to a full AgentPassport by fetching the on-chain object.
 * Returns null if the name doesn't resolve or the object isn't a valid passport.
 */
export async function resolveAgentByName(
  client: ClientWithCoreApi,
  name: string,
): Promise<AgentPassport | null> {
  const address = await resolveAgentAddress(client, name);
  if (!address) return null;

  const c = client as unknown as ResolvableClient;
  if (!c.getObject) return null;

  const obj = await c.getObject({ id: address, options: { showContent: true } });
  const fields = obj?.data?.content?.fields;
  if (!fields) return null;

  // Check if this is actually an AgentPassport type
  const objType = obj?.data?.content?.type ?? "";
  if (!objType.includes("agent_passport::AgentPassport")) return null;

  return parsePassportFields(fields, address);
}

/**
 * Resolve a skill subname (e.g., `trade.alpha.sui`) to a SkillDescriptor.
 * Returns null if the name doesn't resolve or the object isn't valid.
 */
export async function resolveSkillByName(
  client: ClientWithCoreApi,
  suinsName: string,
): Promise<SkillDescriptor | null> {
  const c = client as unknown as ResolvableClient;
  if (!c.resolveNameServiceAddress) return null;

  const normalized = normalizeName(suinsName);
  const address = await c.resolveNameServiceAddress({ name: normalized });
  if (!address) return null;

  if (!c.getObject) return null;
  const obj = await c.getObject({ id: address, options: { showContent: true } });
  const fields = obj?.data?.content?.fields;
  if (!fields) return null;

  const objType = obj?.data?.content?.type ?? "";
  if (!objType.includes("skill_descriptor::SkillDescriptor")) return null;

  return parseDescriptorFields(fields);
}

/**
 * Reverse-resolve an address to its `.sui` name(s).
 * Returns the primary name or null.
 */
export async function reverseResolve(
  client: ClientWithCoreApi,
  address: string,
): Promise<string | null> {
  const c = client as unknown as ResolvableClient;
  if (!c.resolveNameServiceNames) return null;

  const result = await c.resolveNameServiceNames({ address });
  return result?.data?.[0] ?? null;
}

/**
 * Parse a subname into its parts: { skill, agent, tld }.
 * Example: "trade.alpha.sui" → { skill: "trade", agent: "alpha", tld: "sui" }
 */
export function parseSubname(subname: string): {
  skill: string;
  agent: string;
  tld: string;
} | null {
  const parts = subname.replace(/^@/, "").split(".");
  if (parts.length === 3) {
    return { skill: parts[0], agent: parts[1], tld: parts[2] };
  }
  if (parts.length === 2) {
    return { skill: "", agent: parts[0], tld: parts[1] };
  }
  return null;
}

/**
 * Validate that a string looks like a valid SuiNS name input.
 */
export function isValidSuiNSName(name: string): boolean {
  const normalized = name.replace(/^@/, "").trim();
  if (!normalized) return false;
  // Must end with .sui and have at least one label before it
  if (!normalized.endsWith(".sui")) return false;
  const withoutTld = normalized.slice(0, -4);
  if (!withoutTld || withoutTld.startsWith(".") || withoutTld.endsWith(".")) return false;
  return true;
}

// ===== Internal Helpers =====

function normalizeName(name: string): string {
  let normalized = name.trim().replace(/^@/, "");
  if (!normalized.endsWith(".sui")) {
    normalized = `${normalized}.sui`;
  }
  return normalized;
}

function decodeField(value: unknown): string {
  if (Array.isArray(value)) {
    return new TextDecoder().decode(new Uint8Array(value as number[]));
  }
  if (typeof value === "string") return value;
  return "";
}

function decodeArrayField(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).map(decodeField);
}

function parsePassportFields(
  fields: Record<string, unknown>,
  objectId: string,
): AgentPassport {
  return {
    id: objectId,
    owner: decodeField(fields.owner) || (fields.owner as string) || "",
    suinsName: decodeField(fields.suins_name),
    runtimeWallet: decodeField(fields.runtime_wallet) || (fields.runtime_wallet as string) || "",
    policyRoot: (fields.policy_root as string) || "",
    skillRoot: (fields.skill_root as string) || "",
    memoryNamespace: decodeField(fields.memory_namespace),
    activityLogPointer: "",
    status: fields.is_active ? "active" : "revoked",
  };
}

function parseDescriptorFields(
  fields: Record<string, unknown>,
): SkillDescriptor {
  const sealPolicyId = decodeField(fields.seal_policy_id);
  return {
    skillId: decodeField(fields.skill_id),
    walrusManifestBlob: decodeField(fields.walrus_manifest_blob),
    manifestHash: decodeField(fields.manifest_hash),
    mvrPackageName: decodeField(fields.mvr_package_name),
    version: decodeField(fields.version),
    requiredCapabilities: decodeArrayField(fields.required_capabilities),
    dependencies: decodeArrayField(fields.dependencies),
    ...(sealPolicyId ? { sealPolicyId, decryptionRequired: true } : {}),
  };
}
