"use client";

import { useEffect, useState } from "react";

import type { AgentSkillRow } from "../../lib/agent-types";
import { suiObjectUrl, walrusBlobUrl } from "../../lib/explorer-urls";
import { shortObjectId } from "../../lib/registry-mappers";
import { IconCopy, IconEdit, IconSwap, IconToken, IconWallet } from "./icons";
import { PublishUpgradeButton } from "./publish-upgrade-button";
import { SkillExecutionConsole } from "./skill-execution-console";

const iconMap = {
  token: IconToken,
  wallet: IconWallet,
  swap: IconSwap,
};

const iconBg = {
  token: "bg-soft-lavender",
  wallet: "bg-surface-dim",
  swap: "bg-vibrant-blue text-off-white",
};

/** Display label + neo-brutalist accent per skill origin. */
const sourceBadge: Record<
  AgentSkillRow["source"],
  { label: string; className: string }
> = {
  suiperpower: {
    label: "Suiperpower",
    className: "bg-vibrant-blue text-off-white",
  },
  "sui-skills": {
    label: "Sui Skills",
    className: "bg-soft-lavender text-pure-black",
  },
  custom: {
    label: "Custom",
    className: "bg-surface-dim text-pure-black",
  },
};

export function SkillListItem({ skill }: { skill: AgentSkillRow }) {
  const [copied, setCopied] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  // null = not yet checked / checking (don't show warning to avoid flicker);
  // true = blob reachable; false = blob unreachable (show warning).
  const [blobAvailable, setBlobAvailable] = useState<boolean | null>(null);
  const Icon = iconMap[skill.icon];
  const active = skill.status === "active";
  const isPrivate = Boolean(
    skill.sealPolicyId && skill.sealPolicyId.length > 0,
  );
  const groupName = isPrivate
    ? shortObjectId(skill.sealPolicyId as string)
    : "";
  const source = sourceBadge[skill.source] ?? sourceBadge.custom;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(skill.objectIdFull);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  // Check whether the Walrus manifest blob is reachable. Skip when there is no
  // blob, or when the blobId is a local placeholder (walrus:// prefix = not
  // uploaded to Walrus yet, so no point checking the aggregator).
  useEffect(() => {
    if (!skill.blobId || skill.blobId.startsWith("walrus://")) {
      setBlobAvailable(null);
      return;
    }
    let cancelled = false;
    setBlobAvailable(null);
    void fetch(
      `/api/skills/blob-status?blobId=${encodeURIComponent(skill.blobId)}`,
    )
      .then((res) => (res.ok ? res.json() : { available: true }))
      .then((data: { available?: boolean }) => {
        if (!cancelled) {
          setBlobAvailable(data.available !== false);
        }
      })
      .catch(() => {
        // On client-side fetch failure, don't show a false alarm.
        if (!cancelled) setBlobAvailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [skill.blobId]);

  return (
    <article className="max-w-full overflow-hidden border-2 border-pure-black bg-white p-4 sm:p-6 neo-shadow">
      {/* Row 1: identity — matches MVR flex-col → md:row */}
      <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4 min-[900px]:max-w-[calc(100%-15rem)] min-[900px]:flex-1">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center border-2 border-pure-black sm:h-16 sm:w-16 ${iconBg[skill.icon]} ${skill.icon === "wallet" ? "opacity-70" : ""}`}
          >
            <Icon className="h-7 w-7 sm:h-8 sm:w-8" />
          </div>

          <div className="min-w-0 flex-1 overflow-hidden">
            <h3 className="font-display text-lg font-semibold leading-tight break-words sm:text-xl">
              {skill.name}
            </h3>
            <p className="mt-0.5 font-mono text-xs leading-snug break-all text-on-surface-variant sm:text-sm">
              {skill.mvrPackage}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex shrink-0 px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                  skill.network === "mainnet"
                    ? "bg-pure-black text-off-white"
                    : "bg-on-surface-variant text-off-white"
                }`}
              >
                {skill.network}
              </span>
              <span className="inline-flex shrink-0 border border-pure-black px-2 py-0.5 font-mono text-[10px] font-bold uppercase">
                {skill.version}
              </span>
              <span
                className={`inline-flex shrink-0 border-2 border-pure-black px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${source.className}`}
                title={`Source: ${source.label}`}
              >
                {source.label}
              </span>
              {isPrivate && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 border-2 border-pure-black bg-soft-lavender px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-pure-black"
                  title={`Private skill — seal policy ${skill.sealPolicyId}`}
                >
                  <span aria-hidden="true">🔒</span>
                  Private
                  <span className="font-normal normal-case">{groupName}</span>
                </span>
              )}
            </div>

            <div className="mt-2 flex min-w-0 items-center gap-2 font-mono text-xs text-on-surface-variant sm:text-sm">
              <a
                href={suiObjectUrl(skill.network, skill.objectIdFull)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-electric-purple hover:underline"
                title="View object on Sui explorer"
              >
                {skill.objectId}
              </a>
              <button
                type="button"
                onClick={copyId}
                className="shrink-0 p-0.5 text-on-surface-variant transition-colors hover:text-electric-purple"
                aria-label="Copy object ID"
              >
                <IconCopy />
              </button>
              {copied && (
                <span className="shrink-0 text-xs text-green-800">Copied</span>
              )}
            </div>

            <div className="mt-1 flex min-w-0 items-center gap-2 font-mono text-xs text-on-surface-variant sm:text-sm">
              <span className="shrink-0 font-bold text-pure-black/40">
                BLOB
              </span>
              {skill.blobId ? (
                <a
                  href={walrusBlobUrl(skill.network, skill.blobId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate text-electric-purple hover:underline"
                  title="View manifest blob on Walrus explorer"
                >
                  {skill.blobId}
                </a>
              ) : (
                <span className="min-w-0 truncate italic">not uploaded</span>
              )}
            </div>
            {skill.blobId && blobAvailable === false && (
              <div
                role="alert"
                className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-xs font-bold text-red-700 sm:text-sm"
              >
                <span aria-hidden="true">⚠</span>
                <span className="truncate">Manifest blob unavailable</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions — full width until wide; then fixed column on the right */}
        <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 min-[900px]:w-56 min-[900px]:shrink-0 min-[900px]:grid-cols-1">
          <button
            type="button"
            className="flex min-h-[44px] w-full min-w-0 items-center justify-center gap-2 border-2 border-pure-black px-3 py-2 font-mono text-xs font-bold sm:text-sm transition-colors hover:bg-surface-container"
          >
            <IconEdit className="h-4 w-4 shrink-0" />
            <span className="truncate">Edit Metadata</span>
          </button>
          <PublishUpgradeButton skill={skill} />
        </div>
      </div>

      {/* Row 2: stats */}
      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-pure-black/10 pt-4 min-[480px]:grid-cols-2 xl:grid-cols-4 sm:mt-6 sm:pt-6">
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-xs font-bold text-pure-black/40 sm:text-sm">
            STATUS
          </span>
          {active ? (
            <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-green-600 sm:text-sm">
              <span className="h-2 w-2 shrink-0 rounded-full bg-green-600" />
              ACTIVE
            </span>
          ) : (
            <span className="font-mono text-xs font-bold text-on-surface-variant sm:text-sm">
              ARCHIVED
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-xs font-bold text-pure-black/40 sm:text-sm">
            RESOLUTIONS
          </span>
          <span className="font-mono text-xs font-bold sm:text-sm">
            {skill.resolutions}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-xs font-bold text-pure-black/40 sm:text-sm">
            LAST UPDATED
          </span>
          <span className="truncate font-mono text-xs font-bold sm:text-sm">
            {skill.lastUpdated}
          </span>
        </div>
        <div className="flex items-center min-[480px]:justify-end xl:justify-end">
          <button
            type="button"
            onClick={() => setConsoleOpen(!consoleOpen)}
            className={`font-mono text-xs font-bold decoration-2 underline-offset-4 hover:underline sm:text-sm ${
              active ? "text-electric-purple" : "text-on-surface-variant"
            }`}
          >
            {consoleOpen
              ? "Close Console ×"
              : active
                ? "Run →"
                : "View Records →"}
          </button>
        </div>
      </div>
      {consoleOpen && (
        <div className="mt-4">
          <SkillExecutionConsole
            skill={skill}
            onClose={() => setConsoleOpen(false)}
          />
        </div>
      )}
    </article>
  );
}
