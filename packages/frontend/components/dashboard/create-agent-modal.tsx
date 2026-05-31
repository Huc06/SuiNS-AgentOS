'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

type CreateAgentModalProps = {
  open: boolean;
  onClose: () => void;
};

function normalizeSuinsInput(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed.endsWith('.sui')) return trimmed;
  return `${trimmed.replace(/^@/, '')}.sui`;
}

export function CreateAgentModal({ open, onClose }: CreateAgentModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const suinsName = normalizeSuinsInput(name);
  const nameValid = suinsName.length > 4 && suinsName.endsWith('.sui');

  const handleClose = useCallback(() => {
    if (submitting) return;
    setName('');
    setDescription('');
    onClose();
  }, [onClose, submitting]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, handleClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameValid) return;
    setSubmitting(true);
    try {
      // TODO(epic #1): wire AgentOSClient.tx.mintPassport + wallet sign
      await new Promise((r) => setTimeout(r, 600));
      handleClose();
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
      <div className="absolute inset-0 bg-pure-black/40 backdrop-blur-[2px]" aria-hidden />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative z-10 w-full max-w-lg border-2 border-pure-black bg-off-white neo-shadow-lg"
      >
        <div className="flex items-start justify-between border-b-2 border-pure-black bg-electric-purple px-6 py-4 text-off-white">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-soft-lavender">
              Step 1 of 2
            </p>
            <h2 id={titleId} className="font-display text-2xl font-bold uppercase">
              New Agent
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

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          <p id={descId} className="font-mono text-sm text-on-surface-variant">
            Register a SuiNS name and mint an AgentPassport. Your runtime wallet defaults to the
            connected address.
          </p>

          <div className="space-y-2">
            <label htmlFor="agent-suins" className="font-mono text-sm font-bold uppercase">
              SuiNS name
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
            {name.length > 0 && (
              <p
                className={`font-mono text-xs ${nameValid ? 'text-green-800' : 'text-error'}`}
              >
                {nameValid ? `Will register: ${suinsName}` : 'Enter a valid name ending in .sui'}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="agent-desc" className="font-mono text-sm font-bold uppercase">
              Description <span className="font-normal text-on-surface-variant">(optional)</span>
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

          <div className="border-2 border-pure-black bg-surface-container p-4 font-mono text-xs">
            <div className="mb-2 font-bold uppercase text-electric-purple">On submit</div>
            <ul className="list-inside list-disc space-y-1 text-on-surface-variant">
              <li>Mint AgentPassport on testnet</li>
              <li>Bind SuiNS record to passport object</li>
              <li>Initialize empty skill & policy roots</li>
            </ul>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="border-2 border-pure-black bg-white px-6 py-3 font-mono text-sm font-bold transition-colors hover:bg-surface-container disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!nameValid || submitting}
              className="border-2 border-pure-black bg-electric-purple px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all active:translate-x-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {submitting ? 'Signing…' : 'Mint Passport'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
