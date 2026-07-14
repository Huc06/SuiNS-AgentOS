import { getFullnodeUrl } from '@mysten/sui/client';
import { fromBase64, normalizeSuiAddress, toHex } from '@mysten/sui/utils';
import type { Transaction } from '@mysten/sui/transactions';

export type SuiNetworkName = 'testnet' | 'mainnet' | 'devnet';

/** The `0x2::transfer::public_share_object` framework call emitted by share flows. */
export const PUBLIC_SHARE_OBJECT_TARGET = '0x2::transfer::public_share_object';

export function getPublicEnokiApiKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_ENOKI_API_KEY?.trim();
  return key || undefined;
}

export function getSuiNetwork(): SuiNetworkName {
  const n = process.env.NEXT_PUBLIC_SUI_NETWORK?.trim();
  if (n === 'mainnet' || n === 'devnet') return n;
  return 'testnet';
}

/**
 * Resolve the Sui fullnode RPC URL to use, honoring `SUI_RPC_URL` /
 * `NEXT_PUBLIC_SUI_RPC_URL` overrides before falling back to
 * `getFullnodeUrl(network)`.
 *
 * Sui's public JSON-RPC endpoints (`fullnode.{network}.sui.io`) are being
 * deprecated and shut down network-by-network in 2026 (testnet the week of
 * 2026-07-06, full deactivation 2026-07-31 — see
 * docs.sui.io/develop/accessing-data/json-rpc-migration). Once a network's
 * public endpoint is turned off, `getFullnodeUrl` silently returns a dead URL
 * (verified: `getFullnodeUrl('testnet')` → `Unexpected status code: 404` as of
 * 2026-07-14). Set `SUI_RPC_URL` (server) / `NEXT_PUBLIC_SUI_RPC_URL` (client)
 * to a still-live provider (e.g. a free PublicNode or Ankr endpoint, or a paid
 * provider) to keep on-chain calls working after the cutover.
 */
export function getSuiRpcUrl(network: SuiNetworkName = getSuiNetwork()): string {
  const override =
    process.env.SUI_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUI_RPC_URL?.trim();
  if (override) return override;
  return getFullnodeUrl(network);
}

export function getAgentosPackageId(): string | undefined {
  const id =
    process.env.NEXT_PUBLIC_AGENTOS_PACKAGE_ID?.trim() ||
    process.env.AGENTOS_PACKAGE_ID?.trim();
  return id || undefined;
}

/**
 * The set of AgentOS-*package* mutating Move-call targets that sponsored
 * transactions may invoke, qualified with the configured package id. Passing
 * this list (together with `allowedAddresses`) to
 * `enoki.createSponsoredTransaction` scopes the sponsorship at call time, which
 * is what removes the need for any Enoki *portal* allowlist config (otherwise
 * Enoki rejects with `SPONSOR_REJECTED` / "runtime sender is not on the Enoki
 * allowlist").
 *
 * This is the static baseline — it covers every mutating entry point *in the
 * AgentOS package itself*, which is enough for the create-agent path. It does
 * NOT cover, and must be augmented per-call (see {@link deriveSponsorAllowlist})
 * by, three classes of target that depend on the actual PTB:
 *   - `0x2::transfer::public_share_object` emitted by attest `share: true` flows
 *     (framework calls are NOT auto-allowed by Enoki),
 *   - a skill's arbitrary `movePackage::module::function` invoked by
 *     call-sub-agent / executeSkill (never the AgentOS package), and
 *   - non-sender transfer recipients (delegate's child agent,
 *     attest-to-recipient) which Enoki validates against `allowedAddresses`.
 *
 * Enumerated from the SDK contract builders + the Move sources
 * (`packages/contracts/sources/*.move`). Read-only getters and
 * `bucket_policy::seal_approve` (a Seal gate, never sponsored) are intentionally
 * omitted. `@mysten/enoki@0.12` types this as a plain `string[]` with no
 * documented wildcard, so we use the explicit list.
 */
export function getAllowedMoveCallTargets(packageId?: string): string[] {
  const pkg = packageId ?? getAgentosPackageId();
  if (!pkg) return [];
  return [
    // agent_passport
    `${pkg}::agent_passport::create`,
    `${pkg}::agent_passport::revoke`,
    `${pkg}::agent_passport::set_memory_namespace`,
    `${pkg}::agent_passport::record_execution`,
    // skill_descriptor
    `${pkg}::skill_descriptor::create`,
    `${pkg}::skill_descriptor::update`,
    `${pkg}::skill_descriptor::set_seal_policy`,
    `${pkg}::skill_descriptor::set_dependencies`,
    `${pkg}::skill_descriptor::set_required_capabilities`,
    `${pkg}::skill_descriptor::set_suins_subname`,
    // bucket_policy (private-skill / BucketPolicy creation; `seal_approve` is a
    // Seal gate and is intentionally excluded — it is never sponsored).
    `${pkg}::bucket_policy::create`,
    // delegation
    `${pkg}::delegation::grant`,
    `${pkg}::delegation::assert_valid`,
    `${pkg}::delegation::consume`,
    `${pkg}::delegation::record_subagent_execution`,
    `${pkg}::delegation::revoke`,
    // attestation
    `${pkg}::attestation::attest`,
    // The framework share call attestation emits for `share: true` flows. Listed
    // statically too (it is package-independent) so attest-share is covered even
    // when the per-call derivation is bypassed.
    PUBLIC_SHARE_OBJECT_TARGET,
  ];
}

/** A `Transaction.getData()` command — only the variants we introspect are typed. */
type TxCommand =
  | { $kind: 'MoveCall'; MoveCall: { package: string; module: string; function: string } }
  | {
      $kind: 'TransferObjects';
      TransferObjects: { address?: { $kind?: string; Input?: number } };
    }
  | { $kind: string };

/** A `Transaction.getData()` input — only pure/address-bearing shapes are typed. */
type TxInput =
  | { $kind: 'Pure'; Pure: { bytes: string } }
  | { $kind: 'UnresolvedPure'; UnresolvedPure: { value: unknown } }
  | { $kind: string };

/** Decode a pure-input argument into a normalized 0x Sui address, or undefined. */
function decodePureAddress(input: TxInput | undefined): string | undefined {
  if (!input) return undefined;
  try {
    if ('Pure' in input && input.Pure?.bytes) {
      const bytes = fromBase64(input.Pure.bytes);
      // A Sui address is a fixed 32-byte BCS value; ignore non-address pures.
      if (bytes.length !== 32) return undefined;
      return normalizeSuiAddress(`0x${toHex(bytes)}`);
    }
    if ('UnresolvedPure' in input && typeof input.UnresolvedPure?.value === 'string') {
      const v = input.UnresolvedPure.value.trim();
      if (/^0x[0-9a-fA-F]+$/.test(v)) return normalizeSuiAddress(v);
    }
  } catch {
    // Best-effort: a pure we cannot decode just is not added to the allowlist.
  }
  return undefined;
}

/**
 * Derive the precise Enoki sponsor allowlist for a *specific* built PTB, by
 * introspecting the transaction the workflow executor produced.
 *
 * Returns `{ allowedMoveCallTargets, allowedAddresses }` to pass straight to
 * `enoki.createSponsoredTransaction`:
 *   - `allowedMoveCallTargets` = the static AgentOS baseline UNION every
 *     `MoveCall` target the PTB actually invokes. This automatically covers a
 *     skill's arbitrary `movePackage::module::function` and the framework
 *     `0x2::transfer::public_share_object` share call — both of which Enoki
 *     requires to be allowlisted but which are not in the static baseline.
 *   - `allowedAddresses` = `[sender]` UNION every `TransferObjects` recipient
 *     address the PTB resolves to a pure 0x address. This covers third-party
 *     transfers (delegate's child agent, attest-to-recipient) that Enoki would
 *     otherwise reject against `allowedAddresses`.
 *
 * Deriving from the PTB (rather than enumerating every possible flow up front)
 * keeps the allowlist scoped to exactly what each sponsored transaction does.
 */
export function deriveSponsorAllowlist(
  tx: Transaction,
  sender: string,
  packageId?: string,
): { allowedMoveCallTargets: string[]; allowedAddresses: string[] } {
  const targets = new Set(getAllowedMoveCallTargets(packageId));
  const addresses = new Set([normalizeSuiAddress(sender)]);

  let data: { commands?: TxCommand[]; inputs?: TxInput[] } | undefined;
  try {
    data = tx.getData() as { commands?: TxCommand[]; inputs?: TxInput[] };
  } catch {
    // If the PTB cannot be introspected, fall back to the static baseline.
    return {
      allowedMoveCallTargets: [...targets],
      allowedAddresses: [...addresses],
    };
  }

  const inputs = data?.inputs ?? [];
  for (const cmd of data?.commands ?? []) {
    if ('MoveCall' in cmd && cmd.MoveCall) {
      const { package: pkg, module: mod, function: fn } = cmd.MoveCall;
      if (pkg && mod && fn) targets.add(`${pkg}::${mod}::${fn}`);
    } else if ('TransferObjects' in cmd && cmd.TransferObjects) {
      const addr = cmd.TransferObjects.address;
      if (addr?.$kind === 'Input' && typeof addr.Input === 'number') {
        const decoded = decodePureAddress(inputs[addr.Input]);
        if (decoded) addresses.add(decoded);
      }
    }
  }

  return {
    allowedMoveCallTargets: [...targets],
    allowedAddresses: [...addresses],
  };
}

export function isEnokiConfigured(): boolean {
  return Boolean(getPublicEnokiApiKey());
}

/** Client flag: attempt Enoki sponsor flow (server still needs ENOKI_SECRET_KEY). */
export function isEnokiSponsorEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENOKI_SPONSOR === 'true' && isEnokiConfigured();
}
