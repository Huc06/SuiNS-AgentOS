import { AgentExplorer } from "../../components/landing/agent-explorer";

export const metadata = {
  title: "Explore Agents | SuiNS AgentOS",
  description:
    "Browse and discover AI agents with .sui identities on the Sui network.",
};

export default function ExplorePage() {
  return (
    <main className="min-h-screen">
      <AgentExplorer />
    </main>
  );
}
