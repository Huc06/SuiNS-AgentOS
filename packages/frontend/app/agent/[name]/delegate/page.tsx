import Link from "next/link";

import { AgentNotFound } from "../../../../components/agent/agent-not-found";
import { DelegateContent } from "../../../../components/agent/delegate-content";
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

  const agent = data.resolved.agent;

  return (
    <div className="py-6">
      <div className="mx-auto max-w-3xl px-4">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 font-mono text-xs text-black/50">
          <Link href="/explore" className="hover:text-black">
            Portfolio
          </Link>
          <span>/</span>
          <Link href={`/agent/${name}`} className="hover:text-black">
            @{agent.slug}
          </Link>
          <span>/</span>
          <span className="font-bold text-black">Delegate</span>
        </nav>

        {/* Page content */}
        <DelegateContent
          agentSlug={data.card.slug}
          passportId={data.resolved.agent.passportId}
        />
      </div>
    </div>
  );
}
