import type { RegistryAgentRecord } from '@agentos/sdk/node';

import { explorerObjectUrl } from '../../lib/explorer-links';
import { shortObjectId } from '../../lib/registry-mappers';

interface AgentPassportHeaderProps {
  agent: RegistryAgentRecord;
  skillCount: number;
}

function CopyButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(text)}
      className="ml-1 border border-pure-black bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-on-surface-variant transition-colors hover:bg-surface-container"
      aria-label={`Copy ${text}`}
    >
      Copy
    </button>
  );
}

const statusStyles = {
  active: 'bg-green-100 text-green-800 border-green-800',
  revoked: 'bg-red-100 text-red-800 border-red-800',
};

const networkStyles = {
  mainnet: 'bg-green-100 text-green-800 border-green-800',
  testnet: 'bg-blue-100 text-blue-800 border-blue-800',
};

/**
 * Public agent passport header — visible to ALL visitors (no ownership gate).
 * Shows identity, status, network, on-chain object links, and a reputation placeholder.
 */
export function AgentPassportHeader({ agent, skillCount }: AgentPassportHeaderProps) {
  const suiscanUrl = agent.passportId
    ? explorerObjectUrl(agent.network, agent.passportId)
    : null;
  const runtimeUrl = agent.runtimeWallet
    ? explorerObjectUrl(agent.network, agent.runtimeWallet)
    : null;

  return (
    <div className="mb-8 border-2 border-pure-black bg-white p-6 neo-shadow sm:p-8">
      {/* Top row: name + badges */}
      <div className="flex flex-wrap items-start gap-3">
        <h1 className="font-display text-2xl font-bold text-on-surface sm:text-3xl">
          {agent.suinsName}
        </h1>
        <span
          className={`border-2 px-2 py-0.5 font-mono text-xs font-bold uppercase ${statusStyles[agent.status]}`}
        >
          {agent.status}
        </span>
        <span
          className={`border-2 px-2 py-0.5 font-mono text-xs font-bold uppercase ${networkStyles[agent.network]}`}
        >
          {agent.network}
        </span>
      </div>

      {/* Description */}
      {agent.description && (
        <p className="mt-3 font-mono text-sm text-on-surface-variant">
          {agent.description}
        </p>
      )}

      {/* Stats row */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase text-on-surface-variant">
            Version
          </p>
          <p className="mt-1 font-mono text-sm font-bold">{agent.passportVersion}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase text-on-surface-variant">
            Skills
          </p>
          <p className="mt-1 font-mono text-sm font-bold">{skillCount}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase text-on-surface-variant">
            Created
          </p>
          <p className="mt-1 font-mono text-sm font-bold">
            {new Date(agent.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase text-on-surface-variant">
            Network
          </p>
          <p className="mt-1 font-mono text-sm font-bold capitalize">{agent.network}</p>
        </div>
      </div>

      {/* Object IDs */}
      <div className="mt-6 space-y-2 border-t-2 border-pure-black/10 pt-4">
        {agent.passportId && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-mono text-[10px] font-bold uppercase text-on-surface-variant">
              Passport:
            </span>
            <code className="bg-surface-container px-1.5 py-0.5 font-mono text-xs">
              {shortObjectId(agent.passportId)}
            </code>
            <CopyButton text={agent.passportId} />
            {suiscanUrl && (
              <a
                href={suiscanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] font-bold text-electric-purple hover:underline"
              >
                Suiscan ↗
              </a>
            )}
          </div>
        )}
        {agent.runtimeWallet && agent.runtimeWallet !== '0x0' && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-mono text-[10px] font-bold uppercase text-on-surface-variant">
              Runtime:
            </span>
            <code className="bg-surface-container px-1.5 py-0.5 font-mono text-xs">
              {shortObjectId(agent.runtimeWallet)}
            </code>
            <CopyButton text={agent.runtimeWallet} />
            {runtimeUrl && (
              <a
                href={runtimeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] font-bold text-electric-purple hover:underline"
              >
                Suiscan ↗
              </a>
            )}
          </div>
        )}
      </div>

      {/* Reputation placeholder */}
      <div className="mt-6 border-t-2 border-pure-black/10 pt-4">
        <div className="border-2 border-dashed border-pure-black/30 px-4 py-3">
          <p className="font-mono text-xs font-bold text-on-surface-variant">
            Reputation — on-chain attestations coming soon
          </p>
          <p className="mt-1 font-mono text-[10px] text-on-surface-variant">
            Execution count, endorsements, and trust score will appear here once the attestation module is indexed.
          </p>
        </div>
      </div>
    </div>
  );
}
