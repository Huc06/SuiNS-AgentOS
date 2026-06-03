import type { AgentCardData } from '../components/dashboard/agent-card';

export type AgentSkillRow = {
  id: string;
  name: string;
  mvrPackage: string;
  network: 'mainnet' | 'testnet';
  version: string;
  objectId: string;
  status: 'active' | 'archived';
  resolutions: string;
  lastUpdated: string;
  icon: 'token' | 'wallet' | 'swap';
};

export const MOCK_AGENTS: AgentCardData[] = [
  {
    slug: 'alpha',
    displayName: '@alpha',
    version: 'Passport v1.2.4',
    network: 'mainnet',
    metric: '842k resolutions',
    trend: 'up',
    icon: 'package',
  },
  {
    slug: 'beta-agent',
    displayName: '@beta-agent',
    version: 'Passport v0.9.1-beta',
    network: 'testnet',
    metric: '120k resolutions',
    trend: 'up',
    icon: 'terminal',
  },
  {
    slug: 'walrus-bot',
    displayName: '@walrus-bot',
    version: 'Passport v2.1.0',
    network: 'mainnet',
    metric: '358k resolutions',
    trend: 'flat',
    icon: 'database',
  },
];

export const MOCK_AGENT_SKILLS: Record<string, AgentSkillRow[]> = {
  alpha: [
    {
      id: 'web-search',
      name: 'web-search',
      mvrPackage: '@alpha/web-search',
      network: 'mainnet',
      version: 'v1.2',
      objectId: '0x74a1…6c7c9c',
      status: 'active',
      resolutions: '842,930',
      lastUpdated: '2 days ago',
      icon: 'token',
    },
    {
      id: 'delegate-policy',
      name: 'delegate-policy',
      mvrPackage: '@alpha/delegate-policy',
      network: 'mainnet',
      version: 'v3.0',
      objectId: '0x9a2b…bc442d',
      status: 'active',
      resolutions: '391,200',
      lastUpdated: '1 week ago',
      icon: 'swap',
    },
  ],
  'beta-agent': [
    {
      id: 'sandbox-tool',
      name: 'sandbox-tool',
      mvrPackage: '@beta-agent/sandbox',
      network: 'testnet',
      version: 'v0.4.1',
      objectId: '0x3f01…de901a',
      status: 'archived',
      resolutions: '12,402',
      lastUpdated: '3 months ago',
      icon: 'wallet',
    },
  ],
  'walrus-bot': [
    {
      id: 'walrus-read',
      name: 'walrus-read',
      mvrPackage: '@walrus-bot/storage-read',
      network: 'mainnet',
      version: 'v2.1',
      objectId: '0x88c4…11fa02',
      status: 'active',
      resolutions: '358,110',
      lastUpdated: '4 days ago',
      icon: 'token',
    },
  ],
};

export function getAgentBySlug(slug: string): AgentCardData | undefined {
  return MOCK_AGENTS.find((a) => a.slug === slug);
}

export function getSkillsForAgent(slug: string): AgentSkillRow[] {
  return MOCK_AGENT_SKILLS[slug] ?? [];
}
