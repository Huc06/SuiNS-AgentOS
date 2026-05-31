import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AgentManageContent } from '../../../components/agent/agent-manage-content';
import { AgentManageSidebar } from '../../../components/agent/agent-manage-sidebar';
import { SiteFooter } from '../../../components/site-footer';
import { SiteHeader } from '../../../components/site-header';
import { getAgentBySlug } from '../../../lib/mock-agents';

interface Props {
  params: Promise<{ name: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { name } = await params;
  const agent = getAgentBySlug(name);
  const label = agent?.displayName ?? `@${name}`;
  return {
    title: `Manage ${label} | SuiNS AgentOS`,
    description: `Manage skills, delegation, and passport for ${label}.`,
  };
}

export default async function AgentManagePage({ params }: Props) {
  const { name } = await params;
  const agent = getAgentBySlug(name);

  if (!agent) {
    return (
      <>
        <SiteHeader activeHref="/create" />
        <main className="mx-auto max-w-container px-margin py-32">
          <h1 className="font-display text-3xl font-bold">Agent not found</h1>
          <p className="mt-4 font-mono text-on-surface-variant">
            No passport for <strong>{name}</strong> in the registry (mock data).
          </p>
          <Link
            href="/create"
            className="mt-8 inline-block border-2 border-pure-black bg-electric-purple px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow"
          >
            Back to Dashboard
          </Link>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader activeHref="/create" />
      <div className="mx-auto flex min-h-[calc(100vh-180px)] w-full max-w-container min-w-0 overflow-x-hidden px-margin">
        <AgentManageSidebar agentSlug={name} />
        <AgentManageContent
          agentSlug={name}
          displayName={agent.displayName}
          passportVersion={agent.version}
        />
      </div>
      <SiteFooter />
    </>
  );
}
