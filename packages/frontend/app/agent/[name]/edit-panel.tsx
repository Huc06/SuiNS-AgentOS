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
}

export function EditPanel({
  open,
  onClose,
  agentSlug,
  passportId,
  initialDescription,
  skills,
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
}: {
  description: string;
  setDescription: (v: string) => void;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
}) {
  return (
    <div className="p-4 space-y-5">
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
          rows={4}
          className="w-full resize-none rounded border border-pure-black/10 bg-white px-3 py-2 text-sm text-black outline-none focus:border-electric-purple"
          placeholder="Describe your agent..."
        />
      </div>

      <div className="rounded border border-dashed border-pure-black/10 px-4 py-6 text-center">
        <p className="font-mono text-[10px] text-black/30">
          More fields coming soon — avatar, links, categories
        </p>
      </div>

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
