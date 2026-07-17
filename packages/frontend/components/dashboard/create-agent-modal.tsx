"use client";

import {
  ConnectButton,
  useCurrentAccount,
  useCurrentWallet,
  useSignAndExecuteTransaction,
  useSignTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { explorerObjectUrl, explorerTxUrl } from "../../lib/explorer-links";
import {
  getAgentosPackageId,
  getSuiNetwork,
  isEnokiConfigured,
  isEnokiSponsorEnabled,
} from "../../lib/enoki-config";
import { buildCreatePassportTx } from "../../lib/passport-tx";
import { resolvePassportFromDigest } from "../../lib/passport-mint-result";
import { sponsorCreatePassport } from "../../lib/sponsor-passport";
import { buildBindAndMintPassportTx } from "../../lib/suins-bind-tx";
import {
  isValidSuinsNameInput,
  listOwnedSuinsNames,
  normalizeSuinsInput,
  suinsStatusLabel,
  verifySuinsForWallet,
  type SuinsVerification,
} from "../../lib/suins-helpers";
import { WizardStepIndicator } from "./wizard-steps";

type NamePath = "new" | "own";
type MintProgress = "idle" | "preparing" | "awaiting-signature" | "confirming";

const MINT_PROGRESS_LABEL: Record<Exclude<MintProgress, "idle">, string> = {
  preparing: "Preparing transaction…",
  "awaiting-signature": "Approve the transaction in your wallet…",
  confirming: "Transaction sent — confirming on-chain…",
};

type MintSuccess = {
  slug: string;
  suinsName: string;
  mintedOnChain: boolean;
  sponsored: boolean;
  digest?: string;
  passportObjectId?: string;
};

export type CreateAgentModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  initialPath?: NamePath;
  initialRuntimeWallet?: string;
  initialName?: string;
};

const SUINS_BUY_URL = "https://suins.io";

export function CreateAgentModal({
  open,
  onClose,
  onCreated,
  initialPath = "own",
  initialRuntimeWallet = "",
  initialName = "",
}: CreateAgentModalProps) {
  const router = useRouter();
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const account = useCurrentAccount();
  const { currentWallet } = useCurrentWallet();
  const suiClient = useSuiClient();
  const network = getSuiNetwork();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { mutateAsync: signTransaction } = useSignTransaction();

  const [namePath, setNamePath] = useState<NamePath>(initialPath);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [runtimeWallet, setRuntimeWallet] = useState(initialRuntimeWallet);
  const [useConnectedAsRuntime, setUseConnectedAsRuntime] =
    useState(!initialRuntimeWallet);
  const [ownedNames, setOwnedNames] = useState<string[]>([]);
  const [loadingNames, setLoadingNames] = useState(false);
  const [checkingSuins, setCheckingSuins] = useState(false);
  const [verification, setVerification] = useState<SuinsVerification | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [mintProgress, setMintProgress] = useState<MintProgress>("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<MintSuccess | null>(null);
  const [step, setStep] = useState<"connect" | "name" | "review" | "success">(
    "connect",
  );
  const [claimStatus, setClaimStatus] = useState<
    | "idle"
    | "checking"
    | "available"
    | "taken"
    | "error"
    | "claiming"
    | "claimed"
  >("idle");

  const suinsName = normalizeSuinsInput(name);
  const nameValid = isValidSuinsNameInput(name);
  const packageId = getAgentosPackageId();
  const effectiveRuntime =
    useConnectedAsRuntime && account?.address
      ? account.address
      : runtimeWallet.trim();

  const suinsReady =
    namePath === "own" &&
    verification?.registered &&
    verification.ownedByWallet &&
    !verification.expired;

  // Auto-advance step when wallet connects
  useEffect(() => {
    if (step === "connect" && account?.address) {
      setStep("name");
    }
  }, [step, account?.address]);

  const resetForm = useCallback(() => {
    setName(initialName);
    setDescription("");
    setRuntimeWallet(initialRuntimeWallet);
    setUseConnectedAsRuntime(!initialRuntimeWallet);
    setNamePath(initialPath);
    setOwnedNames([]);
    setVerification(null);
    setMintProgress("idle");
    setError(null);
    setSuccess(null);
    setStep("connect");
  }, [initialName, initialPath, initialRuntimeWallet]);

  const handleClose = useCallback(() => {
    if (submitting) return;
    resetForm();
    onClose();
  }, [onClose, resetForm, submitting]);

  const goToManageSkills = useCallback(() => {
    if (!success?.slug) return;
    const slug = success.slug;
    resetForm();
    onClose();
    router.push(`/agent/${encodeURIComponent(slug)}`);
  }, [success, resetForm, onClose, router]);

  useEffect(() => {
    if (!open) {
      setSuccess(null);
      return;
    }
    setNamePath(initialPath);
    setName(initialName);
    setRuntimeWallet(initialRuntimeWallet);
    setUseConnectedAsRuntime(!initialRuntimeWallet);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, handleClose, initialPath, initialName, initialRuntimeWallet]);

  useEffect(() => {
    if (!open || namePath !== "own" || !account?.address) {
      setOwnedNames([]);
      return;
    }

    let cancelled = false;
    setLoadingNames(true);
    listOwnedSuinsNames(suiClient as never, account.address, network)
      .then((names) => {
        if (!cancelled) setOwnedNames(names);
      })
      .catch(() => {
        if (!cancelled) setOwnedNames([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingNames(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, namePath, account?.address, suiClient, network]);

  useEffect(() => {
    if (
      !open ||
      namePath !== "own" ||
      !nameValid ||
      !account?.address ||
      !effectiveRuntime
    ) {
      setVerification(null);
      return;
    }

    let cancelled = false;
    setCheckingSuins(true);
    verifySuinsForWallet({
      client: suiClient as never,
      network,
      name: suinsName,
      walletAddress: account.address,
      runtimeWallet: effectiveRuntime,
    })
      .then((result) => {
        if (!cancelled) setVerification(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setVerification({
            name: suinsName,
            registered: false,
            ownedByWallet: false,
            expired: false,
            targetAddress: null,
            runtimeWallet: effectiveRuntime,
            targetMatchesRuntime: false,
            nftId: null,
            expirationTimestampMs: null,
            lookupError:
              err instanceof Error ? err.message : "Unknown SuiNS lookup error",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingSuins(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    namePath,
    nameValid,
    suinsName,
    account?.address,
    effectiveRuntime,
    suiClient,
    network,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account?.address || !effectiveRuntime) return;
    if (namePath === "own" && !suinsReady) return;
    if (namePath === "new") return;

    setSubmitting(true);
    setMintProgress("preparing");
    setError(null);

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suinsName,
          runtimeWallet: effectiveRuntime,
          network,
          description: description.trim() || undefined,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        agent?: { slug: string };
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Register failed (${res.status})`);
      }

      let mintDigest: string | undefined;
      let passportObjectId: string | undefined;
      let mintedOnChain = false;
      let wasSponsoredMint = false;

      if (packageId && verification?.nftId) {
        try {
          const needsBind = !verification.targetMatchesRuntime;
          const transaction = needsBind
            ? buildBindAndMintPassportTx({
                suiClient: suiClient as never,
                network,
                packageId,
                suinsName,
                runtimeWallet: effectiveRuntime,
                nftId: verification.nftId,
                needsBind,
                recipient: account.address,
              })
            : buildCreatePassportTx({
                packageId,
                suinsName,
                runtimeWallet: effectiveRuntime,
                recipient: account.address,
              });

          setMintProgress("awaiting-signature");
          if (isEnokiSponsorEnabled()) {
            const sponsored = await sponsorCreatePassport({
              suiClient: suiClient as never,
              packageId,
              suinsName,
              runtimeWallet: effectiveRuntime,
              wallet: currentWallet ?? null,
              signTransaction,
              prebuiltTransaction: transaction,
            });
            mintDigest = sponsored.digest;
            wasSponsoredMint = true;
          } else {
            const result = await signAndExecute({
              transaction: transaction as never,
            });
            mintDigest = result.digest;
          }

          if (mintDigest) {
            // A digest means the wallet submitted the transaction. Do not keep
            // the wizard in loading state indefinitely just because RPC object
            // indexing is slow; Step 4 can show the digest immediately.
            mintedOnChain = true;
            setMintProgress("confirming");
            try {
              const resolved = await resolvePassportFromDigest(
                suiClient as never,
                mintDigest,
                packageId,
              );
              passportObjectId = resolved.passportObjectId;
            } catch (resolveErr) {
              console.warn(
                "Transaction submitted, but Passport object was not resolved yet.",
                resolveErr,
              );
            }
          }
        } catch (mintErr) {
          console.warn("On-chain mint failed; registry saved.", mintErr);
        }
      }

      const slug = data.agent?.slug;
      if (!slug) {
        throw new Error("Agent registered but slug missing from response");
      }

      onCreated?.();
      setSuccess({
        slug,
        suinsName,
        mintedOnChain,
        sponsored: wasSponsoredMint,
        digest: mintDigest,
        passportObjectId,
      });
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create agent");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="absolute inset-0 bg-pure-black/40 backdrop-blur-[2px]"
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto border-2 border-pure-black bg-off-white neo-shadow-lg"
      >
        <div className="flex items-start justify-between border-b-2 border-pure-black bg-electric-purple px-6 py-4 text-off-white">
          <div>
            <div className="mb-1">
              <WizardStepIndicator current={step} />
            </div>
            <h2
              id={titleId}
              className="font-display text-2xl font-bold uppercase"
            >
              {step === "success"
                ? "Agent Created"
                : step === "connect"
                  ? "Connect Wallet"
                  : step === "name"
                    ? "Choose Name"
                    : "Review & Mint"}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="border-2 border-off-white px-2 py-1 font-mono text-sm font-bold transition-colors hover:bg-off-white hover:text-pure-black disabled:opacity-50"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="space-y-6 p-6">
            <div className="border-2 border-green-800 bg-green-50 px-4 py-4">
              <p className="font-display text-lg font-bold text-green-900">
                Passport ready
              </p>
              {success.sponsored && (
                <span className="mt-1 inline-block border-2 border-electric-purple bg-electric-purple/10 px-2 py-0.5 font-mono text-[10px] font-bold text-electric-purple">
                  ⚡ Gas sponsored
                </span>
              )}
              <p className="mt-2 font-mono text-sm text-green-900/90">
                <span className="font-bold">{success.suinsName}</span> is
                registered in your workspace
                {success.mintedOnChain ? " and minted on-chain." : "."}
              </p>
              {!success.mintedOnChain && (
                <p className="mt-2 font-mono text-xs text-on-surface-variant">
                  Registry saved. On-chain mint did not complete — you can retry
                  from the agent page later.
                </p>
              )}
            </div>

            {success.mintedOnChain && success.digest && (
              <div className="space-y-2 font-mono text-xs">
                <p className="font-bold uppercase text-electric-purple">
                  On-chain
                </p>
                <a
                  href={explorerTxUrl(network, success.digest)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block break-all border-2 border-pure-black bg-white px-3 py-2 font-bold text-vibrant-blue underline-offset-2 hover:underline"
                >
                  View transaction on Suiscan →
                </a>
                {success.passportObjectId && (
                  <a
                    href={explorerObjectUrl(network, success.passportObjectId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block break-all border-2 border-pure-black bg-white px-3 py-2 font-bold text-vibrant-blue underline-offset-2 hover:underline"
                  >
                    View AgentPassport object →
                  </a>
                )}
              </div>
            )}

            {/* Shareable agent URL */}
            <div className="space-y-2">
              <p className="font-mono text-xs font-bold uppercase text-electric-purple">
                Share this agent
              </p>
              <div className="flex items-center gap-2 border-2 border-pure-black bg-white px-3 py-2">
                <code className="flex-1 break-all font-mono text-xs font-bold text-on-surface">
                  {typeof window !== "undefined" ? window.location.origin : ""}
                  /agent/
                  {encodeURIComponent(success.suinsName.replace(/\.sui$/, ""))}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/agent/${encodeURIComponent(success!.suinsName.replace(/\.sui$/, ""))}`;
                    navigator.clipboard?.writeText(url);
                  }}
                  className="shrink-0 border-2 border-pure-black bg-surface-container px-2 py-1 font-mono text-[10px] font-bold transition-colors hover:bg-soft-lavender"
                  aria-label="Copy share URL"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="border-2 border-pure-black bg-white px-6 py-3 font-mono text-sm font-bold transition-colors hover:bg-surface-container"
              >
                Stay on dashboard
              </button>
              <button
                type="button"
                onClick={goToManageSkills}
                className="border-2 border-pure-black bg-electric-purple px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all active:translate-x-0.5 active:translate-y-0.5"
              >
                Manage skills →
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 p-6">
            <p
              id={descId}
              className="font-mono text-sm text-on-surface-variant"
            >
              Connect your wallet, choose how you get a SuiNS name, then mint an
              AgentPassport on {network}.
            </p>

            {/* Step: Connect — show Google zkLogin option when Enoki is configured */}
            {step === "connect" && isEnokiConfigured() && (
              <div className="border-2 border-electric-purple bg-electric-purple/5 p-4">
                <p className="mb-3 font-mono text-xs font-bold uppercase text-electric-purple">
                  No seed phrase needed
                </p>
                <p className="mb-4 font-mono text-sm text-on-surface-variant">
                  Sign in with Google to create a gasless, seedless agent wallet
                  via zkLogin.
                </p>
                <div className="[&_button]:!w-full [&_button]:!font-mono [&_button]:!text-sm [&_button]:!font-bold [&_button]:!border-2 [&_button]:!border-pure-black [&_button]:!neo-shadow">
                  <ConnectButton />
                </div>
                <p className="mt-3 text-center font-mono text-[10px] text-on-surface-variant">
                  Google zkLogin (Enoki) — or connect any Sui wallet below
                </p>
              </div>
            )}

            {!account?.address && (
              <p className="border-2 border-error bg-red-50 px-3 py-2 font-mono text-xs text-error">
                Connect a wallet to check SuiNS names in your wallet and mint a
                passport.
              </p>
            )}

            {error && (
              <p className="border-2 border-error bg-red-50 px-3 py-2 font-mono text-xs text-error">
                {error}
              </p>
            )}

            {submitting && mintProgress !== "idle" && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-3 border-2 border-electric-purple bg-electric-purple/10 px-4 py-3 font-mono text-sm font-bold text-electric-purple"
              >
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-electric-purple border-t-transparent"
                  aria-hidden
                />
                <span>{MINT_PROGRESS_LABEL[mintProgress]}</span>
              </div>
            )}

            <fieldset className="space-y-3">
              <legend className="font-mono text-sm font-bold uppercase">
                SuiNS
              </legend>
              <label className="flex cursor-pointer items-start gap-3 border-2 border-pure-black bg-white p-3 font-mono text-sm">
                <input
                  type="radio"
                  name="name-path"
                  checked={namePath === "own"}
                  onChange={() => setNamePath("own")}
                  className="mt-1"
                />
                <span>
                  <span className="font-bold">I already own a name</span>
                  <span className="mt-1 block text-xs text-on-surface-variant">
                    Pick from your wallet or enter a name — we verify ownership
                    on-chain.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 border-2 border-pure-black bg-white p-3 font-mono text-sm">
                <input
                  type="radio"
                  name="name-path"
                  checked={namePath === "new"}
                  onChange={() => setNamePath("new")}
                  className="mt-1"
                />
                <span>
                  <span className="font-bold">Get a new .sui name</span>
                  <span className="mt-1 block text-xs text-on-surface-variant">
                    Register on suins.io, set target to your runtime address,
                    then return here.
                  </span>
                </span>
              </label>
            </fieldset>

            {namePath === "new" && (
              <div className="space-y-4 border-2 border-pure-black bg-surface-container p-4 font-mono text-sm">
                <p className="font-bold uppercase text-electric-purple">
                  Claim a .sui name in-app
                </p>
                <div className="space-y-2">
                  <label
                    htmlFor="new-name-input"
                    className="text-xs font-bold uppercase text-on-surface-variant"
                  >
                    Choose a name
                  </label>
                  <div className="flex border-2 border-pure-black bg-white">
                    <span className="border-r-2 border-pure-black bg-surface-container px-3 py-2 text-xs font-bold text-on-surface-variant">
                      @
                    </span>
                    <input
                      id="new-name-input"
                      type="text"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setClaimStatus("idle");
                      }}
                      placeholder="my-agent"
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                    />
                    <button
                      type="button"
                      disabled={!name.trim() || claimStatus === "checking"}
                      onClick={async () => {
                        if (!name.trim()) return;
                        setClaimStatus("checking");
                        const { checkSuinsAvailability } =
                          await import("../../lib/suins-claim");
                        const result = await checkSuinsAvailability({
                          client: suiClient,
                          network,
                          name: name.trim(),
                        });
                        setClaimStatus(
                          result === "available"
                            ? "available"
                            : result === "taken"
                              ? "taken"
                              : "error",
                        );
                      }}
                      className="border-l-2 border-pure-black bg-electric-purple px-3 py-2 text-xs font-bold text-off-white disabled:opacity-50"
                    >
                      {claimStatus === "checking" ? "…" : "Check"}
                    </button>
                  </div>
                  {/* Status */}
                  <div
                    className={`px-3 py-2 text-xs font-bold ${
                      claimStatus === "available"
                        ? "border-2 border-green-800 bg-green-50 text-green-900"
                        : claimStatus === "taken"
                          ? "border-2 border-error bg-red-50 text-error"
                          : claimStatus === "claimed"
                            ? "border-2 border-green-800 bg-green-50 text-green-900"
                            : claimStatus === "claiming"
                              ? "border-2 border-pure-black bg-white text-on-surface-variant"
                              : "text-on-surface-variant"
                    }`}
                  >
                    {claimStatus === "idle" &&
                      "Enter a name and check availability."}
                    {claimStatus === "checking" && "Checking on-chain…"}
                    {claimStatus === "available" &&
                      `✓ "${name.trim()}" is available!`}
                    {claimStatus === "taken" &&
                      `✗ "${name.trim()}" is already taken.`}
                    {claimStatus === "error" && "Could not check — try again."}
                    {claimStatus === "claiming" && "Minting name on-chain…"}
                    {claimStatus === "claimed" &&
                      `✓ Name claimed! Proceeding to mint…`}
                  </div>
                </div>
                {/* Claim button */}
                {claimStatus === "available" && effectiveRuntime && (
                  <button
                    type="button"
                    onClick={async () => {
                      setClaimStatus("claiming");
                      try {
                        const { claimSuinsName } =
                          await import("../../lib/suins-claim");
                        const result = await claimSuinsName({
                          name: name.trim(),
                          targetAddress: effectiveRuntime,
                        });
                        setName(result.suinsName.replace(/\.sui$/, ""));
                        setClaimStatus("claimed");
                        // Auto-switch to "own" path and advance to review
                        setNamePath("own");
                        setStep("review");
                      } catch (err) {
                        setError(
                          err instanceof Error ? err.message : "Claim failed",
                        );
                        setClaimStatus("error");
                      }
                    }}
                    className="w-full border-2 border-pure-black bg-electric-purple px-4 py-3 font-bold text-off-white neo-shadow transition-all hover:-translate-x-0.5 hover:-translate-y-0.5"
                  >
                    Claim &quot;{name.trim()}.sui&quot; →
                  </button>
                )}
                {/* Advanced: manual suins.io fallback */}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-on-surface-variant hover:text-pure-black">
                    Advanced: bring your own name from suins.io
                  </summary>
                  <div className="mt-2 space-y-2 text-xs text-on-surface-variant">
                    <p>
                      Register on{" "}
                      <a
                        href={SUINS_BUY_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-electric-purple underline"
                      >
                        suins.io
                      </a>
                      , set target to:
                    </p>
                    <code className="block break-all border border-pure-black bg-white px-2 py-1">
                      {effectiveRuntime || "Connect wallet first"}
                    </code>
                    <p>Then switch to &quot;I already own a name&quot;.</p>
                  </div>
                </details>
              </div>
            )}

            {namePath === "own" && (
              <>
                {account?.address && (
                  <div className="space-y-2">
                    <label
                      htmlFor="owned-suins"
                      className="font-mono text-sm font-bold uppercase"
                    >
                      Names in your wallet
                    </label>
                    <select
                      id="owned-suins"
                      value={ownedNames.includes(suinsName) ? suinsName : ""}
                      onChange={(e) => setName(e.target.value)}
                      disabled={loadingNames || ownedNames.length === 0}
                      className="w-full border-2 border-pure-black bg-white px-3 py-3 font-mono text-sm outline-none neo-shadow"
                    >
                      <option value="">
                        {loadingNames
                          ? "Loading…"
                          : ownedNames.length === 0
                            ? "No SuiNS names found in this wallet"
                            : "Select a name"}
                      </option>
                      {ownedNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-2">
                  <label
                    htmlFor="agent-suins"
                    className="font-mono text-sm font-bold uppercase"
                  >
                    Or enter name
                  </label>
                  <div className="flex border-2 border-pure-black bg-white neo-shadow focus-within:neo-shadow-lg">
                    <span className="border-r-2 border-pure-black bg-surface-container px-3 py-3 font-mono text-sm font-bold text-on-surface-variant">
                      @
                    </span>
                    <input
                      id="agent-suins"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="my-agent.sui"
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-sm outline-none placeholder:text-on-surface-variant/60"
                    />
                  </div>
                </div>

                {(checkingSuins ||
                  (name.length > 0 && !nameValid) ||
                  verification) && (
                  <div
                    className={`border-2 px-3 py-2 font-mono text-xs ${
                      suinsReady
                        ? "border-green-800 bg-green-50 text-green-900"
                        : verification?.lookupError ||
                            (name.length > 0 && !nameValid)
                          ? "border-error/40 bg-red-50 text-error"
                          : "border-pure-black bg-surface-container text-on-surface-variant"
                    }`}
                  >
                    {checkingSuins
                      ? "Checking SuiNS on-chain…"
                      : name.length > 0 && !nameValid
                        ? "Enter a valid name ending in .sui"
                        : suinsStatusLabel(verification)}
                  </div>
                )}

                <fieldset className="space-y-2">
                  <legend className="font-mono text-sm font-bold uppercase">
                    Runtime wallet
                  </legend>
                  <label className="flex items-center gap-2 font-mono text-xs">
                    <input
                      type="radio"
                      checked={useConnectedAsRuntime}
                      onChange={() => setUseConnectedAsRuntime(true)}
                    />
                    Same as connected wallet
                  </label>
                  <label className="flex items-center gap-2 font-mono text-xs">
                    <input
                      type="radio"
                      checked={!useConnectedAsRuntime}
                      onChange={() => setUseConnectedAsRuntime(false)}
                    />
                    Dedicated agent address (from terminal)
                  </label>
                  {!useConnectedAsRuntime && (
                    <input
                      type="text"
                      value={runtimeWallet}
                      onChange={(e) => setRuntimeWallet(e.target.value)}
                      placeholder="0x…"
                      className="w-full border-2 border-pure-black bg-white px-3 py-2 font-mono text-xs outline-none"
                    />
                  )}
                </fieldset>
              </>
            )}

            {namePath === "own" && (
              <div className="space-y-2">
                <label
                  htmlFor="agent-desc"
                  className="font-mono text-sm font-bold uppercase"
                >
                  Description{" "}
                  <span className="font-normal text-on-surface-variant">
                    (optional)
                  </span>
                </label>
                <textarea
                  id="agent-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What does this agent do?"
                  className="w-full resize-none border-2 border-pure-black bg-white px-3 py-3 font-mono text-sm outline-none neo-shadow placeholder:text-on-surface-variant/60 focus:neo-shadow-lg"
                />
              </div>
            )}

            {namePath === "own" && (
              <div className="border-2 border-pure-black bg-surface-container p-4 font-mono text-xs">
                <div className="mb-2 font-bold uppercase text-electric-purple">
                  On submit
                </div>
                <ul className="list-inside list-disc space-y-1 text-on-surface-variant">
                  <li>Verify SuiNS owned by connected wallet</li>
                  <li>
                    {verification && !verification.targetMatchesRuntime
                      ? "Bind name target → runtime wallet (on-chain tx)"
                      : "Skip bind — target already matches runtime"}
                  </li>
                  <li>Save agent to workspace registry</li>
                  <li>
                    {packageId
                      ? "Mint AgentPassport on testnet"
                      : "On-chain mint when package ID is configured"}
                  </li>
                </ul>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="border-2 border-pure-black bg-white px-6 py-3 font-mono text-sm font-bold transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                Cancel
              </button>
              {namePath === "own" ? (
                <button
                  type="submit"
                  disabled={
                    !suinsReady ||
                    !account?.address ||
                    !effectiveRuntime ||
                    submitting ||
                    checkingSuins
                  }
                  className="border-2 border-pure-black bg-electric-purple px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all active:translate-x-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                >
                  {submitting
                    ? MINT_PROGRESS_LABEL[mintProgress === "idle" ? "preparing" : mintProgress]
                    : "Mint Passport"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setNamePath("own")}
                  className="border-2 border-pure-black bg-electric-purple px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow"
                >
                  I registered — bind now
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
