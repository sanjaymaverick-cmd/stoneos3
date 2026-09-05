const apiUrl = process.env.NEXT_PUBLIC_API_URL;

// Kept as the single place every page reaches for its token, so call sites did
// not have to change when the app moved off Clerk. Clerk's getToken() could
// throw (ClerkOfflineError) instead of returning null; ours cannot, so this is
// now just a null-safe pass-through. Callers already treat a null token as
// "skip this load".
export async function safeGetToken(getToken: () => Promise<string | null>) {
  try {
    return await getToken();
  } catch {
    return null;
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

  // An empty body is a legitimate success, not a failure. /setup/opening-
  // inventory returns one when a factory has no opening count yet — which is
  // every factory on its first day — and res.json() on it threw
  // "Unexpected end of JSON input" straight onto the screen, so the first
  // thing a new factory saw was a raw JavaScript error. Read as text and only
  // parse when there is something to parse.
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    // A 2xx that is not JSON is a server bug, but the caller deserves a
    // message naming the endpoint rather than a bare parser error.
    throw new Error(`API returned a non-JSON body for ${path}`);
  }
}
