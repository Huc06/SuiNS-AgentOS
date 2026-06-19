/**
 * v0 reputation computation — pure, testable helper.
 *
 * TODO: Replace with on-chain AgentPassport reputation field once the
 * contracts attestation module (issue #55) is deployed and indexed.
 */

export type ReputationTier = 'new' | 'rising' | 'trusted';

export interface ReputationResult {
  score: number; // 0-100
  tier: ReputationTier;
}

export function computeAgentReputation(input: {
  skillCount: number;
  resolutions: number;
  status: 'active' | 'revoked';
  hasOnchainPassport: boolean;
}): ReputationResult {
  let score = 0;

  // Active status base
  if (input.status === 'active') score += 20;

  // On-chain passport presence
  if (input.hasOnchainPassport) score += 20;

  // Skills published (up to 30 pts)
  score += Math.min(30, input.skillCount * 10);

  // Resolutions/activity (up to 30 pts)
  score += Math.min(30, Math.floor(input.resolutions * 0.5));

  score = Math.min(100, Math.max(0, score));

  const tier: ReputationTier =
    score >= 60 ? 'trusted' : score >= 30 ? 'rising' : 'new';

  return { score, tier };
}

/** Check if an agent qualifies as "verified" (passport minted + active + on network). */
export function isAgentVerified(agent: {
  passportId?: string;
  status: 'active' | 'revoked';
  network: 'mainnet' | 'testnet';
}): boolean {
  return Boolean(agent.passportId) && agent.status === 'active';
}
