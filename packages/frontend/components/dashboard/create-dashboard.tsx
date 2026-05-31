'use client';

import { useState } from 'react';

import { AgentsSection } from './agents-section';
import { CreateAgentModal } from './create-agent-modal';
import { DashboardHeader } from './dashboard-header';

export function CreateDashboard() {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <DashboardHeader onCreateAgent={() => setCreateOpen(true)} />
      <AgentsSection />
      <CreateAgentModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
