import { AgentManageContent } from "../../../../components/agent/agent-manage-content";
import { AgentManageSidebar } from "../../../../components/agent/agent-manage-sidebar";
import { AgentNotFound } from "../../../../components/agent/agent-not-found";
import { AgentPassportHeader } from "../../../../components/agent/agent-passport-header";
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
    title: `${label} — Agent Passport | SuiNS AgentOS`,
    description: `On-chain passport for ${label}. Skills, delegation, and reputation on Sui.`,
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
      <div className="mx-auto w-full max-w-container min-w-0 overflow-x-hidden px-margin pt-8">
        {/* Public passport header — visible to ALL visitors */}
        <AgentPassportHeader
          agent={data.resolved.agent}
          skillCount={data.skills.length}
        />
      </div>
      <div className="mx-auto flex min-h-[calc(100vh-400px)] w-full max-w-container flex-col min-w-0 overflow-x-hidden px-margin lg:flex-row">
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
