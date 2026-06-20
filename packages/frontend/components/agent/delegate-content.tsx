"use client";

import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { useCallback, useEffect, useState } from "react";

import { getAgentosPackageId, getSuiNetwork } from "../../lib/enoki-config";
import { explorerTxUrl } from "../../lib/explorer-links";
import { buildDelegateTx } from "../../lib/delegation-tx";
import type { DelegationRecord } from "../../lib/delegation-types";
import {
  isValidSuinsNameInput,
  normalizeSuinsInput,
} from "../../lib/suins-helpers";
import { DelegationGraph } from "./delegation-graph";

const CAPABILITIES = [
  "execute_skill",
  "transfer",
  "publish_skill",
  "read_memory",
];

const DURATIONS = [
  { label: "24h", ms: 86_400_000 },
  { label: "7d", ms: 604_800_000 },
  { label: "30d", ms: 2_592_000_000 },
];

interface DelegateContentProps {
  agentSlug: string;
  passportId?: string;
}

export function DelegateContent({
  agentSlug,
  passportId,
}: DelegateContentProps) {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const network = getSuiNetwork();
  const packageId = getAgentosPackageId();

  const [childName, setChildName] = useState("");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [spendLimit, setSpendLimit] = useState("1");
  const [duration, setDuration] = useState(DURATIONS[1].ms);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successDigest, setSuccessDigest] = useState<string | null>(null);
  const [delegations, setDelegations] = useState<DelegationRecord[]>([]);

  // Load existing delegations
  const loadDelegations = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/delegations?agent=${encodeURIComponent(agentSlug)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as { delegations?: DelegationRecord[] };
      setDelegations(
        (data.delegations ?? []).map((d, i) => ({
          ...d,
          id: d.capId ?? `local-${i}`,
        })),
      );
    } catch {
      /* silent */
    }
  }, [agentSlug]);

  useEffect(() => {
    void loadDelegations();
  }, [loadDelegations]);

  const toggleCap = (cap: string) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap],
    );
  };

  const childAddress = childName.startsWith("0x") ? childName : "";
  const nameValid = childName.startsWith("0x")
    ? childName.length === 66
    : isValidSuinsNameInput(childName);
  const canSubmit =
    nameValid &&
    capabilities.length > 0 &&
    parseFloat(spendLimit) > 0 &&
    account?.address;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !account?.address) return;

    setSubmitting(true);
    setError(null);
    setSuccessDigest(null);

    const expiryMs = BigInt(Date.now() + duration);
    const spendMist = BigInt(
      Math.floor(parseFloat(spendLimit) * 1_000_000_000),
    );
    const resolvedChild = childAddress || account.address; // Fallback

    try {
      let digest: string | undefined;

      if (packageId && passportId) {
        const tx = buildDelegateTx({
          parentPassportId: passportId,
          childAgent: resolvedChild,
          allowedSkills: [],
          allowedCapabilities: capabilities,
          spendLimit: spendMist,
          expiryMs,
        });
        const result = await signAndExecute({ transaction: tx as never });
        digest = result.digest;
      }

      // Persist to registry
      await fetch("/api/delegations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentSlug,
          delegation: {
            childAgent: resolvedChild,
            childName: childName.startsWith("0x")
              ? childName
              : normalizeSuinsInput(childName),
            allowedSkills: [],
            allowedCapabilities: capabilities,
            spendLimit: spendMist.toString(),
            spent: "0",
            expiryMs: expiryMs.toString(),
            revoked: false,
            capId: undefined,
            createdAt: new Date().toISOString(),
          },
        }),
      });

      if (digest) {
        setSuccessDigest(digest);
      }

      // Reset form + reload
      setChildName("");
      setCapabilities([]);
      setSpendLimit("1");
      void loadDelegations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delegation failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold">Delegation</h1>

      {/* Grant form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-5 border-2 border-pure-black bg-white p-6 neo-shadow"
      >
        <h2 className="font-mono text-sm font-bold uppercase text-electric-purple">
          Grant Delegation
        </h2>

        {error && (
          <div
            role="alert"
            className="border-2 border-error bg-red-50 px-3 py-2 font-mono text-xs text-error"
          >
            {error}
          </div>
        )}

        {successDigest && (
          <div className="border-2 border-green-800 bg-green-50 px-3 py-2">
            <p className="font-mono text-xs font-bold text-green-900">
              ✓ Delegation granted
            </p>
            <a
              href={explorerTxUrl(network, successDigest)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs font-bold text-electric-purple hover:underline"
            >
              View on Suiscan →
            </a>
          </div>
        )}

        {/* Sub-agent name/address */}
        <div className="space-y-1">
          <label
            htmlFor="del-child"
            className="font-mono text-xs font-bold uppercase text-on-surface-variant"
          >
            Sub-agent (name or 0x address)
          </label>
          <input
            id="del-child"
            type="text"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="sub-agent.sui or 0x..."
            className="w-full border-2 border-pure-black bg-white px-3 py-2 font-mono text-sm outline-none neo-shadow"
          />
        </div>

        {/* Capabilities */}
        <fieldset className="space-y-2">
          <legend className="font-mono text-xs font-bold uppercase text-on-surface-variant">
            Capabilities (select ≥1)
          </legend>
          <div className="flex flex-wrap gap-2">
            {CAPABILITIES.map((cap) => (
              <button
                key={cap}
                type="button"
                onClick={() => toggleCap(cap)}
                className={`border-2 px-3 py-1 font-mono text-xs font-bold transition-colors ${
                  capabilities.includes(cap)
                    ? "border-electric-purple bg-electric-purple text-off-white"
                    : "border-pure-black bg-white text-on-surface hover:bg-surface-container"
                }`}
              >
                {cap}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Spend limit */}
        <div className="space-y-1">
          <label
            htmlFor="del-spend"
            className="font-mono text-xs font-bold uppercase text-on-surface-variant"
          >
            Spend limit (SUI)
          </label>
          <input
            id="del-spend"
            type="number"
            min="0.001"
            step="0.001"
            value={spendLimit}
            onChange={(e) => setSpendLimit(e.target.value)}
            className="w-full border-2 border-pure-black bg-white px-3 py-2 font-mono text-sm outline-none neo-shadow"
          />
        </div>

        {/* Duration */}
        <div className="space-y-1">
          <span className="font-mono text-xs font-bold uppercase text-on-surface-variant">
            Expiry
          </span>
          <div className="flex gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => setDuration(d.ms)}
                className={`border-2 px-3 py-1 font-mono text-xs font-bold ${
                  duration === d.ms
                    ? "border-electric-purple bg-electric-purple text-off-white"
                    : "border-pure-black bg-white text-on-surface hover:bg-surface-container"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="w-full border-2 border-pure-black bg-electric-purple px-4 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {submitting ? "Signing…" : "Grant Delegation"}
        </button>

        {!account?.address && (
          <p className="font-mono text-[10px] text-on-surface-variant">
            Connect a wallet to delegate.
          </p>
        )}
      </form>

      {/* Delegation Graph */}
      <div>
        <h2 className="mb-4 font-mono text-sm font-bold uppercase text-on-surface-variant">
          Capability Graph
        </h2>
        <DelegationGraph delegations={delegations} parentName={agentSlug} />
      </div>

      {/* Delegation List */}
      {delegations.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-mono text-sm font-bold uppercase text-on-surface-variant">
              Active Delegations
            </h2>
            <button
              type="button"
              onClick={() => void loadDelegations()}
              className="font-mono text-xs font-bold text-electric-purple hover:underline"
            >
              Refresh
            </button>
          </div>
          <div className="space-y-3">
            {delegations.map((del, i) => {
              const now = Date.now();
              const expiry = parseInt(del.expiryMs, 10);
              const isExpired = expiry <= now;
              const isExpiring = !isExpired && expiry - now < 86_400_000;
              const statusLabel = del.revoked
                ? "Revoked"
                : isExpired
                  ? "Expired"
                  : isExpiring
                    ? "Expiring"
                    : "Active";
              const statusColor =
                del.revoked || isExpired
                  ? "text-error"
                  : isExpiring
                    ? "text-amber-600"
                    : "text-green-800";
              const spentNum = parseInt(del.spent, 10) || 0;
              const limitNum = parseInt(del.spendLimit, 10) || 1;
              const spendPct = Math.min(
                100,
                Math.floor((spentNum / limitNum) * 100),
              );

              return (
                <div
                  key={del.id ?? i}
                  className="border-2 border-pure-black bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold truncate">
                        {del.childName || del.childAgent.slice(0, 16)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {del.allowedCapabilities.map((cap) => (
                          <span
                            key={cap}
                            className="border border-electric-purple/40 bg-electric-purple/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-electric-purple"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 font-mono text-xs font-bold ${statusColor}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  {/* Spend progress */}
                  <div className="mt-3">
                    <div className="flex justify-between font-mono text-[10px] text-on-surface-variant">
                      <span>
                        Spend: {(spentNum / 1e9).toFixed(2)} /{" "}
                        {(limitNum / 1e9).toFixed(2)} SUI
                      </span>
                      <span>{spendPct}%</span>
                    </div>
                    <div className="mt-1 h-2 w-full border border-pure-black bg-surface-container">
                      <div
                        className="h-full bg-electric-purple"
                        style={{ width: `${spendPct}%` }}
                      />
                    </div>
                  </div>
                  {/* Expiry */}
                  <p className="mt-2 font-mono text-[10px] text-on-surface-variant">
                    Expires: {new Date(expiry).toLocaleString()}
                  </p>
                  {/* Revoke button */}
                  {!del.revoked && !isExpired && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (
                          !confirm(
                            "Revoke this delegation? This cannot be undone.",
                          )
                        )
                          return;
                        // Mark as revoked in registry
                        await fetch("/api/delegations", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            agentSlug,
                            delegation: { ...del, revoked: true },
                          }),
                        });
                        void loadDelegations();
                      }}
                      className="mt-3 border-2 border-error bg-white px-3 py-1 font-mono text-xs font-bold text-error transition-colors hover:bg-error hover:text-white"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
