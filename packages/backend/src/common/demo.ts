// Demo mode — lets partners explore StoneOS without a Clerk sign-in.
//
// When DEMO_MODE=true the ClerkAuthGuard stops verifying session tokens and
// instead attaches a fixed, read-only "owner" demo user scoped to a single
// seeded demo factory (see prisma/seed-demo.ts). This is ONLY for the
// isolated demo environment — it must never be enabled on the real
// production deployment, where every request is a genuine Clerk session.
//
// Read-only is enforced in the guard: in demo mode only GET requests and the
// Copilot ask endpoint are allowed through; any other mutation is rejected,
// so a partner clicking around can't alter the seeded data.

export const DEMO_MODE = process.env.DEMO_MODE === "true";

// A fixed UUID so the seed script and the guard agree on the demo factory
// without any runtime lookup. Overridable via DEMO_FACTORY_ID if you seed
// into a different factory row.
export const DEMO_FACTORY_ID =
  process.env.DEMO_FACTORY_ID ?? "d3305e05-0000-4000-8000-000000000001";

export const DEMO_USER = {
  id: "demo-owner",
  email: "demo@stoneos.app",
  factoryId: DEMO_FACTORY_ID,
  role: "owner" as const,
};

// Paths that stay allowed in demo mode even though they aren't GETs.
// The Copilot answers questions over POST /copilot/ask but reads nothing
// mutable, so it's safe to allow.
export const DEMO_ALLOWED_NON_GET = ["/copilot/ask"];
