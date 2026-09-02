// Shared role vocabulary and the access groupings the RolesGuard checks against.
// Ported from the ston3gpt build (2026-09-02). Keep the constant names in sync
// with that repo so specs and future ports drop in cleanly.
//
// The operating rule these encode:
//   operator   — production/machine input only
//   supervisor — operational data entry/approval, no user management, no imports
//   manager    — user management, historical imports, lower-level data control
//   owner      — supreme authority
//
// STONEOS3 DIVERGENCE — `admin` is a peer of `manager`. ston3gpt's vocabulary
// has no `admin` and puts that tier on `manager`; this schema has `admin` and
// already grants it user management. Every group that includes MANAGER_ROLE
// therefore also includes ADMIN_ROLE, so nothing that works today stops
// working. Collapsing the two into one value is a schema migration, not a
// constants change.
//
// SCHEMA NOTE: `inventory` and `sales` are part of this vocabulary because the
// groupings below reference them, but they are NOT yet members of the
// `UserRole` enum in prisma/schema.prisma. They therefore cannot be persisted
// or provisioned until a migration adds them — see PROVISIONABLE_ROLES below,
// which is deliberately narrower than ston3gpt's.

export const OWNER_ROLE = "owner";
export const MANAGER_ROLE = "manager";
export const SUPERVISOR_ROLE = "supervisor";
export const OPERATOR_ROLE = "operator";
export const ACCOUNTANT_ROLE = "accountant";
export const AUDITOR_ROLE = "auditor";
export const ADMIN_ROLE = "admin";
export const INVENTORY_ROLE = "inventory";
export const SALES_ROLE = "sales";

// The elevated tier: supreme authority plus its two peers.
const ELEVATED = [OWNER_ROLE, ADMIN_ROLE, MANAGER_ROLE];

export const USER_MANAGEMENT_ROLES = [...ELEVATED];
export const HISTORICAL_IMPORT_ROLES = [...ELEVATED];
export const OPERATIONAL_DATA_ROLES = [...ELEVATED, SUPERVISOR_ROLE];
export const PRODUCTION_INPUT_ROLES = [...ELEVATED, SUPERVISOR_ROLE, OPERATOR_ROLE];
export const EXPENSE_DATA_ROLES = [...ELEVATED, SUPERVISOR_ROLE, ACCOUNTANT_ROLE];
export const SALES_DATA_ROLES = [...ELEVATED, SUPERVISOR_ROLE, SALES_ROLE];
export const SALES_READ_ROLES = [
  ...ELEVATED,
  SUPERVISOR_ROLE,
  SALES_ROLE,
  INVENTORY_ROLE,
  ACCOUNTANT_ROLE,
  AUDITOR_ROLE,
];
export const INVENTORY_DATA_ROLES = [...ELEVATED, SUPERVISOR_ROLE, INVENTORY_ROLE];
export const COMMERCIAL_DATA_ROLES = [...ELEVATED, SUPERVISOR_ROLE, ACCOUNTANT_ROLE];

// Financial correction of a reconciled raw block. Deliberately excludes
// supervisor — this preserves the exact set already on
// POST /raw-blocks/:id/reconcile rather than widening it.
export const RECONCILIATION_ROLES = [...ELEVATED, ACCOUNTANT_ROLE];

// Read-only reporting surfaces every provisioned role may see.
export const ANY_PROVISIONED_ROLE = [...ELEVATED, SUPERVISOR_ROLE, OPERATOR_ROLE, ACCOUNTANT_ROLE, AUDITOR_ROLE];

// Every role value the `UserRole` enum in prisma/schema.prisma can actually
// store. Anything outside this list cannot be written to app_user.role.
export const SCHEMA_ROLES = [
  OWNER_ROLE,
  MANAGER_ROLE,
  SUPERVISOR_ROLE,
  OPERATOR_ROLE,
  ACCOUNTANT_ROLE,
  AUDITOR_ROLE,
  ADMIN_ROLE,
];

// Roles an owner/manager may grant through POST /admin/users. Narrower than
// ston3gpt's equivalent: `inventory` and `sales` are omitted because the schema
// enum cannot store them yet. Add them here in the same change that migrates
// the enum, not before.
export const PROVISIONABLE_ROLES = [
  MANAGER_ROLE,
  SUPERVISOR_ROLE,
  OPERATOR_ROLE,
  ACCOUNTANT_ROLE,
  AUDITOR_ROLE,
  ADMIN_ROLE,
];
