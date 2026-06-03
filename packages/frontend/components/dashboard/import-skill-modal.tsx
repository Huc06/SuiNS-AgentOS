'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { MOCK_AGENTS } from '../../lib/mock-agents';

type ImportSkillModalProps = {
  open: boolean;
  onClose: () => void;
};

function normalizeMvrPackage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

const AGENT_OPTIONS = MOCK_AGENTS.map((a) => ({ value: a.slug, label: a.displayName }));

export function ImportSkillModal({ open, onClose }: ImportSkillModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [agent, setAgent] = useState(AGENT_OPTIONS[0]?.value ?? '');
  const [skillId, setSkillId] = useState('');
  const [mvrPackage, setMvrPackage] = useState('');
  const [version, setVersion] = useState('');
  const [manifestRef, setManifestRef] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const packageName = normalizeMvrPackage(mvrPackage);
  const packageValid = packageName.length > 2 && packageName.includes('/');
  const versionValid = /^\d+\.\d+/.test(version.trim());
  const manifestValid = manifestRef.trim().length >= 8;
  const skillIdValid = /^[a-z0-9][a-z0-9-]*$/i.test(skillId.trim());
  const formValid = packageValid && versionValid && manifestValid && skillIdValid && agent.length > 0;

  const handleClose = useCallback(() => {
    if (submitting) return;
    setAgent(AGENT_OPTIONS[0]?.value ?? '');
    setSkillId('');
    setMvrPackage('');
    setVersion('');
    setManifestRef('');
    onClose();
  }, [onClose, submitting]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLInputElement>('input,select')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, handleClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) return;
    setSubmitting(true);
    try {
      // TODO(epic #2): upload manifest → Walrus, register SkillDescriptor on-chain
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
        <div className="flex items-start justify-between border-b-2 border-pure-black bg-vibrant-blue px-6 py-4 text-off-white">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-off-white/80">
              Skill registry
            </p>
            <h2 id={titleId} className="font-display text-2xl font-bold uppercase">
              Import Skill
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

        <form onSubmit={handleSubmit} className="max-h-[min(70vh,640px)] space-y-5 overflow-y-auto p-6">
          <p id={descId} className="font-mono text-sm text-on-surface-variant">
            Publish a skill manifest to Walrus and register a SkillDescriptor on the selected
            agent&apos;s passport.
          </p>

          <div className="space-y-2">
            <label htmlFor="skill-agent" className="font-mono text-sm font-bold uppercase">
              Target agent
            </label>
            <select
              id="skill-agent"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="w-full border-2 border-pure-black bg-white px-3 py-3 font-mono text-sm neo-shadow outline-none focus:neo-shadow-lg"
            >
              {AGENT_OPTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="skill-id" className="font-mono text-sm font-bold uppercase">
              Skill ID
            </label>
            <input
              id="skill-id"
              type="text"
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
              placeholder="web-search"
              autoComplete="off"
              spellCheck={false}
              className="w-full border-2 border-pure-black bg-white px-3 py-3 font-mono text-sm outline-none neo-shadow placeholder:text-on-surface-variant/60 focus:neo-shadow-lg"
            />
            {skillId.length > 0 && !skillIdValid && (
              <p className="font-mono text-xs text-error">Use lowercase letters, numbers, and hyphens.</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="skill-mvr" className="font-mono text-sm font-bold uppercase">
              MVR package
            </label>
            <input
              id="skill-mvr"
              type="text"
              value={mvrPackage}
              onChange={(e) => setMvrPackage(e.target.value)}
              placeholder="@my-org/web-search"
              autoComplete="off"
              spellCheck={false}
              className="w-full border-2 border-pure-black bg-white px-3 py-3 font-mono text-sm outline-none neo-shadow placeholder:text-on-surface-variant/60 focus:neo-shadow-lg"
            />
            {mvrPackage.length > 0 && (
              <p className={`font-mono text-xs ${packageValid ? 'text-green-800' : 'text-error'}`}>
                {packageValid ? packageName : 'Format: @org/package-name'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="skill-version" className="font-mono text-sm font-bold uppercase">
                Version
              </label>
              <input
                id="skill-version"
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                className="w-full border-2 border-pure-black bg-white px-3 py-3 font-mono text-sm outline-none neo-shadow placeholder:text-on-surface-variant/60 focus:neo-shadow-lg"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="skill-manifest" className="font-mono text-sm font-bold uppercase">
                Walrus blob
              </label>
              <input
                id="skill-manifest"
                type="text"
                value={manifestRef}
                onChange={(e) => setManifestRef(e.target.value)}
                placeholder="blobId or https://…"
                className="w-full border-2 border-pure-black bg-white px-3 py-3 font-mono text-sm outline-none neo-shadow placeholder:text-on-surface-variant/60 focus:neo-shadow-lg"
              />
            </div>
          </div>

          <div className="border-2 border-pure-black bg-surface-container p-4 font-mono text-xs">
            <div className="mb-2 font-bold uppercase text-vibrant-blue">On submit</div>
            <ul className="list-inside list-disc space-y-1 text-on-surface-variant">
              <li>Verify manifest hash against Walrus blob</li>
              <li>Register SkillDescriptor on testnet</li>
              <li>Link skill to agent passport skill root</li>
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
              disabled={!formValid || submitting}
              className="border-2 border-pure-black bg-vibrant-blue px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all active:translate-x-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {submitting ? 'Publishing…' : 'Register Skill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
