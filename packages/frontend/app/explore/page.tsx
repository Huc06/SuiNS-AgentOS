import { AgentExplorer } from '../../components/landing/agent-explorer';
import { SiteFooter } from '../../components/site-footer';
import { SiteHeader } from '../../components/site-header';

export const metadata = {
  title: 'Explore Agents | SuiNS AgentOS',
  description: 'Browse and discover AI agents with .sui identities on the Sui network.',
};

export default function ExplorePage() {
  return (
    <>
      <SiteHeader activeHref="/explore" />
      <main id="main-content" className="min-h-[calc(100vh-180px)]">
        <AgentExplorer />
      </main>
      <SiteFooter />
    </>
  );
}
