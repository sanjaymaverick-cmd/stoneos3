import { ClerkOfflineError } from "@clerk/nextjs/errors";
import { DEMO_MODE, DEMO_TOKEN } from "./demo";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

// getToken() throws ClerkOfflineError instead of returning null when the
// client is offline (Clerk Core 3). Callers here already treat a null
// token as "skip this load" (e.g. signed out), so offline collapses into
// the same no-op rather than an unhandled rejection.
export async function safeGetToken(getToken: () => Promise<string | null>) {
  // Demo environment: there's no Clerk session, so hand back a placeholder
  // token. The backend's demo guard ignores its contents and treats the
  // request as the read-only demo owner.
  if (DEMO_MODE) return DEMO_TOKEN;
  try {
    return await getToken();
  } catch (e) {
    if (ClerkOfflineError.is(e)) return null;
    throw e;
  }
}

export async function apiFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}
