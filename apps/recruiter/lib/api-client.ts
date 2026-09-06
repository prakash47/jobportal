// Tiny fetch wrapper that points at the BFF and forwards cookies. Mirror of
// apps/web/lib/profile/api-client.ts — keeps the API URL + credentials handling
// in one place so client components don't repeat the boilerplate.
//
// Routes through apiFetch, so an expired 15-minute access cookie refreshes and
// retries instead of surfacing "No access token". Nearly every recruiter API
// call already goes through this file, which is why the fix lands here rather
// than in eleven components.
import { apiFetch } from './api/fetch';

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

// A rejected fetch (API down, offline, DNS) surfaces as status 0 with a
// friendly message instead of throwing — callers' loading/error states stay
// coherent without every dialog needing its own try/catch.
const NETWORK_ERROR = {
  ok: false,
  status: 0,
  message: 'Network error — please check your connection and try again.',
} as const;

export async function api<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await apiFetch(`${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    return NETWORK_ERROR;
  }
  if (res.status === 204) return { ok: true, data: undefined as T };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message =
      (body as { message?: string } | null)?.message ?? `Request failed (${res.status})`;
    return { ok: false, status: res.status, message };
  }
  return { ok: true, data: body as T };
}

// Multipart variant — does NOT set Content-Type so the browser fills in the
// boundary parameter. Used by the logo uploader.
export async function apiMultipart<T>(path: string, formData: FormData): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await apiFetch(`${path}`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    return NETWORK_ERROR;
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message =
      (body as { message?: string } | null)?.message ?? `Upload failed (${res.status})`;
    return { ok: false, status: res.status, message };
  }
  return { ok: true, data: body as T };
}
