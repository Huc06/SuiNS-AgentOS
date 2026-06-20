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
  const createdDate = new Date(agent.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });

  // Get time-based greeting
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Generate mock contribution data (52 weeks × 7 days)
  // In production this would come from on-chain activity indexer
  const contributions = generateContributions();
  const totalContributions = contributions.reduce((a, b) => a + b, 0);

  return (
    <div className="bg-off-white py-6">
      <div className="mx-auto max-w-3xl px-4">
        {/* ===== Profile Header ===== */}
        <section className="border-x border-b border-pure-black/10">
          <div className="flex items-center gap-5 border-b border-pure-black/10 px-6 py-6">
            {/* Avatar */}
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-pure-black bg-electric-purple font-display text-2xl font-bold text-white shadow-[4px_4px_0_0_#000]">
              {agent.slug.charAt(0).toUpperCase()}
              <span
                className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white ${agent.status === "active" ? "bg-green-500" : "bg-red-500"}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight text-black">
                  {agent.suinsName}
                </h1>
                {agent.status === "active" && (
                  <svg
                    width="18"
                    height="18"
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
              <p className="mt-1 font-mono text-sm text-black/50">
                Autonomous Agent · {agent.network} · Since {createdDate}
              </p>
            </div>
          </div>

          {/* Overview row */}
          <div className="grid grid-cols-2 gap-4 px-6 py-4 sm:grid-cols-4">
            <OverviewItem label="Version" value={agent.passportVersion} />
            <OverviewItem label="Network" value={agent.network} />
            <OverviewItem label="Skills" value={String(skills.length)} />
            <OverviewItem
              label="Delegations"
              value={String(agent.delegations?.length ?? 0)}
            />
          </div>
        </section>

        <Separator />

        {/* ===== Social Links ===== */}
        <section className="border-x border-pure-black/10 px-6 py-4">
          <div className="flex flex-wrap gap-2">
            <SocialButton
              href={explorerObjectUrl(agent.network, agent.passportId)}
              label="Suiscan"
              icon="chain"
            />
            <SocialButton
              href={`/agent/${name}/skills`}
              label="Skills"
              icon="code"
              internal
            />
            <SocialButton
              href={`/agent/${name}/delegate`}
              label="Delegate"
              icon="delegate"
              internal
            />
            <SocialButton
              href={`/agent/${name}/manage`}
              label="Console"
              icon="terminal"
              internal
            />
          </div>
        </section>

        <Separator />

        {/* ===== Greeting + About ===== */}
        <section className="border-x border-pure-black/10 px-6 py-8">
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-black">
            {greeting}
          </h2>
          <ul className="space-y-3 text-sm leading-relaxed text-black/80">
            <li className="flex gap-2">
              <span className="mt-1 text-black/30">•</span>
              <span>
                I&apos;m{" "}
                <strong className="text-black">{agent.suinsName}</strong> — an
                autonomous AI agent on the Sui blockchain with on-chain
                identity, skills, and delegation capabilities.
              </span>
            </li>
            {agent.description && (
              <li className="flex gap-2">
                <span className="mt-1 text-black/30">•</span>
                <span>{agent.description}</span>
              </li>
            )}
            <li className="flex gap-2">
              <span className="mt-1 text-black/30">•</span>
              <span>
                Equipped with{" "}
                <strong className="text-black">
                  {skills.length} skill{skills.length !== 1 ? "s" : ""}
                </strong>{" "}
                including{" "}
                {skills
                  .slice(0, 3)
                  .map((s) => s.name)
                  .join(", ")}
                {skills.length > 3 ? ` and ${skills.length - 3} more` : ""}.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 text-black/30">•</span>
              <span>
                Passport{" "}
                <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">
                  {shortObjectId(agent.passportId)}
                </code>{" "}
                verified on{" "}
                <strong className="text-black capitalize">
                  {agent.network}
                </strong>
                .
              </span>
            </li>
          </ul>
        </section>

        <Separator />

        {/* ===== Contributions Graph ===== */}
        <section className="border-x border-pure-black/10 px-6 py-6">
          <h2 className="mb-1 text-lg font-bold tracking-tight text-black">
            Activity
          </h2>
          <p className="mb-4 font-mono text-xs text-black/50">
            {totalContributions.toLocaleString()} on-chain actions in the past
            365 days.
          </p>

          {/* Month labels */}
          <div className="mb-1 flex">
            <div className="w-7" />
            <div className="flex flex-1 justify-between font-mono text-[9px] text-black/40">
              {[
                "Jun",
                "Jul",
                "Aug",
                "Sep",
                "Oct",
                "Nov",
                "Dec",
                "Jan",
                "Feb",
                "Mar",
                "Apr",
                "May",
              ].map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="flex gap-[2px] overflow-x-auto">
            {/* Day labels */}
            <div className="flex w-7 shrink-0 flex-col justify-between py-[2px] font-mono text-[9px] text-black/40">
              <span>Mon</span>
              <span>Wed</span>
              <span>Fri</span>
            </div>
            {/* Weeks */}
            <div className="flex gap-[2px]">
              {Array.from({ length: 52 }).map((_, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-[2px]">
                  {Array.from({ length: 7 }).map((_, dayIdx) => {
                    const idx = weekIdx * 7 + dayIdx;
                    const level = contributions[idx] ?? 0;
                    return (
                      <div
                        key={dayIdx}
                        className={`h-[10px] w-[10px] rounded-sm ${getContributionColor(level)}`}
                        title={`${level} actions`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center justify-end gap-1 font-mono text-[9px] text-black/40">
            <span>Less</span>
            <div className="h-[10px] w-[10px] rounded-sm bg-black/5" />
            <div className="h-[10px] w-[10px] rounded-sm bg-electric-purple/20" />
            <div className="h-[10px] w-[10px] rounded-sm bg-electric-purple/40" />
            <div className="h-[10px] w-[10px] rounded-sm bg-electric-purple/70" />
            <div className="h-[10px] w-[10px] rounded-sm bg-electric-purple" />
            <span>More</span>
          </div>
        </section>

        <Separator />

        {/* ===== Stack (Skills as tech stack) ===== */}
        <section className="border-x border-pure-black/10 px-6 py-6">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-black">
            Stack{" "}
            <sup className="ml-1 text-sm font-medium text-black/40">
              {skills.length}
            </sup>
          </h2>
          {skills.length === 0 ? (
            <p className="font-mono text-sm text-black/50">
              No skills published yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex items-center gap-3 rounded-lg border border-pure-black/10 bg-white px-3 py-3 transition-colors hover:border-electric-purple/30 hover:bg-electric-purple/[0.02]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-pure-black/10 bg-black/[0.02] text-black/60">
                    {skill.icon === "token" ? (
                      <svg
                        width="16"
                        height="16"
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
                        width="16"
                        height="16"
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
                        width="16"
                        height="16"
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
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-black">
                      {skill.name}
                    </p>
                    <p className="truncate font-mono text-[10px] text-black/40">
                      {skill.mvrPackage}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* ===== Identity / On-chain ===== */}
        <section className="border-x border-pure-black/10 px-6 py-6">
          <h2 className="mb-4 text-lg font-bold tracking-tight text-black">
            On-chain Identity
          </h2>
          <div className="space-y-2">
            <IdentityRow
              label="Passport"
              value={shortObjectId(agent.passportId)}
              full={agent.passportId}
              href={explorerObjectUrl(agent.network, agent.passportId)}
            />
            {agent.runtimeWallet && agent.runtimeWallet !== "0x0" && (
              <IdentityRow
                label="Runtime"
                value={shortObjectId(agent.runtimeWallet)}
                full={agent.runtimeWallet}
                href={explorerObjectUrl(agent.network, agent.runtimeWallet)}
              />
            )}
          </div>
          <div className="mt-4 rounded-lg border border-pure-black/5 bg-black/[0.02] px-4 py-3">
            <p className="font-mono text-[10px] font-bold uppercase text-black/40">
              Resolve
            </p>
            <code className="mt-1 block font-mono text-xs text-black">
              agentos resolve {agent.suinsName}
            </code>
          </div>
        </section>

        <Separator />

        {/* ===== Stats Footer ===== */}
        <section className="border-x border-b border-pure-black/10 px-6 py-6">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase text-black/40">
                Executions
              </p>
              <p className="mt-1 text-2xl font-bold text-black">0</p>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase text-black/40">
                Reputation
              </p>
              <p className="mt-1 text-2xl font-bold text-black">—</p>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase text-black/40">
                Since
              </p>
              <p className="mt-1 text-2xl font-bold text-black">
                {createdDate}
              </p>
            </div>
          </div>
        </section>

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
        <CopyButton text={full} />
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

function SocialButton({
  href,
  label,
  icon,
  internal,
}: {
  href: string;
  label: string;
  icon: string;
  internal?: boolean;
}) {
  const iconSvg = {
    chain: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
    ),
    code: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M16 18l6-6-6-6" />
        <path d="M8 6l-6 6 6 6" />
      </svg>
    ),
    delegate: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87" />
        <path d="M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    terminal: (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  }[icon];

  const cls =
    "flex h-8 w-8 items-center justify-center rounded-lg border border-pure-black/10 bg-white text-black/60 transition-all hover:border-electric-purple hover:text-electric-purple hover:shadow-[2px_2px_0_0_#6800FF]";

  if (internal) {
    return (
      <Link href={href} className={cls} title={label}>
        {iconSvg}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cls}
      title={label}
    >
      {iconSvg}
    </a>
  );
}

// ===== Contribution helpers =====

function getContributionColor(level: number): string {
  if (level === 0) return "bg-black/5";
  if (level <= 2) return "bg-electric-purple/20";
  if (level <= 5) return "bg-electric-purple/40";
  if (level <= 8) return "bg-electric-purple/70";
  return "bg-electric-purple";
}

function generateContributions(): number[] {
  // Seeded pseudo-random for consistent SSR rendering
  const data: number[] = [];
  let seed = 42;
  for (let i = 0; i < 364; i++) {
    seed = (seed * 16807) % 2147483647;
    const rand = seed / 2147483647;
    // Sparse activity — most days zero, some bursts
    if (rand < 0.6) data.push(0);
    else if (rand < 0.8) data.push(Math.floor(rand * 3) + 1);
    else if (rand < 0.95) data.push(Math.floor(rand * 6) + 2);
    else data.push(Math.floor(rand * 12) + 5);
  }
  return data;
}
