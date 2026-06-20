import Link from "next/link";

import { AgentNotFound } from "../../../components/agent/agent-not-found";
import { AgentPassportHeader } from "../../../components/agent/agent-passport-header";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { resolveAgentPageData } from "../../../lib/registry-resolve";
import { registrySkillToRow } from "../../../lib/registry-mappers";

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

  const skills = data.skills;

  return (
    <>
      <SiteHeader activeHref="/explore" />
      <main className="mx-auto w-full max-w-container min-w-0 px-margin py-8">
        {/* Public passport header */}
        <AgentPassportHeader
          agent={data.resolved.agent}
          skillCount={skills.length}
        />

        {/* How to use this agent */}
        <section className="mt-8 border-2 border-pure-black bg-white p-6 neo-shadow">
          <h2 className="mb-4 font-display text-xl font-bold">
            How to use this agent
          </h2>
          <div className="space-y-4 font-mono text-sm text-on-surface-variant">
            <div>
              <p className="font-bold text-on-surface">1. Resolve by name</p>
              <code className="mt-1 block border border-pure-black/20 bg-surface-container px-3 py-2 text-xs">
                agentos agent resolve {data.resolved.agent.suinsName}
              </code>
            </div>
            <div>
              <p className="font-bold text-on-surface">2. Execute a skill</p>
              <code className="mt-1 block border border-pure-black/20 bg-surface-container px-3 py-2 text-xs">
                agentos skill execute{" "}
                {skills[0]?.id
                  ? `${skills[0].id}.${name}.sui`
                  : `<skill>.${name}.sui`}
              </code>
            </div>
            <div>
              <p className="font-bold text-on-surface">3. Use via MCP</p>
              <code className="mt-1 block border border-pure-black/20 bg-surface-container px-3 py-2 text-xs">
                agentos_resolve name=&quot;{data.resolved.agent.suinsName}&quot;
              </code>
            </div>
          </div>
        </section>

        {/* Skills (read-only) */}
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">
              Skills ({skills.length})
            </h2>
          </div>
          {skills.length === 0 ? (
            <div className="border-2 border-dashed border-pure-black/30 bg-white px-6 py-8 text-center">
              <p className="font-mono text-sm text-on-surface-variant">
                No skills published yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {skills.map((skill) => (
                <div
                  key={skill.id}
                  className="border-2 border-pure-black bg-white p-4 neo-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-display text-base font-bold">
                        {skill.name}
                      </p>
                      <p className="mt-1 font-mono text-xs text-on-surface-variant">
                        {skill.mvrPackage} · {skill.version}
                      </p>
                    </div>
                    <span className="border-2 border-green-800 bg-green-100 px-2 py-0.5 font-mono text-[10px] font-bold text-green-800">
                      {skill.status}
                    </span>
                  </div>
                  {skill.dependencies.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {skill.dependencies.map((dep) => (
                        <span
                          key={dep}
                          className="border border-electric-purple/40 bg-electric-purple/10 px-1.5 py-0.5 font-mono text-[10px] text-electric-purple"
                        >
                          {dep}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Manage link */}
        <div className="mt-8 flex gap-4">
          <Link
            href={`/agent/${name}/manage`}
            className="border-2 border-pure-black bg-electric-purple px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0_0_#000]"
          >
            Manage this agent →
          </Link>
          <Link
            href="/explore"
            className="border-2 border-pure-black bg-white px-6 py-3 font-mono text-sm font-bold text-on-surface neo-shadow transition-all hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0_0_#000]"
          >
            ← Back to Explorer
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
