"use client";

import { useState } from "react";

import type { AgentSkillRow } from "../../../lib/agent-types";
import { DelegateContent } from "../../../components/agent/delegate-content";
import { CopyButton } from "./copy-button";

interface EditPanelProps {
  agentSlug: string;
  passportId: string;
  initialDescription: string;
  skills: AgentSkillRow[];
  open: boolean;
  onClose: () => void;
  // Full agent info for Info tab
  suinsName: string;
  network: string;
  passportVersion: string;
  runtimeWallet: string;
  status: string;
  createdAt: string;
  delegationCount: number;
}

export function EditPanel({
  open,
  onClose,
  agentSlug,
  passportId,
  initialDescription,
  skills,
  suinsName,
  network,
  passportVersion,
  runtimeWallet,
  status,
  createdAt,
  delegationCount,
}: EditPanelProps) {
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"skills" | "delegate" | "info">("skills");

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/agents/${agentSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 z-40 flex h-full w-80 flex-col border-l-2 border-pure-black bg-off-white shadow-[-4px_0_24px_rgba(0,0,0,0.08)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-pure-black/10 px-5 py-3">
        <h3 className="text-sm font-bold text-black">Edit Portfolio</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-black/40 hover:text-black"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-pure-black/10">
        <button
          type="button"
          onClick={() => setTab("skills")}
          className={`flex-1 px-3 py-2.5 font-mono text-[11px] font-bold transition-colors ${
            tab === "skills"
              ? "border-b-2 border-electric-purple text-electric-purple"
              : "text-black/40 hover:text-black"
          }`}
        >
          Skills
        </button>
        <button
          type="button"
          onClick={() => setTab("delegate")}
          className={`flex-1 px-3 py-2.5 font-mono text-[11px] font-bold transition-colors ${
            tab === "delegate"
              ? "border-b-2 border-electric-purple text-electric-purple"
              : "text-black/40 hover:text-black"
          }`}
        >
          Delegate
        </button>
        <button
          type="button"
          onClick={() => setTab("info")}
          className={`flex-1 px-3 py-2.5 font-mono text-[11px] font-bold transition-colors ${
            tab === "info"
              ? "border-b-2 border-electric-purple text-electric-purple"
              : "text-black/40 hover:text-black"
          }`}
        >
          Info
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "skills" ? (
          <SkillsTab skills={skills} agentSlug={agentSlug} />
        ) : tab === "delegate" ? (
          <div className="p-4">
            <DelegateContent agentSlug={agentSlug} passportId={passportId} />
          </div>
        ) : (
          <InfoTab
            description={description}
            setDescription={setDescription}
            saving={saving}
            saved={saved}
            onSave={handleSave}
            suinsName={suinsName}
            network={network}
            passportVersion={passportVersion}
            passportId={passportId}
            runtimeWallet={runtimeWallet}
            status={status}
            createdAt={createdAt}
            skillCount={skills.length}
            delegationCount={delegationCount}
          />
        )}
      </div>
    </div>
  );
}

// ===== Skills Tab =====

function SkillsTab({
  skills,
  agentSlug,
}: {
  skills: AgentSkillRow[];
  agentSlug: string;
}) {
  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] font-bold uppercase text-black/40">
          @{agentSlug} · {skills.length} skill{skills.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Skill list */}
      {skills.length === 0 ? (
        <div className="rounded border border-dashed border-pure-black/10 px-4 py-8 text-center">
          <p className="font-mono text-xs text-black/40">No skills yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} agentSlug={agentSlug} />
          ))}
        </div>
      )}
    </div>
  );
}

function SkillCard({
  skill,
  agentSlug,
}: {
  skill: AgentSkillRow;
  agentSlug: string;
}) {
  return (
    <div className="rounded-lg border border-pure-black/10 bg-white">
      {/* Name + status */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-black">{skill.name}</p>
          <p className="font-mono text-[10px] text-black/40">
            @{agentSlug}/{skill.name}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold ${
            skill.status === "active"
              ? "bg-green-100 text-green-800"
              : "bg-black/5 text-black/40"
          }`}
        >
          {skill.status}
        </span>
      </div>

      {/* Meta */}
      <div className="border-t border-pure-black/5 px-3 py-2">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[9px] text-black/50">
            {skill.network}
          </span>
          <span className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[9px] text-black/50">
            {skill.version}
          </span>
          <span className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[9px] text-black/50 capitalize">
            {skill.source}
          </span>
        </div>
      </div>

      {/* Object ID + Blob */}
      <div className="space-y-1 border-t border-pure-black/5 px-3 py-2">
        <div className="flex items-center justify-between">
          <code className="font-mono text-[10px] text-black/50">
            {skill.objectId}
          </code>
          <CopyButton text={skill.objectIdFull} />
        </div>
        {skill.blobId && (
          <div className="flex items-center gap-1">
            <span className="font-mono text-[9px] font-bold text-black/30">
              BLOB
            </span>
            <code className="truncate font-mono text-[10px] text-black/50">
              {skill.blobId.slice(0, 32)}
            </code>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 border-t border-pure-black/5 px-3 py-2 font-mono text-[9px]">
        <span className="text-black/40">
          RES <span className="font-bold text-black">{skill.resolutions}</span>
        </span>
        <span className="text-black/40">
          UPDATED{" "}
          <span className="font-bold text-black">
            {new Date(skill.lastUpdated).toLocaleDateString()}
          </span>
        </span>
      </div>
    </div>
  );
}

// ===== Info Tab =====

function InfoTab({
  description,
  setDescription,
  saving,
  saved,
  onSave,
  suinsName,
  network,
  passportVersion,
  passportId,
  runtimeWallet,
  status,
  createdAt,
  skillCount,
  delegationCount,
}: {
  description: string;
  setDescription: (v: string) => void;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  suinsName: string;
  network: string;
  passportVersion: string;
  passportId: string;
  runtimeWallet: string;
  status: string;
  createdAt: string;
  skillCount: number;
  delegationCount: number;
}) {
  const shortId = (id: string) =>
    id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-6)}` : id;

  return (
    <div className="space-y-4 p-4">
      {/* Description (editable) */}
      <div>
        <label
          htmlFor="edit-desc"
          className="mb-1.5 block font-mono text-[10px] font-bold uppercase text-black/40"
        >
          Description
        </label>
        <textarea
          id="edit-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full resize-none rounded border border-pure-black/10 bg-white px-3 py-2 text-sm text-black outline-none focus:border-electric-purple"
          placeholder="Describe your agent..."
        />
      </div>

      {/* Identity */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] font-bold uppercase text-black/40">
          Identity
        </p>
        <InfoRow label="Name" value={suinsName} />
        <InfoRow label="Status" value={status} badge />
        <InfoRow label="Network" value={network} />
        <InfoRow label="Version" value={passportVersion} />
        <InfoRow
          label="Created"
          value={new Date(createdAt).toLocaleDateString()}
        />
      </div>

      {/* On-chain */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] font-bold uppercase text-black/40">
          On-chain
        </p>
        <div className="flex items-center justify-between rounded border border-pure-black/5 bg-black/[0.02] px-3 py-2">
          <div>
            <p className="font-mono text-[9px] text-black/40">Passport</p>
            <code className="font-mono text-[11px] text-black">
              {shortId(passportId)}
            </code>
          </div>
          <CopyButton text={passportId} />
        </div>
        {runtimeWallet && runtimeWallet !== "0x0" && (
          <div className="flex items-center justify-between rounded border border-pure-black/5 bg-black/[0.02] px-3 py-2">
            <div>
              <p className="font-mono text-[9px] text-black/40">Runtime</p>
              <code className="font-mono text-[11px] text-black">
                {shortId(runtimeWallet)}
              </code>
            </div>
            <CopyButton text={runtimeWallet} />
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="space-y-2">
        <p className="font-mono text-[10px] font-bold uppercase text-black/40">
          Stats
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded border border-pure-black/5 bg-black/[0.02] px-3 py-2 text-center">
            <p className="text-lg font-bold text-black">{skillCount}</p>
            <p className="font-mono text-[9px] text-black/40">Skills</p>
          </div>
          <div className="rounded border border-pure-black/5 bg-black/[0.02] px-3 py-2 text-center">
            <p className="text-lg font-bold text-black">{delegationCount}</p>
            <p className="font-mono text-[9px] text-black/40">Delegates</p>
          </div>
          <div className="rounded border border-pure-black/5 bg-black/[0.02] px-3 py-2 text-center">
            <p className="text-lg font-bold text-black">0</p>
            <p className="font-mono text-[9px] text-black/40">Executions</p>
          </div>
        </div>
      </div>

      {/* Resolve */}
      <div>
        <p className="mb-1 font-mono text-[10px] font-bold uppercase text-black/40">
          Resolve
        </p>
        <div className="flex items-center justify-between rounded border border-pure-black/5 bg-black/[0.02] px-3 py-2">
          <code className="font-mono text-[11px] text-black">
            agentos resolve {suinsName}
          </code>
          <CopyButton text={`agentos resolve ${suinsName}`} />
        </div>
      </div>

      {/* Save */}
      {saved && (
        <p className="font-mono text-[10px] font-bold text-green-700">
          ✓ Saved
        </p>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="w-full rounded border-2 border-pure-black bg-electric-purple px-4 py-2 font-mono text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#000] disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}

function InfoRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] text-black/40">{label}</span>
      {badge ? (
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold ${value === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
        >
          {value}
        </span>
      ) : (
        <span className="font-mono text-[11px] font-bold text-black">
          {value}
        </span>
      )}
    </div>
  );
}
