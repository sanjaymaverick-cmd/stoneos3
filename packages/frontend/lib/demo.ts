// Demo mode (frontend). Set NEXT_PUBLIC_DEMO_MODE=true at build time for the
// isolated demo environment so partners land straight in the app without a
// Clerk sign-in. The backend must be started with DEMO_MODE=true to match —
// it treats every request as a fixed read-only owner (see backend common/demo.ts).
//
// NEXT_PUBLIC_ vars are inlined by Next.js at build time, so this is a
// compile-time constant, tree-shaken out of the real production build.
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// Any non-empty string; the backend ignores the token's contents in demo
// mode but apiFetch still sends an Authorization header.
export const DEMO_TOKEN = "demo-session";
