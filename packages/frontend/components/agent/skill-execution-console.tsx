'use client';

import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { useCallback, useEffect, useState } from 'react';

import type { AgentSkillRow } from '../../lib/agent-types';
import { getAgentosPackageId } from '../../lib/enoki-config';
import { explorerTxUrl } from '../../lib/explorer-links';
import { suiObjectUrl, walrusBlobUrl } from '../../lib/explorer-urls';

type ConsoleState =
  | { kind: 'idle' }
  | { kind: 'verifying' }
  | { kind: 'verified'; manifest: Record<string, unknown>; computedHash: string }
  | { kind: 'mismatch'; computedHash: string; expectedHash: string }
  | { kind: 'unverifiable'; reason: string }
  | { kind: 'signing' }
  | { kind: 'success'; digest: string }
  | { kind: 'error'; message: string };

interface SkillExecutionConsoleProps {
  skill: AgentSkillRow;
  onClose: () => void;
}

/**
 * Skill Execution Console — Hero Moment #3.
 * Resolve → verify SHA-256 integrity → build PTB → sign via wallet → show digest.
 */
export function SkillExecutionConsole({ skill, onClose }: SkillExecutionConsoleProps) {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const [state, setState] = useState<ConsoleState>({ kind: 'idle' });
  const packageId = getAgentosPackageId();
  const walletConnected = Boolean(account?.address);

  // Verify manifest integrity on mount
  const verify = useCallback(async () => {
    if (!skill.blobId || skill.blobId.startsWith('walrus://')) {
      setState({ kind: 'unverifiable', reason: 'Manifest not uploaded to Walrus yet' });
      return;
    }

    setState({ kind: 'verifying' });
    try {
      const res = await fetch(
        `/api/skills/manifest?blobId=${encodeURIComponent(skill.blobId)}&expectedHash=${encodeURIComponent(skill.objectIdFull)}`,
        { cache: 'no-store' },
      );
      const data = (await res.json()) as {
        manifest: Record<string, unknown> | null;
        computedHash: string | null;
        expectedHash: string;
        verified: boolean;
        reason?: string;
      };

      if (!data.verified) {
        if (data.reason) {
          setState({ kind: 'unverifiable', reason: data.reason });
        } else {
          setState({
            kind: 'mismatch',
            computedHash: data.computedHash ?? 'unknown',
            expectedHash: data.expectedHash,
          });
        }
      } else {
        setState({
          kind: 'verified',
          manifest: data.manifest ?? {},
          computedHash: data.computedHash!,
        });
      }
    } catch (err) {
      setState({
        kind: 'unverifiable',
        reason: err instanceof Error ? err.message : 'Verification failed',
      });
    }
  }, [skill.blobId, skill.objectIdFull]);

  useEffect(() => {
    void verify();
  }, [verify]);

  // Execute the skill
  const handleRun = async () => {
    if (state.kind !== 'verified' || !account?.address || !packageId) return;

    const manifest = state.manifest as {
      sui?: { movePackage?: string; entry?: string };
    };
    const entry = manifest.sui?.entry;
    const movePackage = manifest.sui?.movePackage || packageId;

    if (!entry) {
      setState({ kind: 'error', message: 'Manifest missing sui.entry field' });
      return;
    }

    // Parse entry: "module::function" or "package::module::function"
    const parts = entry.split('::');
    let target: string;
    if (parts.length === 3) {
      target = entry;
    } else if (parts.length === 2) {
      target = `${movePackage}::${parts[0]}::${parts[1]}`;
    } else {
      target = `${movePackage}::main::${entry}`;
    }

    setState({ kind: 'signing' });
    try {
      const tx = new Transaction();
      tx.moveCall({ target, arguments: [] });
      const result = await signAndExecute({ transaction: tx as never });
      setState({ kind: 'success', digest: result.digest });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Transaction failed',
      });
    }
  };

  const isVerified = state.kind === 'verified';
  const canRun = isVerified && walletConnected && Boolean(packageId);
  const busy = state.kind === 'verifying' || state.kind === 'signing';

  return (
    <div className="border-2 border-pure-black bg-white p-6 neo-shadow">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="font-display text-lg font-bold">Execution Console</h3>
          <p className="font-mono text-xs text-on-surface-variant">{skill.name}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="border-2 border-pure-black px-2 py-1 font-mono text-xs font-bold hover:bg-surface-container"
          aria-label="Close console"
        >
          ✕
        </button>
      </div>

      {/* Descriptor summary */}
      <div className="mb-4 space-y-1 border-2 border-pure-black/10 bg-surface-container p-3 font-mono text-xs">
        <div className="flex justify-between">
          <span className="text-on-surface-variant">Package:</span>
          <span className="font-bold">{skill.mvrPackage}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-on-surface-variant">Version:</span>
          <span className="font-bold">{skill.version}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-on-surface-variant">Object:</span>
          <a
            href={suiObjectUrl(skill.network, skill.objectIdFull)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-electric-purple hover:underline"
          >
            {skill.objectId} ↗
          </a>
        </div>
        {skill.blobId && !skill.blobId.startsWith('walrus://') && (
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Blob:</span>
            <a
              href={walrusBlobUrl(skill.network, skill.blobId)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-electric-purple hover:underline"
            >
              Walruscan ↗
            </a>
          </div>
        )}
      </div>

      {/* Verification badge */}
      <div className="mb-4">
        {state.kind === 'verifying' && (
          <div className="flex items-center gap-2 border-2 border-pure-black bg-surface-container px-3 py-2">
            <span className="animate-pulse font-mono text-xs font-bold text-on-surface-variant motion-reduce:animate-none">
              VERIFYING…
            </span>
            <span className="font-mono text-[10px] text-on-surface-variant">
              Downloading manifest & computing SHA-256
            </span>
          </div>
        )}
        {state.kind === 'verified' && (
          <div className="flex items-center gap-2 border-2 border-green-800 bg-green-50 px-3 py-2">
            <span className="font-mono text-xs font-bold text-green-900">✓ INTEGRITY VERIFIED</span>
            <span className="font-mono text-[10px] text-green-800">
              SHA-256 matches on-chain hash
            </span>
          </div>
        )}
        {state.kind === 'mismatch' && (
          <div className="border-2 border-error bg-red-50 px-3 py-2" role="alert">
            <p className="font-mono text-xs font-bold text-error">⚠ INTEGRITY MISMATCH</p>
            <p className="mt-1 font-mono text-[10px] text-error">
              Manifest hash does not match on-chain commitment. Execution blocked.
            </p>
            <div className="mt-2 space-y-1 font-mono text-[10px]">
              <p>Expected: <code className="bg-white px-1">{state.expectedHash.slice(0, 16)}…</code></p>
              <p>Computed: <code className="bg-white px-1">{state.computedHash.slice(0, 16)}…</code></p>
            </div>
          </div>
        )}
        {state.kind === 'unverifiable' && (
          <div className="border-2 border-pure-black/30 bg-surface-container px-3 py-2">
            <p className="font-mono text-xs font-bold text-on-surface-variant">
              ○ UNVERIFIABLE
            </p>
            <p className="mt-1 font-mono text-[10px] text-on-surface-variant">
              {state.reason}
            </p>
          </div>
        )}
      </div>

      {/* Run button */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleRun}
          disabled={!canRun || busy}
          className="w-full border-2 border-pure-black bg-electric-purple px-4 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {state.kind === 'signing' ? 'Confirm in wallet…' : 'Run Skill'}
        </button>

        {!walletConnected && (
          <p className="font-mono text-[10px] text-on-surface-variant">
            Connect a wallet to execute.
          </p>
        )}
        {!packageId && walletConnected && (
          <p className="font-mono text-[10px] text-on-surface-variant">
            Package ID not configured — execution unavailable.
          </p>
        )}
        {(state.kind === 'mismatch') && (
          <p className="font-mono text-[10px] text-error">
            Run is blocked: manifest hash does not match on-chain commitment.
          </p>
        )}
      </div>

      {/* Success */}
      {state.kind === 'success' && (
        <div className="mt-4 border-2 border-green-800 bg-green-50 px-4 py-3">
          <p className="font-mono text-xs font-bold text-green-900">✓ Executed</p>
          <a
            href={explorerTxUrl(skill.network, state.digest)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block break-all font-mono text-xs font-bold text-electric-purple hover:underline"
          >
            View on Suiscan →
          </a>
        </div>
      )}

      {/* Error */}
      {state.kind === 'error' && (
        <div className="mt-4 border-2 border-error bg-red-50 px-4 py-3" role="alert">
          <p className="font-mono text-xs font-bold text-error">{state.message}</p>
        </div>
      )}
    </div>
  );
}
