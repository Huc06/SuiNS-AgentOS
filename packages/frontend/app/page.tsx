import { AgentOSLanding } from "../components/landing/agentos-landing";
import { EntryPreloader } from "../components/landing/entry-preloader";

export default function Home() {
  return (
    <EntryPreloader>
      <AgentOSLanding />
    </EntryPreloader>
  );
}
