// Client for the account pages (Part H): profile, tour, activity, data export,
// deleting the account, and feedback. Sessions and two-factor go through the
// better-auth client (authClient).
import { ApiError } from '@/lib/copy-api';

const API = process.env.NEXT_PUBLIC_API_URL || '';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}/api${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string; details?: Record<string, string[]> } } | null;
  if (!res.ok) {
    const details = json?.error?.details;
    const first = details ? Object.values(details).flat()[0] : undefined;
    throw new ApiError(first ?? json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code, details);
  }
  return json!.data as T;
}
const body = (method: string, b: unknown): RequestInit => ({ method, body: JSON.stringify(b) });

export interface Profile { name: string; email: string; phone: string | null; timezone: string; createdAt: string; twoFactorEnabled: boolean; hasPassword: boolean; signInMethods: string[] }
export interface TourState { seen: string[]; dismissed: boolean }
export type ActivityGroup = 'all' | 'security' | 'trading' | 'orders';
export interface ActivityItem { id: string; at: string; kind: string; summary: string; ip: string | null; device: string | null; group: 'security' | 'trading' | 'orders' }
export interface FeedbackRow { id: string; kind: 'bug' | 'feedback' | 'question'; message: string; status: 'new' | 'read' | 'done'; createdAt: string }
export interface AdminFeedbackRow extends FeedbackRow { page: string | null; userAgent: string | null; readAt: string | null; user: { email: string; name: string } }

export const accountApi = {
  profile: () => call<Profile>('/me/profile'),
  updateProfile: (b: { name?: string; phone?: string | null; timezone?: string }) => call<Profile>('/me/profile', body('PATCH', b)),
  tour: () => call<TourState>('/me/tour'),
  updateTour: (b: { seen?: string[]; dismissed?: boolean; reset?: boolean }) => call<TourState>('/me/tour', body('PATCH', b)),
  activity: (group: ActivityGroup, before?: string) => call<{ items: ActivityItem[]; nextBefore: string | null }>(`/me/activity?group=${group}${before ? `&before=${encodeURIComponent(before)}` : ''}`),
  deleteStatus: () => call<{ blockers: string[] }>('/me/delete'),
  deleteRequest: () => call<{ sentTo: string; expiresAt: string }>('/me/delete/request', { method: 'POST', body: '{}' }),
  deleteConfirm: (otp: string) => call<{ deleted: true }>('/me/delete/confirm', body('POST', { otp, confirm: 'DELETE' })),
  /** Downloads the export as a file. */
  async exportData(): Promise<void> {
    const res = await fetch(`${API}/api/me/export`, { credentials: 'include' });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new ApiError(j?.error?.message ?? `Export failed (${res.status})`, res.status);
    }
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'tradelogs-export.json';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  feedback: (b: { kind: 'bug' | 'feedback' | 'question'; message: string; page?: string }) => call<{ id: string; createdAt: string }>('/feedback', body('POST', b)),
  myFeedback: () => call<FeedbackRow[]>('/feedback/mine'),
  adminFeedback: (status?: string, cursor?: string) => call<{ items: AdminFeedbackRow[]; nextCursor: string | null; counts: Record<string, number> }>(`/admin/feedback${status || cursor ? '?' : ''}${status ? `status=${status}` : ''}${status && cursor ? '&' : ''}${cursor ? `cursor=${cursor}` : ''}`),
  setFeedbackStatus: (id: string, status: 'new' | 'read' | 'done') => call<{ id: string; status: string }>(`/admin/feedback/${id}`, body('PATCH', { status })),
};

/** "Chrome on macOS" from a user agent (same rules as the API's activity log). */
export function deviceOf(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /curl|node|undici|Postman/i.test(ua) ? 'API client' : null;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : null;
  return browser && os ? `${browser} on ${os}` : browser ?? os ?? 'Unknown device';
}

/** An IP worth showing: not the unspecified or loopback address a local or proxied request records. */
export function shownIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v = ip.replace(/^::ffff:/, '');
  if (/^(0{1,4}:){7}0{1,4}$|^::$|^::1$|^127\.|^0\.0\.0\.0$/.test(v)) return null;
  return v;
}
