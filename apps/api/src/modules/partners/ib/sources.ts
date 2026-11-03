// Where a partner's referred-accounts list comes from. One adapter per method; broker
// API adapters register in brokers.ts API_ADAPTERS when a broker gives us access.
import { parseIbList, type IbRow } from './ib.logic.js';

const MAX_BYTES = 2_000_000;

/**
 * Turns a Google Sheet link into its CSV export URL. Only docs.google.com links are
 * accepted: the server fetches this URL, so it must not be able to reach anything else.
 */
export function sheetCsvUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com') return null;
  const pub = u.pathname.match(/^\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)\/pub/);
  if (pub) return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${u.searchParams.get('gid') ? `&gid=${u.searchParams.get('gid')}` : ''}`;
  const doc = u.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (!doc) return null;
  const gid = u.searchParams.get('gid') ?? u.hash.match(/gid=(\d+)/)?.[1] ?? null;
  return `https://docs.google.com/spreadsheets/d/${doc[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

export class SourceError extends Error {}

export async function fetchSheet(url: string, fetchImpl: typeof fetch = fetch): Promise<{ rows: IbRow[]; skipped: number }> {
  const csv = sheetCsvUrl(url);
  if (!csv) throw new SourceError('Use a Google Sheets link (docs.google.com).');
  let res: Response;
  try {
    res = await fetchImpl(csv, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new SourceError(`Couldn’t reach the sheet (${err instanceof Error ? err.message : 'network error'}).`);
  }
  // A private sheet redirects to a sign-in page, which comes back as HTML.
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok) throw new SourceError(`The sheet answered ${res.status}. Share it as “Anyone with the link can view”, or publish it to the web as CSV.`);
  if (type.includes('text/html')) throw new SourceError('The sheet is private. Share it as “Anyone with the link can view”, or publish it to the web as CSV.');
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new SourceError('The sheet is too large (over 2 MB).');
  return parseIbList(text);
}
