"use client";

import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { getSuiNetwork, isEnokiConfigured } from "../../lib/enoki-config";
import type { AgentCardData } from "./agent-card";

// ===== Step indicator =====
// Connect wallet → Configure (pick agent + name) → Ready (canvas).

type WorkflowStep = "connect" | "configure" | "ready";

const WF_STEPS: { id: WorkflowStep; label: string }[] = [
  { id: "connect", label: "Connect" },
  { id: "configure", label: "Configure" },
  { id: "ready", label: "Ready" },
];

function WorkflowStepIndicator({ current }: { current: WorkflowStep }) {
  const currentIdx = WF_STEPS.findIndex((s) => s.id === current);
  return (
    <div
      className="flex items-center gap-0"
      aria-label="Workflow setup progress"
    >
      {WF_STEPS.map((step, i) => {
        const isActive = i === currentIdx;
        const isCompleted = i < currentIdx;
        return (
          <div key={step.id} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 px-3 py-1 font-mono text-[10px] font-bold uppercase ${
                isActive
                  ? "border-2 border-white bg-white/20 text-white"
                  : isCompleted
                    ? "border-2 border-white/60 bg-white/10 text-white/80"
                    : "border-2 border-white/20 bg-transparent text-white/40"
              }`}
              aria-current={isActive ? "step" : undefined}
            >
              {isCompleted ? "✓" : i + 1}
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < WF_STEPS.length - 1 && (
              <div
                className={`h-0.5 w-4 sm:w-6 ${i < currentIdx ? "bg-white/60" : "bg-white/20"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===== Helpers =====

/** Sanitize a free-text workflow name into a SuiNS label (a-z0-9-, no edges). */
function toLabel(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Format a workflow's fully-qualified SuiNS subname `label.agent.sui`.
 * Inlined (instead of importing the SDK's `formatSkillSubname`) so this client
 * component never pulls the Node-only SDK entry (which bundles `node:fs`).
 */
function formatSubname(label: string, agentName: string): string {
  const skill = label.trim().replace(/^\.+|\.+$/g, "");
  let agent = agentName.trim().replace(/^\.+|\.+$/g, "");
  if (!agent.endsWith(".sui")) agent = `${agent}.sui`;
  return `${skill}.${agent}`;
}

type WorkflowReady = {
  slug: string;
  suinsName: string;
  /** True when the SuiNS subname was minted via Enoki (best-effort). */
  subnameMinted: boolean;
};

export type CreateWorkflowModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  /** Opens the Create Agent Passport flow when the user has no agents yet. */
  onRequestCreateAgent?: () => void;
};

export function CreateWorkflowModal({
  open,
  onClose,
  onCreated,
  onRequestCreateAgent,
}: CreateWorkflowModalProps) {
  const router = useRouter();
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const account = useCurrentAccount();
  const network = getSuiNetwork();

  const [agents, setAgents] = useState<AgentCardData[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentSlug, setAgentSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<WorkflowReady | null>(null);
  const [step, setStep] = useState<WorkflowStep>("connect");

  const selectedAgent = agents.find((a) => a.slug === agentSlug);
  const agentSuins =
    selectedAgent?.suinsName ?? (agentSlug ? `${agentSlug}.sui` : "");
  const label = toLabel(name);
  const previewSubname =
    label && agentSuins ? formatSubname(label, agentSuins) : "";
  const canSubmit =
    Boolean(account?.address) && Boolean(agentSlug) && label.length >= 2;

  const resetForm = useCallback(() => {
    setAgentSlug("");
    setName("");
    setDescription("");
    setError(null);
    setReady(null);
    setStep("connect");
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    resetForm();
    onClose();
  }, [onClose, resetForm, submitting]);

  const goToCanvas = useCallback(() => {
    if (!ready?.slug) return;
    const slug = ready.slug;
    resetForm();
    onClose();
    router.push(`/create/${encodeURIComponent(slug)}?onboarding=1`);
  }, [ready, resetForm, onClose, router]);

  // Auto-advance once a wallet connects.
  useEffect(() => {
    if (step === "connect" && account?.address) setStep("configure");
  }, [step, account?.address]);

  // Load the user's existing agents to pick from.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingAgents(true);
    fetch("/api/agents", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { agents?: AgentCardData[] }) => {
        if (cancelled) return;
        const list = data.agents ?? [];
        setAgents(list);
        // Preselect the only agent for a one-click flow.
        if (list.length === 1) setAgentSlug(list[0].slug);
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAgents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Open/close side effects.
  useEffect(() => {
    if (!open) {
      setReady(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, handleClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !account?.address) return;

    setSubmitting(true);
    setError(null);

    try {
      // 1. Best-effort: mint the SuiNS subname via Enoki. The canonical record
      //    name stays agent-scoped (`label.agent.sui`) regardless of the Enoki
      //    parent domain — mirroring how skill publishing tracks the subname
      //    even when the on-chain mint is best-effort.
      let subnameMinted = false;
      try {
        const subRes = await fetch("/api/subname", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: label,
            targetAddress: account.address,
          }),
        });
        subnameMinted = subRes.ok;
      } catch {
        // Subname mint is best-effort; the workflow record is still created.
      }

      // 2. Create the workflow record (a draft) under the chosen agent.
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName: agentSlug,
          name: label,
          suinsName: previewSubname,
          description: description.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        workflow?: { slug: string; suinsName: string };
      };
      if (!res.ok || !data.workflow) {
        throw new Error(data.error ?? `Failed (${res.status})`);
      }

      onCreated?.();
      setReady({
        slug: data.workflow.slug,
        suinsName: data.workflow.suinsName,
        subnameMinted,
      });
      setStep("ready");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create workflow",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const headerTitle =
    step === "ready"
      ? "Workflow Ready"
      : step === "connect"
        ? "Connect Wallet"
        : "Create Workflow";

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
        {/* ===== Header ===== */}
        <div className="flex items-start justify-between border-b-2 border-pure-black bg-electric-purple px-6 py-4 text-off-white">
          <div>
            <div className="mb-2">
              <WorkflowStepIndicator current={step} />
            </div>
            <h2
              id={titleId}
              className="font-display text-2xl font-bold uppercase"
            >
              {headerTitle}
            </h2>
            <p className="mt-0.5 font-mono text-xs text-white/70">
              {step === "connect" &&
                "Sign in with your Sui wallet to get started"}
              {step === "configure" &&
                "Pick an agent and name this workflow — it becomes a subname under the agent"}
              {step === "ready" &&
                "Your workflow is ready — open the canvas to build it"}
            </p>
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

        {ready ? (
          /* ===== Ready state ===== */
          <div className="space-y-5 p-6">
            <div className="flex items-start gap-3 border-2 border-electric-purple bg-electric-purple/5 px-4 py-4">
              <span className="mt-0.5 text-2xl">✅</span>
              <div>
                <p className="font-display text-base font-bold text-on-surface">
                  <span className="text-electric-purple">
                    {ready.suinsName}
                  </span>{" "}
                  is ready
                </p>
                <p className="mt-1 font-mono text-xs text-on-surface-variant">
                  {ready.subnameMinted
                    ? "Subname minted. Build the graph, then Publish to store it on Walrus."
                    : "Workflow created. Build the graph, then Publish to store it on Walrus."}
                </p>
              </div>
            </div>

            <div className="border-2 border-pure-black/10 bg-surface-container p-4">
              <p className="mb-2 font-mono text-[10px] font-bold uppercase text-on-surface-variant">
                What happens next
              </p>
              <ul className="space-y-1.5 font-mono text-xs text-on-surface">
                <li className="flex items-start gap-2">
                  <span className="text-electric-purple">→</span> Open the
                  drag-and-drop canvas
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-electric-purple">→</span> Compose skills
                  and steps into a graph
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-electric-purple">→</span> Publish to
                  store the graph on Walrus under {ready.suinsName}
                </li>
              </ul>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="border-2 border-pure-black bg-white px-6 py-3 font-mono text-sm font-bold transition-colors hover:bg-surface-container"
              >
                Back to Workflows
              </button>
              <button
                type="button"
                onClick={goToCanvas}
                className="border-2 border-pure-black bg-electric-purple px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5"
              >
                Open Canvas →
              </button>
            </div>
          </div>
        ) : (
          /* ===== Form ===== */
          <form onSubmit={handleSubmit} className="space-y-5 p-6">
            <p
              id={descId}
              className="font-mono text-sm text-on-surface-variant"
            >
              A workflow composes an agent&apos;s skills into one graph,
              published under its own <strong>.sui</strong> subname.
            </p>

            {step === "connect" && isEnokiConfigured() && (
              <div className="border-2 border-electric-purple bg-electric-purple/5 p-4">
                <p className="mb-1 font-mono text-xs font-bold uppercase text-electric-purple">
                  No seed phrase needed
                </p>
                <p className="mb-4 font-mono text-sm text-on-surface-variant">
                  Sign in with Google — gasless, seedless Sui wallet via
                  zkLogin.
                </p>
                <div className="[&_button]:!w-full [&_button]:!border-2 [&_button]:!border-pure-black [&_button]:!font-mono [&_button]:!text-sm [&_button]:!font-bold [&_button]:!neo-shadow">
                  <ConnectButton />
                </div>
              </div>
            )}

            {!account?.address && (
              <p className="border-2 border-error bg-red-50 px-3 py-2 font-mono text-xs text-error">
                Connect a wallet to create a workflow.
              </p>
            )}

            {error && (
              <p className="border-2 border-error bg-red-50 px-3 py-2 font-mono text-xs text-error">
                {error}
              </p>
            )}

            {/* Agent picker */}
            {account?.address && (
              <div className="space-y-2">
                <label
                  htmlFor="wf-agent"
                  className="font-mono text-sm font-bold uppercase"
                >
                  Agent
                </label>
                {loadingAgents ? (
                  <div className="border-2 border-pure-black bg-white px-3 py-3 font-mono text-sm text-on-surface-variant">
                    Loading agents…
                  </div>
                ) : agents.length === 0 ? (
                  <div className="space-y-2 border-2 border-pure-black bg-surface-container p-3 font-mono text-xs text-on-surface-variant">
                    <p>
                      You don&apos;t have an agent yet. Create an agent passport
                      first — workflows live under an agent.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        handleClose();
                        onRequestCreateAgent?.();
                      }}
                      className="border-2 border-pure-black bg-electric-purple px-3 py-2 font-mono text-xs font-bold text-off-white neo-shadow"
                    >
                      Create Agent Passport →
                    </button>
                  </div>
                ) : (
                  <select
                    id="wf-agent"
                    value={agentSlug}
                    onChange={(e) => setAgentSlug(e.target.value)}
                    className="w-full border-2 border-pure-black bg-white px-3 py-3 font-mono text-sm outline-none neo-shadow"
                  >
                    <option value="">Select an agent</option>
                    {agents.map((a) => (
                      <option key={a.slug} value={a.slug}>
                        {a.suinsName ?? a.displayName}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Workflow name */}
            {account?.address && agents.length > 0 && (
              <>
                <div className="space-y-2">
                  <label
                    htmlFor="wf-name"
                    className="font-mono text-sm font-bold uppercase"
                  >
                    Workflow name
                  </label>
                  <div className="flex border-2 border-pure-black bg-white neo-shadow focus-within:neo-shadow-lg">
                    <span className="border-r-2 border-pure-black bg-surface-container px-3 py-3 font-mono text-sm font-bold text-on-surface-variant">
                      @
                    </span>
                    <input
                      id="wf-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="rebalance-pipeline"
                      autoComplete="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-sm outline-none placeholder:text-on-surface-variant/60"
                    />
                  </div>
                  {previewSubname && (
                    <p className="border-2 border-pure-black bg-surface-container px-3 py-2 font-mono text-xs text-on-surface">
                      Subname:{" "}
                      <span className="font-bold text-electric-purple">
                        {previewSubname}
                      </span>
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="wf-desc"
                    className="font-mono text-sm font-bold uppercase"
                  >
                    Description{" "}
                    <span className="text-on-surface-variant">(optional)</span>
                  </label>
                  <textarea
                    id="wf-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="What does this workflow do?"
                    className="w-full border-2 border-pure-black bg-white px-3 py-2 font-mono text-sm outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit || submitting}
                  className="w-full border-2 border-pure-black bg-electric-purple px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Launching…" : "Launch Workflow →"}
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
