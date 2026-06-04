'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AgentsSection } from './agents-section';
import { CreateAgentModal } from './create-agent-modal';
import { DashboardHeader } from './dashboard-header';
import { ImportSkillModal } from './import-skill-modal';

export function CreateDashboard() {
  const searchParams = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [agentsRefreshKey, setAgentsRefreshKey] = useState(0);
  const [defaultImportAgent, setDefaultImportAgent] = useState('');

  useEffect(() => {
    if (searchParams.get('import') === 'skill') {
      setImportOpen(true);
      const agent = searchParams.get('agent');
      if (agent) setDefaultImportAgent(agent);
    }
  }, [searchParams]);

  return (
    <>
      <DashboardHeader
        onCreateAgent={() => setCreateOpen(true)}
        onImportSkill={() => setImportOpen(true)}
      />
      <AgentsSection refreshKey={agentsRefreshKey} />
      <CreateAgentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => setAgentsRefreshKey((k) => k + 1)}
      />
      <ImportSkillModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        defaultAgentSlug={defaultImportAgent}
        onImported={() => setAgentsRefreshKey((k) => k + 1)}
      />
    </>
  );
}
