import {
  COMMERCIAL_DATA_ROLES,
  HISTORICAL_IMPORT_ROLES,
  OPERATIONAL_DATA_ROLES,
  PRODUCTION_INPUT_ROLES,
  PROVISIONABLE_ROLES,
  SALES_DATA_ROLES,
  SCHEMA_ROLES,
  USER_MANAGEMENT_ROLES,
} from "./role-policy";

describe("role policy", () => {
  it("keeps operators limited to production input", () => {
    expect(PRODUCTION_INPUT_ROLES).toContain("operator");
    expect(USER_MANAGEMENT_ROLES).not.toContain("operator");
    expect(HISTORICAL_IMPORT_ROLES).not.toContain("operator");
    expect(OPERATIONAL_DATA_ROLES).not.toContain("operator");
    expect(SALES_DATA_ROLES).not.toContain("operator");
    expect(COMMERCIAL_DATA_ROLES).not.toContain("operator");
  });

  it("allows supervisors to enter operational data but not user or historical import data", () => {
    expect(PRODUCTION_INPUT_ROLES).toContain("supervisor");
    expect(OPERATIONAL_DATA_ROLES).toContain("supervisor");
    expect(SALES_DATA_ROLES).toContain("supervisor");
    expect(COMMERCIAL_DATA_ROLES).toContain("supervisor");
    expect(USER_MANAGEMENT_ROLES).not.toContain("supervisor");
    expect(HISTORICAL_IMPORT_ROLES).not.toContain("supervisor");
  });

  // stoneos3-specific: ston3gpt's equivalent asserts exactly ["owner",
  // "manager"]. This schema also has an `admin` role that already held user
  // management before the policy layer landed, so `admin` is a deliberate peer
  // of `manager` in every elevated group — see the DIVERGENCE note in
  // role-policy.ts. Widening this without widening that note is a mistake.
  it("limits user management and historical imports to the elevated tier", () => {
    expect(USER_MANAGEMENT_ROLES).toEqual(["owner", "admin", "manager"]);
    expect(HISTORICAL_IMPORT_ROLES).toEqual(["owner", "admin", "manager"]);
  });

  it("treats admin and manager as peers across every elevated group", () => {
    for (const group of [
      USER_MANAGEMENT_ROLES,
      HISTORICAL_IMPORT_ROLES,
      OPERATIONAL_DATA_ROLES,
      PRODUCTION_INPUT_ROLES,
      SALES_DATA_ROLES,
      COMMERCIAL_DATA_ROLES,
    ]) {
      expect(group.includes("admin")).toBe(group.includes("manager"));
    }
  });

  // stoneos3-specific: ston3gpt's UserRole enum carries `inventory` and `sales`
  // and this one does not. Granting a role the enum cannot store would fail at
  // the database, so PROVISIONABLE_ROLES must stay a subset of SCHEMA_ROLES.
  // If the enum is ever migrated to add roles, widen PROVISIONABLE_ROLES in the
  // same change and this stays green.
  it("only allows provisioning roles the schema enum can store", () => {
    const unstorable = PROVISIONABLE_ROLES.filter((role) => !SCHEMA_ROLES.includes(role));
    expect(unstorable).toEqual([]);
  });

  it("never allows provisioning the owner role", () => {
    expect(PROVISIONABLE_ROLES).not.toContain("owner");
  });
});
