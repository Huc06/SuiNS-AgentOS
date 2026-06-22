/**
 * Server-side preflight: report ONLY booleans (presence of env var NAMES, never
 * their values) plus a per-node prediction of which workflow nodes will run /
 * skip / error BEFORE a run. The canvas uses this to warn the user up front,
 * instead of surfacing the cryptic red "SUI_PRIVATE_KEY is not set" node after
 * the fact.
 *
 * NEVER serialise or log any secret value here. We only ever expose
 * `Boolean(process.env.X)`.
 */

import { preflight as sdkPreflight } from '@agentos-sui/sdk/node';
import type {
  PreflightEnv,
  PreflightReport,
  WorkflowGraph,
} from '@agentos-sui/sdk/node';

import { getAgentosPackageId, getSuiNetwork } from './enoki-config';
import { loadRootEnv } from './load-root-env';

/** Presence-only env summary returned to the client. Booleans, no values. */
export interface PreflightEnvSummary {
  /** SUI_PRIVATE_KEY present (signs sponsored txs server-side). */
  suiKey: boolean;
  /** ENOKI_SECRET_KEY present (gas sponsorship). */
  enokiKey: boolean;
  /**
   * MEMWAL memory configured: the signed scheme (MEMWAL_ACCOUNT_ID +
   * MEMWAL_DELEGATE_KEY) OR a legacy MEMWAL_API_KEY. MEMWAL_RELAYER_URL is
   * optional (defaults to the public staging relayer in memwalFromEnv).
   */
  memwal: boolean;
  /** A non-placeholder AGENTOS package id is configured. */
  packageId: boolean;
  /** The agent has a passport id (and, when checkable, it exists on-chain). */
  passportOnChain: boolean;
  /** Sui network the run will target. */
  network: 'mainnet' | 'testnet' | 'devnet';
  /** True when a custom Walrus publisher URL is configured. */
  customWalrusPublisher: boolean;
}

/** Read the presence-only env summary. Loads the repo-root .env first. */
export function readEnvPresence(opts: {
  passportId?: string;
}): PreflightEnvSummary {
  loadRootEnv();
  return {
    suiKey: Boolean(process.env.SUI_PRIVATE_KEY?.trim()),
    enokiKey: Boolean(process.env.ENOKI_SECRET_KEY?.trim()),
    // Memory needs either the signed-scheme credentials (MEMWAL_ACCOUNT_ID +
    // MEMWAL_DELEGATE_KEY) or a legacy MEMWAL_API_KEY — MEMWAL_RELAYER_URL
    // defaults to the public staging relayer in memwalFromEnv, so don't require
    // it here. Mirrors the precedence in memwalFromEnv.
    memwal:
      (Boolean(process.env.MEMWAL_ACCOUNT_ID?.trim()) &&
        Boolean(process.env.MEMWAL_DELEGATE_KEY?.trim())) ||
      Boolean(process.env.MEMWAL_API_KEY?.trim()),
    packageId: Boolean(getAgentosPackageId()),
    // A passport id recorded in the registry is the best signal we have without
    // an on-chain getObject; the SDK preflight treats it as "may run on-chain".
    passportOnChain: Boolean(opts.passportId?.trim()),
    network: getSuiNetwork(),
    customWalrusPublisher: Boolean(process.env.WALRUS_PUBLISHER_URL?.trim()),
  };
}

/** The full preflight payload returned by the endpoint. */
export interface PreflightPayload {
  env: PreflightEnvSummary;
  report: PreflightReport;
}

/**
 * Compute the preflight for a graph: presence booleans + a per-node prediction.
 * Pure-ish: only reads env presence (never values) and the static graph.
 */
export function computePreflight(
  graph: WorkflowGraph,
  opts: { passportId?: string },
): PreflightPayload {
  const env = readEnvPresence(opts);
  const sdkEnv: PreflightEnv = {
    suiKey: env.suiKey,
    enokiKey: env.enokiKey,
    memwal: env.memwal,
    packageId: env.packageId,
    passportOnChain: env.passportOnChain,
    network: env.network,
    customWalrusPublisher: env.customWalrusPublisher,
  };
  const report = sdkPreflight(graph, sdkEnv);
  return { env, report };
}
