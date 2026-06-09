'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

type DeleteAgentPanelProps = {
  agentSlug: string;
  suinsName: string;
};

export function DeleteAgentPanel({ agentSlug, suinsName }: DeleteAgentPanelProps) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText === agentSlug;

  const handleDelete = async () => {
    if (!canDelete) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agentSlug)}`, {
        method: 'DELETE',
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Delete failed (${res.status})`);
      }
      setOpen(false);
      router.push('/create');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete agent');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-16 border-2 border-error/60 bg-red-50/50 p-6">
      <h2 id={titleId} className="font-display text-lg font-bold uppercase text-error">
        Danger zone
      </h2>
      <p className="mt-2 font-mono text-sm text-on-surface-variant">
        Remove <span className="font-bold text-pure-black">{suinsName}</span> from this workspace
        registry. Skills under this agent are removed too. Your SuiNS name and on-chain passport are
        not deleted.
      </p>
      <button
        type="button"
        onClick={() => {
          setConfirmText('');
          setError(null);
          setOpen(true);
        }}
        className="mt-4 border-2 border-error bg-white px-4 py-2 font-mono text-sm font-bold text-error transition-colors hover:bg-red-100"
      >
        Remove agent from workspace
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !submitting) setOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-pure-black/50" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 w-full max-w-md border-2 border-pure-black bg-off-white p-6 neo-shadow-lg"
          >
            <h3 className="font-display text-xl font-bold uppercase">Confirm remove</h3>
            <p className="mt-2 font-mono text-sm text-on-surface-variant">
              Type <span className="font-bold text-pure-black">{agentSlug}</span> to confirm.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              className="mt-4 w-full border-2 border-pure-black bg-white px-3 py-2 font-mono text-sm outline-none focus:border-error"
              placeholder={agentSlug}
            />
            {error && (
              <p className="mt-2 font-mono text-xs text-error">{error}</p>
            )}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setOpen(false)}
                className="border-2 border-pure-black bg-white px-4 py-2 font-mono text-sm font-bold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canDelete || submitting}
                onClick={() => void handleDelete()}
                className="border-2 border-error bg-error px-4 py-2 font-mono text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? 'Removing…' : 'Remove permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
