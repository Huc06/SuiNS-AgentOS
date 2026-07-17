"use client";

import { useSuiClient, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import type { ClientWithExtensions, CoreClient } from "@mysten/sui/client";

type SuiClient = ClientWithExtensions<{ core: CoreClient }>;
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";

import { agentOS } from "../agentos.js";
import type { AgentOSClient } from "../client.js";
import type {
  AgentPassport,
  AgentReputation,
  SkillDescriptor,
} from "../types.js";

type ExtendableSuiClient = SuiClient & {
  agentOS?: AgentOSClient;
  $extend: (
    registration: ReturnType<typeof agentOS>,
  ) => SuiClient & { agentOS: AgentOSClient };
};

function resolveAgentOSClient(client: unknown): AgentOSClient {
  const extendable = client as ExtendableSuiClient;

  if (extendable.agentOS) {
    return extendable.agentOS;
  }

  return extendable.$extend(agentOS()).agentOS;
}

/** Get the AgentOSClient instance from the current SuiClient context. */
export function useAgentOSClient(): AgentOSClient {
  const client = useSuiClient();
  return useMemo(() => resolveAgentOSClient(client), [client]);
}

/**
 * Resolve an agent by SuiNS name.
 * Tries on-chain resolution first, falls back to local registry.
 */
export function useAgent(suinsName: string) {
  const sdk = useAgentOSClient();
  return useQuery<AgentPassport>({
    queryKey: ["agent", suinsName],
    queryFn: () => sdk.resolveAgent(suinsName),
    enabled: Boolean(suinsName),
  });
}

/** List skills for an agent by name. */
export function useSkills(agentName: string) {
  const sdk = useAgentOSClient();
  return useQuery<SkillDescriptor[]>({
    queryKey: ["skills", agentName],
    queryFn: () => sdk.listSkills(agentName),
    enabled: Boolean(agentName),
  });
}

/**
 * Resolve a SuiNS name to an address + kind (agent or skill).
 * Browser-safe: uses on-chain resolution, no registryPath needed.
 */
export function useResolveName(name: string) {
  const sdk = useAgentOSClient();
  return useQuery<{
    address: string;
    kind: "agent" | "skill" | "unknown";
  } | null>({
    queryKey: ["resolveName", name],
    queryFn: async () => {
      const { resolveAgentAddress, resolveSkillByName, resolveAgentByName } =
        await import("../suins-resolve.js");
      const client = sdk.client;

      // Try agent first
      const passport = await resolveAgentByName(client, name);
      if (passport) {
        return { address: passport.id, kind: "agent" as const };
      }

      // Try skill
      const skill = await resolveSkillByName(client, name);
      if (skill) {
        const addr = await resolveAgentAddress(client, name);
        return { address: addr ?? "", kind: "skill" as const };
      }

      return null;
    },
    enabled: Boolean(name),
  });
}

/**
 * Get on-chain reputation data for an agent (exec_count, score, active status).
 * Falls back to registry heuristics when the on-chain passport lacks the field.
 */
export function useAgentReputation(nameOrId: string) {
  const sdk = useAgentOSClient();
  return useQuery<AgentReputation>({
    queryKey: ["agentReputation", nameOrId],
    queryFn: () => sdk.getAgentReputation(nameOrId),
    enabled: Boolean(nameOrId),
  });
}

/**
 * Build + sign + execute a skill via the connected wallet (browser-safe).
 * Does NOT import any Node-only modules.
 *
 * Usage:
 * ```ts
 * const { mutate: execute, data, isPending } = useExecuteSkill();
 * execute({ suinsName: 'trade.alpha.sui', params: { amount: 100 } });
 * ```
 */
export function useExecuteSkill() {
  const sdk = useAgentOSClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  return useMutation<
    { digest: string; effects: unknown },
    Error,
    {
      suinsName: string;
      params?: Record<string, unknown>;
      agentCapabilities?: string[];
    }
  >({
    mutationKey: ["executeSkill"],
    mutationFn: async ({ suinsName, params, agentCapabilities }) => {
      // 1. Build unsigned transaction (browser-safe)
      const { transaction } = await sdk.buildExecuteSkillTx({
        suinsName,
        params,
        agentCapabilities,
      });

      // 2. Sign + execute via dapp-kit (connected wallet)
      const result = await signAndExecute({
        transaction: transaction as never,
      });

      return {
        digest: result.digest,
        effects: result.effects,
      };
    },
  });
}

/**
 * Delegate capabilities from a parent agent to a sub-agent.
 * Builds the PTB and signs via the connected wallet.
 *
 * Usage:
 * ```ts
 * const { mutate: delegate } = useDelegate();
 * delegate({
 *   parentPassportId: '0x...',
 *   childAgent: '0x...',
 *   allowedCapabilities: ['execute_skill'],
 *   spendLimit: 1_000_000_000n,
 *   expiryMs: BigInt(Date.now() + 86400000),
 * });
 * ```
 */
export function useDelegate() {
  const sdk = useAgentOSClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  return useMutation<
    { digest: string; capId?: string },
    Error,
    {
      parentPassportId: string;
      childAgent: string;
      allowedSkills?: string[];
      allowedCapabilities: string[];
      spendLimit: bigint;
      expiryMs: bigint;
    }
  >({
    mutationKey: ["delegate"],
    mutationFn: async (opts) => {
      // Build delegation transaction via the tx namespace
      const { transaction, cap } = sdk.tx.delegateSubAgent({
        parentPassport: { $kind: "Input", Input: 0, type: "object" } as never,
        childAgent: opts.childAgent,
        allowedSkills: opts.allowedSkills ?? [],
        allowedCapabilities: opts.allowedCapabilities,
        spendLimit: opts.spendLimit,
        expiryMs: opts.expiryMs,
      });

      // Re-build with the actual object reference
      const { Transaction } = await import("@mysten/sui/transactions");
      const tx = new Transaction();
      const parentObj = tx.object(opts.parentPassportId);

      // Import delegation builder directly for proper object handling
      const { grant } = await import("../contracts/delegation.js");
      const delegationCap = tx.add(
        grant({
          parentPassport: parentObj,
          childAgent: opts.childAgent,
          allowedSkills: opts.allowedSkills ?? [],
          allowedCapabilities: opts.allowedCapabilities,
          spendLimit: opts.spendLimit,
          expiryMs: opts.expiryMs,
        }),
      );
      tx.transferObjects([delegationCap], opts.childAgent);

      void transaction;
      void cap;

      // Sign + execute
      const result = await signAndExecute({ transaction: tx as never });

      return {
        digest: result.digest,
        capId: undefined, // Would need to parse objectChanges from result
      };
    },
  });
}

/** @deprecated Use useAgent instead — same functionality. */
export function useAgentWallet(agent: AgentPassport) {
  const sdk = useAgentOSClient();
  return useQuery({
    queryKey: ["wallet", agent.runtimeWallet],
    queryFn: async (): Promise<{ balance: bigint }> => {
      void sdk;
      throw new Error("Not implemented");
    },
  });
}
