const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Whether Google sign-in is configured on the API — drives "Continue with
// Google" button visibility (the no-op-when-unconfigured pattern). Server-side
// fetch, cached 5 min. Fails CLOSED (no button) if the API is unreachable.
export async function getGoogleEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/google/status`, { next: { revalidate: 300 } });
    if (!res.ok) return false;
    const json = (await res.json()) as { enabled?: boolean };
    return json.enabled === true;
  } catch {
    return false;
  }
}
