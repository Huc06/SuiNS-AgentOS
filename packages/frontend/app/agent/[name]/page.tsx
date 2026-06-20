import Link from "next/link";

import { AgentNotFound } from "../../../components/agent/agent-not-found";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { resolveAgentPageData } from "../../../lib/registry-resolve";
import { shortObjectId } from "../../../lib/registry-mappers";
import { explorerObjectUrl } from "../../../lib/explorer-links";

interface Props {
  params: Promise<{ name: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { name } = await params;
  const data = resolveAgentPageData(name);
  const label = data?.card.displayName ?? `@${name}`;
  return {
    title: `${label} — Agent Profile | SuiNS AgentOS`,
    description: `Public profile for ${label}. View skills, identity, and delegation on Sui.`,
  };
}

export default async function AgentProfilePage({ params }: Props) {
  const { name } = await params;
  const data = resolveAgentPageData(name);

  if (!data) {
    return <AgentNotFound name={name} />;
  }

  const agent = data.resolved.agent;
  const skills = data.skills;
  const deps = skills.flatMap((s) => s.dependencies ?? []);
  const uniqueDeps = [...new Set(deps)];

  return (
    <>
      <SiteHeader activeHref="/explore" />

      {/* Package-style header */}
      <div className="border-b-2 border-pure-black bg-on-surface">
        <div className="mx-auto max-w-container px-margin py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border-2 border-electric-purple bg-electric-purple/20 font-display text-sm font-bold text-electric-purple">
              AG
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-off-white">
                {agent.suinsName}
              </h1>
              <p className="font-mono text-xs text-off-white/60">
                {agent.passportVersion} · {agent.network} ·{" "}
                {shortObjectId(agent.passportId)}{" "}
                <a
                  href={explorerObjectUrl(agent.network, agent.passportId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-electric-purple hover:underline"
                >
                  ↗
                </a>
              </p>
            </div>
          </div>
          {/* Network tab */}
          <div className="mt-4">
            <span className="border-b-2 border-electric-purple pb-2 font-mono text-xs font-bold text-electric-purple">
              {agent.network === "mainnet" ? "Mainnet" : "Testnet"}
            </span>
          </div>
        </div>
      </div>

      {/* Three-column layout */}
      <div className="mx-auto flex max-w-container min-h-[60vh]">
        {/* Left sidebar — navigation */}
        <aside className="hidden w-48 shrink-0 border-r-2 border-pure-black bg-off-white py-6 lg:block">
          <nav className="space-y-1 px-4">
            <a
              href="#overview"
              className="flex items-center gap-2 border-2 border-electric-purple bg-electric-purple/10 px-3 py-2 font-mono text-xs font-bold text-electric-purple"
            >
              📄 Overview
            </a>
            <a
              href="#skills"
              className="flex items-center gap-2 px-3 py-2 font-mono text-xs font-bold text-on-surface-variant hover:bg-surface-container"
            >
              🔧 Skills{" "}
              <span className="ml-auto border border-pure-black/20 bg-surface-container px-1.5 text-[10px]">
                {skills.length}
              </span>
            </a>
            <a
              href="#dependencies"
              className="flex items-center gap-2 px-3 py-2 font-mono text-xs font-bold text-on-surface-variant hover:bg-surface-container"
            >
              🔗 Dependencies{" "}
              <span className="ml-auto border border-pure-black/20 bg-surface-container px-1.5 text-[10px]">
                {uniqueDeps.length}
              </span>
            </a>
            <Link
              href={`/agent/${name}/manage`}
              className="flex items-center gap-2 px-3 py-2 font-mono text-xs font-bold text-on-surface-variant hover:bg-surface-container"
            >
              🤝 Delegation
            </Link>
            <span className="flex items-center gap-2 px-3 py-2 font-mono text-xs text-on-surface-variant/50">
              📊 Analytics{" "}
              <span className="ml-2 text-[10px] italic">coming soon</span>
            </span>
          </nav>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 border-r-2 border-pure-black px-6 py-6 lg:px-10">
          {/* Overview section */}
          <section id="overview" className="mb-10">
            <h2 className="mb-4 font-display text-lg font-bold">Overview</h2>
            {agent.description ? (
              <p className="font-mono text-sm text-on-surface-variant">
                {agent.description}
              </p>
            ) : (
              <div className="border-2 border-dashed border-pure-black/20 px-4 py-6 text-center">
                <p className="font-mono text-sm text-on-surface-variant">
                  No README found. Add a description in the agent management
                  panel.
                </p>
              </div>
            )}
          </section>

          {/* Skills section */}
          <section id="skills" className="mb-10">
            <h2 className="mb-4 font-display text-lg font-bold">
              Skills ({skills.length})
            </h2>
            {skills.length === 0 ? (
              <p className="font-mono text-sm text-on-surface-variant">
                No skills published.
              </p>
            ) : (
              <div className="space-y-3">
                {skills.map((skill) => (
                  <div
                    key={skill.id}
                    className="border-2 border-pure-black bg-white p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-mono text-sm font-bold">
                          {skill.name}
                        </p>
                        <p className="font-mono text-xs text-on-surface-variant">
                          {skill.mvrPackage} · {skill.version}
                        </p>
                      </div>
                      <span className="border border-green-800 bg-green-100 px-2 py-0.5 font-mono text-[10px] font-bold text-green-800">
                        {skill.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Dependencies section */}
          <section id="dependencies">
            <h2 className="mb-4 font-display text-lg font-bold">
              Dependencies ({uniqueDeps.length})
            </h2>
            {uniqueDeps.length === 0 ? (
              <p className="font-mono text-sm text-on-surface-variant">
                No dependencies.
              </p>
            ) : (
              <div className="space-y-2">
                {uniqueDeps.map((dep) => (
                  <div
                    key={dep}
                    className="border border-pure-black/20 bg-surface-container px-3 py-2 font-mono text-xs"
                  >
                    {dep}
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>

        {/* Right sidebar — metadata */}
        <aside className="hidden w-64 shrink-0 bg-off-white py-6 pl-6 xl:block">
          <div className="space-y-6">
            {/* Resolve */}
            <div>
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase text-on-surface-variant">
                Resolve
              </h3>
              <p className="mb-1 font-mono text-xs text-on-surface-variant">
                You can resolve this agent by calling
              </p>
              <div className="flex items-center gap-1 border-2 border-pure-black bg-on-surface px-3 py-2">
                <code className="flex-1 font-mono text-xs text-off-white">
                  agentos resolve {agent.suinsName}
                </code>
                <button
                  type="button"
                  className="shrink-0 text-off-white/60 hover:text-off-white"
                  aria-label="Copy"
                >
                  📋
                </button>
              </div>
            </div>

            {/* Executions */}
            <div>
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase text-on-surface-variant">
                Skill Executions
              </h3>
              <p className="font-display text-2xl font-bold">0</p>
              <p className="font-mono text-[10px] text-on-surface-variant">
                on-chain executions (coming soon)
              </p>
            </div>

            {/* Description */}
            <div>
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase text-on-surface-variant">
                Description
              </h3>
              <p className="font-mono text-xs text-on-surface-variant">
                {agent.description || "No description provided."}
              </p>
            </div>

            {/* Links */}
            <div>
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase text-on-surface-variant">
                Links
              </h3>
              <div className="space-y-1">
                <a
                  href={explorerObjectUrl(agent.network, agent.passportId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block font-mono text-xs text-electric-purple hover:underline"
                >
                  🔗 Suiscan (Passport)
                </a>
                <Link
                  href={`/agent/${name}/manage`}
                  className="block font-mono text-xs text-electric-purple hover:underline"
                >
                  ⚙️ Management Console
                </Link>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <SiteFooter />
    </>
  );
}
