"use client";

import { useState } from "react";

interface EditPanelProps {
  agentSlug: string;
  initialDescription: string;
}

export function EditPanelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-electric-purple/30 bg-electric-purple/5 px-3 py-1.5 font-mono text-[11px] font-bold text-electric-purple transition-all hover:bg-electric-purple/10"
    >
      Edit Portfolio
    </button>
  );
}

export function EditPanel({
  open,
  onClose,
  agentSlug,
  initialDescription,
}: EditPanelProps & { open: boolean; onClose: () => void }) {
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l-2 border-pure-black bg-off-white shadow-[-4px_0_24px_rgba(0,0,0,0.1)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-pure-black/10 px-5 py-4">
          <h3 className="text-sm font-bold text-black">Edit Portfolio</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-black/40 hover:text-black"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-5">
            {/* Description */}
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

            {/* Future: avatar, links, etc. */}
            <div className="rounded border border-dashed border-pure-black/10 px-4 py-6 text-center">
              <p className="font-mono text-[10px] text-black/30">
                More fields coming soon — avatar, links, categories
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-pure-black/10 px-5 py-4">
          {saved && (
            <p className="mb-2 font-mono text-[10px] font-bold text-green-700">
              ✓ Saved
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded border-2 border-pure-black bg-electric-purple px-4 py-2 font-mono text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#000] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  );
}
