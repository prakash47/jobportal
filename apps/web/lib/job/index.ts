// Re-export server-session from lib/auth so existing job-detail page imports
// keep working. New code should import from 'lib/auth/server-session' directly.
export { readUserFromCookie } from '../auth/server-session';
export { readApplied, readSaved } from './user-job-state';
