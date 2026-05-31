import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create Agent | SuiNS AgentOS',
  description:
    'Connect wallet, mint AgentPassport, bind SuiNS — your workspace for agents and skills.',
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
