import Link from "next/link";

import { AgentNotFound } from "../../../components/agent/agent-not-found";
import { resolveAgentPageData } from "../../../lib/registry-resolve";
import { shortObjectId } from "../../../lib/registry-mappers";
import { explorerObjectUrl } from "../../../lib/explorer-links";
import { CopyButton } from "./copy-button";

interface Props {
  params: Promise<{ name: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { name } = await params;
  const data = resolveAgentPageData(name);
  const label = data?.card.displayName ?? `@${name}`;
  return {
    title: `${label} — Agent Portfolio | SuiNS AgentOS`,
    description: `Portfolio for ${label}. Skills, identity, and delegation on Sui.`,
  };
}

export default async function AgentPortfolioPage({ params }: Props) {
  const { name } = await params;
  const data = resolveAgentPageData(name);

  if (!data) {
    return <AgentNotFound name={name} />;
  }

  const agent = data.resolved.agent;
  const skills = data.skills;
  const deps = skills.flatMap((s) => s.dependencies ?? []);
  const uniqueDeps = [...new Set(deps)];
  const createdDate = new Date(agent.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });

  return (
    <div className="min-h-screen bg-off-white">
      {/* Minimal top bar */}
      <header className="border-b border-pure-black/10 bg-off-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link
            href="/explore"
            className="font-mono text-xs font-bold text-black/50 hover:text-black"
          >
            ← Back to Portfolio
          </Link>
          <Link href="/" className="font-mono text-sm font-bold text-black">
            AGENTOS
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4">
        {/* ===== Profile Header ===== */}
        <section className="border-x border-pure-black/10 py-8">
          <div className="flex items-center gap-5 px-6">
            {/* Avatar */}
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-pure-black bg-electric-purple font-display text-2xl font-bold text-white shadow-[4px_4px_0_0_#000]">
              {agent.slug.charAt(0).toUpperCase()}
              {/* Status dot */}
              <span
                className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white ${agent.status === "active" ? "bg-green-500" : "bg-red-500"}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight text-black">
                  {agent.suinsName}
                </h1>
                {/* Verified badge */}
                {agent.status === "active" && (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="shrink-0 text-electric-purple"
                  >
                    <path
                      d="M9 12l2 2 4-4"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 2l2.4 3.6h4.2l-.6 4.2L21 12l-3 2.4.6 4.2h-4.2L12 22l-2.4-3.6H5.4l.6-4.2L3 12l3-2.4-.6-4.2h4.2L12 2z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="currentColor"
                      fillOpacity="0.1"
                    />
                  </svg>
                )}
              </div>
              {/* Flip subtitle */}
              <p className="mt-1 font-mono text-sm text-black/60">
                Autonomous agent · {agent.network} · Since {createdDate}
              </p>
            </div>
          </div>
        </section>

        <Separator />

        {/* ===== Overview / Bio ===== */}
        <section className="border-x border-pure-black/10 px-6 py-6">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <OverviewItem label="Version" value={agent.passportVersion} />
            <OverviewItem label="Network" value={agent.network} />
            <OverviewItem label="Skills" value={String(skills.length)} />
            <OverviewItem
              label="Delegations"
              value={String(agent.delegations?.length ?? 0)}
            />
            {agent.description && (
              <div className="col-span-full">
                <p className="font-mono text-[10px] font-bold uppercase text-black/40">
                  About
                </p>
                <p className="mt-1 text-sm leading-relaxed text-black/80">
                  {agent.description}
                </p>
              </div>
            )}
          </div>
        </section>

        <Separator />

        {/* ===== On-chain Identity ===== */}
        <section className="border-x border-pure-black/10 px-6 py-6">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-black">
            Identity
          </h2>
          <div className="space-y-3">
            <IdentityRow
              label="Passport"
              value={shortObjectId(agent.passportId)}
              full={agent.passportId}
              href={explorerObjectUrl(agent.network, agent.passportId)}
            />
            {agent.runtimeWallet && agent.runtimeWallet !== "0x0" && (
              <IdentityRow
                label="Runtime Wallet"
                value={shortObjectId(agent.runtimeWallet)}
                full={agent.runtimeWallet}
                href={explorerObjectUrl(agent.network, agent.runtimeWallet)}
              />
            )}
          </div>
          {/* Resolve command */}
          <div className="mt-4 rounded-lg border border-pure-black/10 bg-black/[0.02] px-4 py-3">
            <p className="font-mono text-[10px] font-bold uppercase text-black/40">
              Resolve
            </p>
            <code className="mt-1 block font-mono text-xs text-black">
              agentos resolve {agent.suinsName}
            </code>
          </div>
        </section>

        <Separator />

        {/* ===== Skills ===== */}
        <section className="border-x border-pure-black/10 px-6 py-6">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-black">
            Skills{" "}
            <sup className="ml-1 text-sm font-medium text-black/40">
              {skills.length}
            </sup>
          </h2>
          {skills.length === 0 ? (
            <p className="font-mono text-sm text-black/50">
              No skills published yet.
            </p>
          ) : (
            <div className="space-y-2">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="group flex items-center border border-pure-black/10 bg-white transition-colors hover:bg-black/[0.02]"
                >
                  {/* Icon */}
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center border-r border-pure-black/10 text-black/40 group-hover:text-electric-purple">
                    {skill.icon === "token" ? (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v12M6 12h12" />
                      </svg>
                    ) : skill.icon === "wallet" ? (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="2" y="6" width="20" height="14" rx="2" />
                        <path d="M22 10H18a2 2 0 000 4h4" />
                      </svg>
                    ) : (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M16 3l5 5-5 5" />
                        <path d="M21 8H9" />
                        <path d="M8 21l-5-5 5-5" />
                        <path d="M3 16h12" />
                      </svg>
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex flex-1 items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-bold text-black">
                        {skill.name}
                      </p>
                      <p className="font-mono text-[11px] text-black/50">
                        {skill.mvrPackage} · {skill.version}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${skill.status === "active" ? "bg-green-100 text-green-800" : "bg-black/5 text-black/40"}`}
                    >
                      {skill.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* ===== Tech Stack / Dependencies ===== */}
        {uniqueDeps.length > 0 && (
          <>
            <section className="border-x border-pure-black/10 px-6 py-6">
              <h2 className="mb-4 text-lg font-bold tracking-tight text-black">
                Dependencies{" "}
                <sup className="ml-1 text-sm font-medium text-black/40">
                  {uniqueDeps.length}
                </sup>
              </h2>
              <div className="flex flex-wrap gap-2">
                {uniqueDeps.map((dep) => (
                  <span
                    key={dep}
                    className="rounded-md border border-pure-black/10 bg-black/[0.03] px-3 py-1.5 font-mono text-xs text-black"
                  >
                    {dep}
                  </span>
                ))}
              </div>
            </section>
            <Separator />
          </>
        )}

        {/* ===== Quick Links ===== */}
        <section className="border-x border-pure-black/10 px-6 py-6">
          <h2 className="sr-only">Links</h2>
          <div className="flex flex-wrap gap-3">
            <QuickLink
              href={explorerObjectUrl(agent.network, agent.passportId)}
              external
              label="Suiscan"
            />
            <QuickLink href={`/agent/${name}/skills`} label="Manage Skills" />
            <QuickLink href={`/agent/${name}/delegate`} label="Delegation" />
            <QuickLink href={`/agent/${name}/manage`} label="Console" />
          </div>
        </section>

        <Separator />

        {/* ===== Footer Stats ===== */}
        <section className="border-x border-b border-pure-black/10 px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase text-black/40">
                Skill Executions
              </p>
              <p className="mt-1 text-2xl font-bold text-black">0</p>
              <p className="font-mono text-[10px] text-black/40">
                on-chain counter — live after indexer
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[10px] font-bold uppercase text-black/40">
                Reputation
              </p>
              <p className="mt-1 text-2xl font-bold text-black">—</p>
              <p className="font-mono text-[10px] text-black/40">
                attestations coming soon
              </p>
            </div>
          </div>
        </section>

        {/* Bottom spacer */}
        <div className="h-16" />
      </div>
    </div>
  );
}

// ===== Helper Components =====

function Separator() {
  return (
    <div className="h-6 w-full border-x border-pure-black/10 bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(0,0,0,0.03)_4px,rgba(0,0,0,0.03)_5px)]" />
  );
}

function OverviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] font-bold uppercase text-black/40">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold capitalize text-black">{value}</p>
    </div>
  );
}

function IdentityRow({
  label,
  value,
  full,
  href,
}: {
  label: string;
  value: string;
  full: string;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-pure-black/10 px-4 py-2.5">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase text-black/40">
          {label}
        </p>
        <code className="font-mono text-xs text-black">{value}</code>
      </div>
      <div className="flex items-center gap-2">
        <CopyBtn text={full} />
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] font-bold text-electric-purple hover:underline"
        >
          Explorer ↗
        </a>
      </div>
    </div>
  );
}

// CopyBtn wraps the client component
function CopyBtn({ text }: { text: string }) {
  return <CopyButton text={text} />;
}

function QuickLink({
  href,
  label,
  external,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  const cls =
    "flex items-center gap-1 rounded-lg border border-pure-black/10 px-4 py-2 font-mono text-xs font-bold text-black transition-all hover:-translate-y-0.5 hover:border-electric-purple hover:text-electric-purple hover:shadow-[2px_2px_0_0_#6800FF]";
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {label} <span className="text-[10px]">↗</span>
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {label}
    </Link>
  );
}
