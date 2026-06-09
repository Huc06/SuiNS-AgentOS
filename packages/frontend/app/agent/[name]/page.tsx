import { AgentManageContent } from '../../../components/agent/agent-manage-content';
import { AgentManageSidebar } from '../../../components/agent/agent-manage-sidebar';
import { AgentNotFound } from '../../../components/agent/agent-not-found';
import { SiteFooter } from '../../../components/site-footer';
import { SiteHeader } from '../../../components/site-header';
import { resolveAgentPageData } from '../../../lib/registry-resolve';

interface Props {
  params: Promise<{ name: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { name } = await params;
  const data = resolveAgentPageData(name);
  const label = data?.card.displayName ?? `@${name}`;
  return {
    title: `Manage ${label} | SuiNS AgentOS`,
    description: `Manage skills, delegation, and passport for ${label}.`,
  };
}

export default async function AgentManagePage({ params }: Props) {
  const { name } = await params;
  const data = resolveAgentPageData(name);

  if (!data) {
    return <AgentNotFound name={name} />;
  }

  return (
    <>
      <SiteHeader activeHref="/create" />
      <div className="mx-auto flex min-h-[calc(100vh-180px)] w-full max-w-container min-w-0 overflow-x-hidden px-margin">
        <AgentManageSidebar agentSlug={data.card.slug} />
        <AgentManageContent
          agentSlug={data.card.slug}
          suinsName={data.resolved.agent.suinsName}
          displayName={data.card.displayName}
          passportVersion={data.card.version}
          description={data.resolved.agent.description}
          initialSkills={data.skills}
        />
      </div>
      <SiteFooter />
    </>
  );
}
