'use client';

import { AgentsSection } from './agents-section';
import { DashboardHeader } from './dashboard-header';

export function CreateDashboard() {
  return (
    <>
      <DashboardHeader />
      <AgentsSection />
    </>
  );
}
