import { createHash } from 'node:crypto';

// Deterministic 0..99 bucket for PERCENTAGE_ROLLOUT (SRS §7.5).
// Same (userId, flagKey) input always produces the same bucket — this is the
// guarantee that a user keeps the same A/B variant across requests.
export function bucket(userId: number, flagKey: string): number {
  const hex = createHash('sha1').update(`${userId}:${flagKey}`).digest('hex');
  // First 4 hex chars = 16-bit unsigned int → [0, 65535]
  const n = parseInt(hex.slice(0, 4), 16);
  return n % 100;
}
