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
