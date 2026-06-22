"use client";

import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import type { SkillManifest } from "@agentos-sui/sdk";
import { Transaction } from "@mysten/sui/transactions";
import { useRef, useState } from "react";

import type { AgentSkillRow } from "../../lib/agent-types";
import { getAgentosPackageId } from "../../lib/enoki-config";
import { explorerTxUrl } from "../../lib/explorer-links";
import { IconPublish } from "./icons";

type UpgradeState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "signing" }
  | { kind: "success"; digest: string }
  | { kind: "error"; message: string };

type UploadResponse = { blobId: string; manifestHash: string; error?: string };

/**
 * "Publish Upgrade" button (Requirement 15.4). Selecting a new manifest JSON
 * uploads it to Walrus through the server `/api/skills/upload` route (which
 * holds the Harbor key), then builds a `skill_descriptor::update` transaction
 * and signs + executes it with the connected wallet via dapp-kit.
 */
export function PublishUpgradeButton({ skill }: { skill: AgentSkillRow }) {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UpgradeState>({ kind: "idle" });

  const packageId = getAgentosPackageId();
  const walletConnected = Boolean(account?.address);
  const busy = state.kind === "uploading" || state.kind === "signing";

  const openPicker = () => {
    if (busy || !walletConnected) return;
    setState({ kind: "idle" });
    fileInputRef.current?.click();
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so selecting the same file again re-triggers the change event.
    event.target.value = "";
    if (!file) return;

    if (!account?.address) {
      setState({ kind: "error", message: "Connect a wallet to publish." });
      return;
    }
    if (!packageId) {
      setState({
        kind: "error",
        message: "AgentOS package id not configured.",
      });
      return;
    }

    let manifest: SkillManifest;
    try {
      manifest = JSON.parse(await file.text()) as SkillManifest;
    } catch {
      setState({ kind: "error", message: "Selected file is not valid JSON." });
      return;
    }

    // 1. Upload the new manifest to Walrus via the server route.
    setState({ kind: "uploading" });
    let upload: UploadResponse;
    try {
      const res = await fetch("/api/skills/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest }),
      });
      upload = (await res.json()) as UploadResponse;
      if (!res.ok || !upload.blobId) {
        throw new Error(upload.error ?? "Manifest upload failed");
      }
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Manifest upload failed",
      });
      return;
    }

    // 2. Build the on-chain update transaction and sign it with the wallet.
    // The `skill_descriptor::update` move call is inlined here (rather than
    // imported from the `@agentos-sui/sdk` barrel) to keep the browser bundle free
    // of the SDK's Node-only modules (config/registry use `node:fs`).
    setState({ kind: "signing" });
    try {
      const tx = new Transaction();
      const encode = (value: string) =>
        Array.from(new TextEncoder().encode(value));
      tx.moveCall({
        target: `${packageId}::skill_descriptor::update`,
        arguments: [
          tx.object(skill.objectIdFull),
          tx.pure.vector("u8", encode(upload.blobId)),
          tx.pure.vector("u8", encode(upload.manifestHash)),
          tx.pure.vector("u8", encode(manifest.version ?? skill.version)),
        ],
      });
      const result = await signAndExecute({ transaction: tx as never });
      setState({ kind: "success", digest: result.digest });
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Wallet transaction failed",
      });
    }
  };

  const label =
    state.kind === "uploading"
      ? "Uploading…"
      : state.kind === "signing"
        ? "Confirm in wallet…"
        : "Publish Upgrade";

  return (
    <div className="min-w-0">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={busy || !walletConnected}
        title={
          walletConnected
            ? "Upload a new manifest and update this skill on-chain"
            : "Connect a wallet to publish an upgrade"
        }
        className="flex min-h-[44px] w-full min-w-0 items-center justify-center gap-2 border-2 border-pure-black bg-electric-purple px-3 py-2 font-mono text-xs font-bold text-off-white sm:text-sm transition-colors hover:bg-pure-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        <IconPublish className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </button>

      {!walletConnected && (
        <p className="mt-1 font-mono text-[10px] text-on-surface-variant">
          Connect a wallet to publish.
        </p>
      )}

      {state.kind === "success" && (
        <p className="mt-1 break-all font-mono text-[10px] font-bold text-green-700">
          Upgraded ·{" "}
          <a
            href={explorerTxUrl(skill.network, state.digest)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-electric-purple hover:underline"
          >
            view tx
          </a>
        </p>
      )}

      {state.kind === "error" && (
        <p className="mt-1 break-words font-mono text-[10px] font-bold text-red-700">
          {state.message}
        </p>
      )}
    </div>
  );
}
