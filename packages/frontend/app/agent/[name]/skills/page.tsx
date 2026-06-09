import Link from "next/link";

import { AgentManageSidebar } from "../../../../components/agent/agent-manage-sidebar";
import { AgentNotFound } from "../../../../components/agent/agent-not-found";
import {
  SkillDependencyGraph,
  skillRowToGraphSkill,
} from "../../../../components/agent/skill-dependency-graph";
import { SkillListItem } from "../../../../components/agent/skill-list-item";
import { ImportSkillDialog } from "../../../../components/agent/import-skill-dialog";
import { SiteFooter } from "../../../../components/site-footer";
import { SiteHeader } from "../../../../components/site-header";
import { resolveAgentPageData } from "../../../../lib/registry-resolve";

interface Props {
  params: Promise<{ name: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { name } = await params;
  const data = resolveAgentPageData(name);
  const label = data?.card.displayName ?? `@${name}`;
  return {
    title: `Skills · ${label} | SuiNS AgentOS`,
    description: `Skills registered for ${label}.`,
  };
}

export default async function AgentSkillsPage({ params }: Props) {
  const { name } = await params;
  const data = resolveAgentPageData(name);

  if (!data) {
    return <AgentNotFound name={name} />;
  }

  const skills = data.skills;
  const hasDependencyEdges = skills.some(
    (skill) => (skill.dependencies?.length ?? 0) > 0,
  );

  return (
    <>
      <SiteHeader activeHref="/create" />
      <div className="mx-auto flex min-h-[calc(100vh-180px)] w-full max-w-container min-w-0 overflow-x-hidden px-margin">
        <AgentManageSidebar agentSlug={data.card.slug} />
        <main className="min-w-0 flex-1 py-8 sm:py-12 lg:pl-12">
          <div className="mb-8 flex flex-col gap-4 sm:mb-12 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="mb-2 font-display text-3xl font-bold md:text-4xl">
                Skills
              </h1>
              <p className="font-mono text-base text-on-surface-variant">
                {data.card.displayName} · {data.card.version}
              </p>
            </div>
            <ImportSkillDialog agentName={data.card.slug} />
          </div>

          <div className="min-w-0 space-y-6">
            {skills.length > 0 ? (
              skills.map((skill) => (
                <SkillListItem key={skill.id} skill={skill} />
              ))
            ) : (
              <p className="border-2 border-dashed border-pure-black py-12 text-center font-mono text-sm text-on-surface-variant">
                No skills registered yet. Import a skill from the dashboard.
              </p>
            )}
          </div>

          {hasDependencyEdges && (
            <section className="mt-8 min-w-0 sm:mt-12">
              <h2 className="mb-4 font-display text-2xl font-bold">
                Dependency Graph
              </h2>
              <SkillDependencyGraph skills={skills.map(skillRowToGraphSkill)} />
            </section>
          )}

          <Link
            href={`/agent/${data.card.slug}`}
            className="mt-8 inline-block font-mono text-sm font-bold text-electric-purple hover:underline"
          >
            ← Back to manage
          </Link>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
