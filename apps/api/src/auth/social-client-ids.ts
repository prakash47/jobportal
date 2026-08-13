/**
 * Which OAuth client IDs we accept as the `aud` of an incoming ID token.
 *
 * This is the audience check, and it is the difference between "a token minted
 * for OUR app" and "any valid Google token from any app on the internet".
 * Google will happily sign a token for someone else's client id; if we did not
 * pin `aud`, an attacker could take a token their own app legitimately issued
 * and present it here.
 *
 * A LIST per provider, because one logical app has several client ids:
 *   - Google: separate ids for Android, iOS and Web.
 *   - Apple: the iOS bundle id, plus a Services ID if Apple sign-in is ever
 *     offered on the website.
 *
 * UNSET MEANS DISABLED. An empty list makes the verifier reject every token
 * for that provider, so a missing env var fails closed rather than opening a
 * provider nobody configured.
 */

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Accepted Google audiences.
 *
 * Falls back to the existing single `GOOGLE_CLIENT_ID` used by the browser
 * flow, so a deployment that has only ever configured web sign-in still works
 * for a web-issued token without a second variable being set.
 */
export function googleAudiences(env: NodeJS.ProcessEnv = process.env): string[] {
  const list = parseList(env['GOOGLE_MOBILE_CLIENT_IDS']);
  const web = env['GOOGLE_CLIENT_ID']?.trim();
  if (web && !list.includes(web)) list.push(web);
  return list;
}

/** Accepted Apple audiences. No fallback — Apple has no pre-existing flow. */
export function appleAudiences(env: NodeJS.ProcessEnv = process.env): string[] {
  return parseList(env['APPLE_CLIENT_IDS']);
}
