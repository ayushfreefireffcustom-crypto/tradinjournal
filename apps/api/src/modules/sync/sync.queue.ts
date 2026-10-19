// In-process sync queue. Each account is queued at most once; concurrent requests
// share the same result. User-facing syncs ('high') jump ahead of background ones
// ('low'). Concurrency is bounded (SYNC_CONCURRENCY) because the MT5 bridge
// serialises on a single terminal — queueing here keeps callers off its lock.
import { env } from '@tradinjournal/config';
import { syncAccount, type SyncResult } from './sync.service.js';

export type Priority = 'high' | 'low';
type Runner = (accountId: string) => Promise<SyncResult>;

interface Job { accountId: string; priority: Priority; promise: Promise<SyncResult>; resolve: (r: SyncResult) => void }

export class SyncQueue {
  private waiting: Job[] = [];
  private jobs = new Map<string, Job>();
  private active = 0;

  constructor(private readonly run: Runner, private readonly concurrency: number) {}

  /** Queue (or join) a sync for this account. Resolves when it has run. */
  request(accountId: string, priority: Priority = 'low'): Promise<SyncResult> {
    const existing = this.jobs.get(accountId);
    if (existing) {
      // Still waiting and now someone is waiting on it: move it to the front.
      if (priority === 'high' && existing.priority === 'low' && this.waiting.includes(existing)) {
        existing.priority = 'high';
        this.waiting = [existing, ...this.waiting.filter(j => j !== existing)];
      }
      return existing.promise;
    }
    let resolve!: (r: SyncResult) => void;
    const promise = new Promise<SyncResult>(r => { resolve = r; });
    const job: Job = { accountId, priority, promise, resolve };
    this.jobs.set(accountId, job);
    if (priority === 'high') {
      const firstLow = this.waiting.findIndex(j => j.priority === 'low');
      if (firstLow < 0) this.waiting.push(job); else this.waiting.splice(firstLow, 0, job);
    } else this.waiting.push(job);
    this.pump();
    return promise;
  }

  stats() { return { waiting: this.waiting.length, active: this.active }; }

  private pump(): void {
    while (this.active < this.concurrency && this.waiting.length) {
      const job = this.waiting.shift()!;
      this.active++;
      this.run(job.accountId)
        .catch((err): SyncResult => ({ status: 'failed', error: err instanceof Error ? err : new Error(String(err)) }))
        .then(r => {
          this.active--;
          this.jobs.delete(job.accountId);
          job.resolve(r);
          this.pump();
        });
    }
  }
}

let queue: SyncQueue | null = null;
export function syncQueue(): SyncQueue {
  return (queue ??= new SyncQueue(id => syncAccount(id), env.SYNC_CONCURRENCY));
}

/** Like request(), but gives up waiting after `ms` (the sync keeps running). */
export async function requestSyncWithin(accountId: string, priority: Priority, ms: number): Promise<SyncResult | 'timeout'> {
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>(r => { t = setTimeout(() => r('timeout'), ms); });
  try { return await Promise.race([syncQueue().request(accountId, priority), timeout]); }
  finally { clearTimeout(t); }
}
