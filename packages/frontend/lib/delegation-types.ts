/** A delegation record stored in the API/registry. */
export interface DelegationRecord {
  id: string;
  childAgent: string;
  childName: string;
  allowedSkills: string[];
  allowedCapabilities: string[];
  spendLimit: string;
  spent: string;
  expiryMs: string;
  revoked: boolean;
  capId?: string;
  createdAt: string;
}

/** Status derived from a delegation record. */
export type DelegationStatus = 'active' | 'expiring' | 'expired' | 'revoked';

export function getDelegationStatus(record: DelegationRecord): DelegationStatus {
  if (record.revoked) return 'revoked';
  const now = Date.now();
  const expiry = parseInt(record.expiryMs, 10);
  if (expiry <= now) return 'expired';
  // "expiring" if within 24h
  if (expiry - now < 86_400_000) return 'expiring';
  return 'active';
}
