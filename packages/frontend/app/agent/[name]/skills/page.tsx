import Link from 'next/link';

import { AgentManageSidebar } from '../../../../components/agent/agent-manage-sidebar';
import { AgentNotFound } from '../../../../components/agent/agent-not-found';
import { SiteFooter } from '../../../../components/site-footer';
import { SiteHeader } from '../../../../components/site-header';
import { resolveAgentPageData } from '../../../../lib/registry-resolve';

interface Props {
  params: Promise<{ name: string }>;
}

export default async function AgentSkillsPage({ params }: Props) {
  const { name } = await params;
  const data = resolveAgentPageData(name);

  if (!data) {
    return <AgentNotFound name={name} />;
  }

  return (
    <>
      <SiteHeader activeHref="/create" />
      <div className="mx-auto flex min-h-[calc(100vh-180px)] max-w-container min-w-0 px-margin">
        <AgentManageSidebar agentSlug={data.card.slug} />
        <main className="min-w-0 flex-1 py-12 lg:pl-12">
          <h1 className="mb-2 font-display text-3xl font-bold">Analytics</h1>
          <p className="font-mono text-on-surface-variant">
            Resolution trends for {data.card.displayName} — coming soon.
          </p>
          <Link
            href={`/agent/${data.card.slug}`}
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
