// Incremental sync surface (FR-4.14.6).
//
// THIS PR ships the contract — a thin pass-through that calls the indexer
// directly. The full Postgres LISTEN/NOTIFY → BullMQ → worker pipeline lands
// in a follow-up branch (likely `feature/recruiter-job-posting` or a
// dedicated `feature/search-sync-pipeline`). Consumers can already call these
// functions today after Job/Company/Article writes; swapping in the queue is
// a non-breaking change because the function signatures stay the same.

import {
  indexArticle,
  indexCompany,
  indexJob,
  removeArticle,
  removeCompany,
  removeJob,
} from './indexers';

export type SyncEntity = 'job' | 'company' | 'article';
export type SyncOp = 'index' | 'remove';

export async function syncJob(jobId: number, op: SyncOp): Promise<void> {
  if (op === 'remove') return removeJob(jobId);
  return indexJob(jobId);
}

export async function syncCompany(companyId: number, op: SyncOp): Promise<void> {
  if (op === 'remove') return removeCompany(companyId);
  return indexCompany(companyId);
}

export async function syncArticle(articleId: number, op: SyncOp): Promise<void> {
  if (op === 'remove') return removeArticle(articleId);
  return indexArticle(articleId);
}
