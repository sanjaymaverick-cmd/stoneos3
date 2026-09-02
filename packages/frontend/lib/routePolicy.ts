// Which roles may open which page. Ported from the ston3gpt build and adapted
// to this app's actual route set (it has /copilot and /recovery-ratio; it does
// not have /setup, /tally, /machines, /receipts, /inventory or /ai).
//
// This is UX, not enforcement. The authority is the backend RolesGuard —
// see packages/backend/src/common/role-policy.ts, whose groupings these
// mirror. When you change a @Roles set there, change the matching entry here
// or a user will be shown a page whose data calls all 403.

export const ELEVATED_ROLES = ["owner", "admin", "manager"];

// Mirrors ANY_PROVISIONED_ROLE in the backend policy.
export const ALL_ROLES = [...ELEVATED_ROLES, "supervisor", "operator", "accountant", "auditor"];

// Mirrors SALES_READ_ROLES. "inventory" and "sales" are in the backend
// vocabulary but not yet in the UserRole enum, so they cannot be provisioned;
// they are listed for parity so this stays correct when the enum is migrated.
const SALES_READ = [...ELEVATED_ROLES, "supervisor", "sales", "inventory", "accountant", "auditor"];

// Mirrors EXPENSE_DATA_ROLES.
const EXPENSE_DATA = [...ELEVATED_ROLES, "supervisor", "accountant"];

// Longest prefix wins, so "/admin/users" is matched by "/admin" and never by
// the "/" catch-all. Order within the list does not matter.
const POLICIES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/admin", roles: ELEVATED_ROLES },
  // The opening count establishes the factory's starting stock and flips it
  // live — matches HISTORICAL_IMPORT_ROLES on the backend.
  { prefix: "/setup", roles: ELEVATED_ROLES },
  // Narrower than the rest of the elevated tier — matches @Roles("owner") on
  // POST /copilot/ask. The Owner's explicit choice, not an oversight.
  { prefix: "/copilot", roles: ["owner"] },
  { prefix: "/expenses", roles: EXPENSE_DATA },
  { prefix: "/sales", roles: SALES_READ },
  { prefix: "/recovery-ratio", roles: SALES_READ },
  { prefix: "/dpr", roles: ALL_ROLES },
  { prefix: "/polishing", roles: ALL_ROLES },
  { prefix: "/dashboard", roles: ALL_ROLES },
  { prefix: "/", roles: ALL_ROLES },
];

// Pre-auth routes. AuthGate owns these; the role guard must not intercept them
// or a signed-out user could never reach the sign-in form.
export const PUBLIC_PATHS = ["/sign-in", "/sign-up"];

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function canAccessRoute(role: string | undefined, pathname: string) {
  if (!role) return false;
  const matches = POLICIES.filter(
    (candidate) => pathname === candidate.prefix || pathname.startsWith(`${candidate.prefix}/`),
  );
  if (matches.length === 0) return false;
  // Most specific policy wins.
  const policy = matches.reduce((best, c) => (c.prefix.length > best.prefix.length ? c : best));
  return policy.roles.includes(role);
}

// Nav links the given role may actually open. Single source of truth for the
// header, so a link can never point at a page the guard will refuse.
export function navLinksFor(role: string | undefined) {
  const LINKS = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/dpr", label: "Production" },
    { href: "/polishing", label: "Polishing" },
    { href: "/sales", label: "Sales" },
    { href: "/expenses", label: "Expenses" },
    { href: "/recovery-ratio", label: "Recovery Ratio" },
    { href: "/setup/opening-inventory", label: "Opening Count" },
    { href: "/admin/users", label: "Team" },
    { href: "/copilot", label: "Copilot" },
  ];
  return LINKS.filter((link) => canAccessRoute(role, link.href));
}
