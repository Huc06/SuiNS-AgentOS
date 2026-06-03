'use client';

import { useState } from 'react';

import { AgentsSection } from './agents-section';
import { CreateAgentModal } from './create-agent-modal';
import { DashboardHeader } from './dashboard-header';
import { ImportSkillModal } from './import-skill-modal';

export function CreateDashboard() {
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <DashboardHeader
        onCreateAgent={() => setCreateOpen(true)}
        onImportSkill={() => setImportOpen(true)}
      />
      <AgentsSection />
      <CreateAgentModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ImportSkillModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
