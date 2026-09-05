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
  return res.json();
}
