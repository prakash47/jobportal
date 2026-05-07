// Tiny fetch wrapper that points at the BFF and forwards cookies. Keeps the
// API URL handling in one place so routes don't repeat the same boilerplate.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
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
// boundary parameter. Used by the resume uploader.
export async function apiMultipart<T>(
  path: string,
  formData: FormData,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });
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
