// Ported from the ston3gpt build (2026-09-02), unchanged.
//
// FRONTEND_URL accepts a comma-separated list so more than one origin can be
// allowed (e.g. a local dev frontend alongside a preview build). A single
// value still works and stays the common case.
export function parseFrontendOrigins(value: string | undefined) {
  return (value ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
