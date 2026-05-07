import { CRITICAL_FLAGS, type FlagKey } from './keys';
import type { Actor, FeatureFlag } from './types';

// Slack webhook stub for critical flag changes (SRS §7.13).
// Falls back to console.log when SLACK_WEBHOOK_URL is unset (dev / test).
export async function notifyCriticalChange(
  before: FeatureFlag | null,
  after: FeatureFlag,
  actor: Actor,
  reason?: string,
): Promise<void> {
  const isCritical = CRITICAL_FLAGS.includes(after.key as FlagKey);
  if (!isCritical) return;

  const verb = before === null
    ? 'created'
    : before.enabled !== after.enabled
      ? after.enabled ? 'enabled' : 'disabled'
      : 'updated';

  const text = `[feature-flag] ${after.key} ${verb} by user#${actor.userId}${reason ? ` — ${reason}` : ''}`;

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('[feature-flags] (no SLACK_WEBHOOK_URL set)', text);
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error('[feature-flags] Slack notify failed:', err);
  }
}
