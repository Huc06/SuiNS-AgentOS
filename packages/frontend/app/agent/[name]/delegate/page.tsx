import Link from 'next/link';

import { AgentManageSidebar } from '../../../../components/agent/agent-manage-sidebar';
import { SiteFooter } from '../../../../components/site-footer';
import { SiteHeader } from '../../../../components/site-header';
import { getAgentBySlug } from '../../../../lib/mock-agents';

interface Props {
  params: Promise<{ name: string }>;
}

export default async function AgentDelegatePage({ params }: Props) {
  const { name } = await params;
  const agent = getAgentBySlug(name);

  if (!agent) {
    return (
      <>
        <SiteHeader activeHref="/create" />
        <main className="mx-auto max-w-container px-margin py-32">
          <p className="font-mono">Unknown agent: {name}</p>
          <Link href="/create" className="mt-4 inline-block font-mono text-sm font-bold text-electric-purple">
            Dashboard
          </Link>
        </main>
        <SiteFooter />
      </>
    );
  }

  return (
    <>
      <SiteHeader activeHref="/create" />
      <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-container min-w-0 px-margin">
        <AgentManageSidebar agentSlug={name} />
        <main className="min-w-0 flex-1 py-12 lg:pl-12">
          <h1 className="mb-2 font-display text-3xl font-bold">Delegation</h1>
          <p className="font-mono text-on-surface-variant">
            Sub-agent policies for {agent.displayName} — coming soon.
          </p>
          <Link
            href={`/agent/${name}`}
            className="mt-8 inline-block font-mono text-sm font-bold text-electric-purple hover:underline"
          >
            ← Back to skills
          </Link>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
