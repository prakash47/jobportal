import { apiErrorMessage } from '../../lib/auth/api-error';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Single fetch helper for the onboarding flow. Sends cookies (the seeker is
// auto-logged-in), JSON-encodes the body when present, and unwraps Zod issue
// arrays into a readable string via apiErrorMessage (never "[object Object]").
export async function apiSend<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<ApiResult<T>> {
  // Build init conditionally — under exactOptionalPropertyTypes we can't pass
  // explicit `undefined` for headers/body.
  const init: RequestInit = { method, credentials: 'include' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    return { ok: false, error: 'Network error. Check your connection and try again.' };
  }

  if (res.status === 204) return { ok: true, data: undefined as T };

  const parsed = (await res.json().catch(() => ({}))) as unknown;
  if (res.ok) return { ok: true, data: parsed as T };
  return { ok: false, error: apiErrorMessage(parsed, 'Something went wrong. Please try again.') };
}

// Multipart POST (file upload). No Content-Type header — the browser sets the
// multipart boundary itself; setting it manually breaks the boundary.
export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
  } catch {
    return { ok: false, error: 'Network error. Check your connection and try again.' };
  }

  if (res.status === 204) return { ok: true, data: undefined as T };

  const parsed = (await res.json().catch(() => ({}))) as unknown;
  if (res.ok) return { ok: true, data: parsed as T };
  return { ok: false, error: apiErrorMessage(parsed, 'Could not upload your file. Please try again.') };
}
