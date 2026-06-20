import { AgentManageSidebar } from "../../../../components/agent/agent-manage-sidebar";
import { AgentNotFound } from "../../../../components/agent/agent-not-found";
import { DelegateContent } from "../../../../components/agent/delegate-content";
import { SiteFooter } from "../../../../components/site-footer";
import { SiteHeader } from "../../../../components/site-header";
import { resolveAgentPageData } from "../../../../lib/registry-resolve";

interface Props {
  params: Promise<{ name: string }>;
}

export default async function AgentDelegatePage({ params }: Props) {
  const { name } = await params;
  const data = await resolveAgentPageData(name);

  if (!data) {
    return <AgentNotFound name={name} />;
  }

  return (
    <>
      <SiteHeader activeHref="/create" />
      <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-container flex-col min-w-0 px-margin lg:flex-row">
        <AgentManageSidebar agentSlug={data.card.slug} />
        <main className="min-w-0 flex-1 py-12 lg:pl-12">
          <DelegateContent
            agentSlug={data.card.slug}
            passportId={data.resolved.agent.passportId}
          />
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
