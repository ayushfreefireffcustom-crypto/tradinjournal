// Hard-timeout JSON GET for macro provider adapters (same pattern as market/calendar).
const FETCH_TIMEOUT_MS = 15_000;

/** GET JSON with a hard timeout merged onto the caller's abort signal. */
export async function fetchJson<T>(
  url: string,
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', ...extraHeaders },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
