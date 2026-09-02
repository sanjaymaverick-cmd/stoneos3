import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "./decorators/roles.decorator";
import { RolesGuard } from "./guards/roles.guard";
import {
  ANY_PROVISIONED_ROLE,
  COMMERCIAL_DATA_ROLES,
  EXPENSE_DATA_ROLES,
  HISTORICAL_IMPORT_ROLES,
  INVENTORY_DATA_ROLES,
  PRODUCTION_INPUT_ROLES,
  RECONCILIATION_ROLES,
  SALES_DATA_ROLES,
  SALES_READ_ROLES,
  SCHEMA_ROLES,
  USER_MANAGEMENT_ROLES,
} from "./role-policy";
import { ProvisionUserController } from "../modules/admin/provision-user.controller";
import { CopilotController } from "../modules/copilot/copilot.controller";
import { RawBlockController } from "../modules/inventory/raw-block.controller";
import { SlabController } from "../modules/inventory/slab.controller";
import { DprController } from "../modules/production/dpr.controller";
import { MachineLogController } from "../modules/production/machine-log.controller";
import { MachineController } from "../modules/production/machine.controller";
import { CuttingSessionController, PolishingSessionController } from "../modules/production/session.controllers";
import { CustomerController } from "../modules/sales/customer.controller";
import { DailySalesSummaryController } from "../modules/sales/daily-sales-summary.controller";
import { SalesOrderController } from "../modules/sales/sales-order.controller";
import { TallyImportController } from "../modules/tally/tally-import.controller";
import { ExpenseController } from "../modules/expenses/expense.controller";
import { VehicleController } from "../modules/expenses/vehicle.controller";

function contextForRole(role: string | undefined, handler: Function) {
  return {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => (role ? { user: { role } } : {}) }),
  } as any;
}

// Every guarded endpoint, the role set it must carry, and a label. This table
// is the authorization contract — a change to any @Roles decorator that is not
// reflected here fails the suite.
const ENDPOINTS: Array<{ name: string; handler: Function; roles: string[] }> = [
  { name: "list team", handler: ProvisionUserController.prototype.list, roles: USER_MANAGEMENT_ROLES },
  { name: "provision user", handler: ProvisionUserController.prototype.provision, roles: USER_MANAGEMENT_ROLES },

  { name: "copilot ask", handler: CopilotController.prototype.ask, roles: ["owner"] },

  { name: "list raw blocks", handler: RawBlockController.prototype.findAll, roles: SALES_READ_ROLES },
  { name: "recovery ratio report", handler: RawBlockController.prototype.findRecoveryRatios, roles: SALES_READ_ROLES },
  { name: "one raw block", handler: RawBlockController.prototype.findOne, roles: SALES_READ_ROLES },
  { name: "receive raw block", handler: RawBlockController.prototype.create, roles: INVENTORY_DATA_ROLES },
  { name: "transition raw block", handler: RawBlockController.prototype.transition, roles: PRODUCTION_INPUT_ROLES },
  { name: "reconcile raw block", handler: RawBlockController.prototype.reconcile, roles: RECONCILIATION_ROLES },

  { name: "list slabs", handler: SlabController.prototype.findAll, roles: SALES_READ_ROLES },
  { name: "one slab", handler: SlabController.prototype.findOne, roles: SALES_READ_ROLES },
  { name: "create slab", handler: SlabController.prototype.create, roles: INVENTORY_DATA_ROLES },
  { name: "transition slab", handler: SlabController.prototype.transition, roles: PRODUCTION_INPUT_ROLES },

  { name: "read DPR", handler: DprController.prototype.findByDate, roles: ANY_PROVISIONED_ROLE },
  { name: "write DPR", handler: DprController.prototype.upsert, roles: PRODUCTION_INPUT_ROLES },

  { name: "machine runtime log", handler: MachineLogController.prototype.upsert, roles: PRODUCTION_INPUT_ROLES },
  { name: "list machines", handler: MachineController.prototype.findAll, roles: ANY_PROVISIONED_ROLE },
  { name: "register machine", handler: MachineController.prototype.create, roles: USER_MANAGEMENT_ROLES },

  { name: "active cutting sessions", handler: CuttingSessionController.prototype.findActive, roles: ANY_PROVISIONED_ROLE },
  { name: "list cutting sessions", handler: CuttingSessionController.prototype.findAll, roles: ANY_PROVISIONED_ROLE },
  { name: "start cutting", handler: CuttingSessionController.prototype.start, roles: PRODUCTION_INPUT_ROLES },
  { name: "cutting day log", handler: CuttingSessionController.prototype.dayLog, roles: PRODUCTION_INPUT_ROLES },
  { name: "complete cutting", handler: CuttingSessionController.prototype.complete, roles: PRODUCTION_INPUT_ROLES },
  { name: "list polishing runs", handler: PolishingSessionController.prototype.findByDate, roles: ANY_PROVISIONED_ROLE },
  { name: "create polishing run", handler: PolishingSessionController.prototype.create, roles: PRODUCTION_INPUT_ROLES },

  { name: "list customers", handler: CustomerController.prototype.findAll, roles: SALES_READ_ROLES },
  { name: "create customer", handler: CustomerController.prototype.create, roles: SALES_DATA_ROLES },
  { name: "read daily sales", handler: DailySalesSummaryController.prototype.findRange, roles: SALES_READ_ROLES },
  { name: "backfill daily sales", handler: DailySalesSummaryController.prototype.backfill, roles: HISTORICAL_IMPORT_ROLES },
  { name: "list sales orders", handler: SalesOrderController.prototype.findAll, roles: SALES_READ_ROLES },
  { name: "one sales order", handler: SalesOrderController.prototype.findOne, roles: SALES_READ_ROLES },
  { name: "create sales order", handler: SalesOrderController.prototype.create, roles: SALES_DATA_ROLES },

  { name: "list tally batches", handler: TallyImportController.prototype.findBatches, roles: COMMERCIAL_DATA_ROLES },
  { name: "import daybook", handler: TallyImportController.prototype.importDaybook, roles: HISTORICAL_IMPORT_ROLES },
  { name: "import trial balance", handler: TallyImportController.prototype.importTrialBalance, roles: HISTORICAL_IMPORT_ROLES },
  { name: "tally item cross-check", handler: TallyImportController.prototype.itemCrossCheck, roles: COMMERCIAL_DATA_ROLES },

  { name: "expense categories", handler: ExpenseController.prototype.categories, roles: EXPENSE_DATA_ROLES },
  { name: "list expenses", handler: ExpenseController.prototype.findAll, roles: EXPENSE_DATA_ROLES },
  { name: "create expense", handler: ExpenseController.prototype.create, roles: EXPENSE_DATA_ROLES },
  { name: "allocate expense", handler: ExpenseController.prototype.allocate, roles: EXPENSE_DATA_ROLES },
  { name: "list vehicles", handler: VehicleController.prototype.findAll, roles: EXPENSE_DATA_ROLES },
  { name: "create vehicle", handler: VehicleController.prototype.create, roles: EXPENSE_DATA_ROLES },
];

describe("protected endpoint role access", () => {
  const guard = new RolesGuard(new Reflector());

  it.each(ENDPOINTS)("$name carries its declared role metadata", ({ handler, roles }) => {
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(roles);
  });

  it.each(ENDPOINTS)("$name admits exactly its allowed roles and refuses the rest", ({ handler, roles }) => {
    for (const role of SCHEMA_ROLES) {
      const context = contextForRole(role, handler);
      if (roles.includes(role)) {
        expect(guard.canActivate(context)).toBe(true);
      } else {
        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      }
    }
  });

  it.each(ENDPOINTS)("$name fails closed for a caller with no role", ({ handler }) => {
    expect(() => guard.canActivate(contextForRole(undefined, handler))).toThrow(ForbiddenException);
  });

  it.each(ENDPOINTS)("$name fails closed for an unrecognised role", ({ handler }) => {
    expect(() => guard.canActivate(contextForRole("intern", handler))).toThrow(ForbiddenException);
  });
});

describe("the operating rule holds end to end", () => {
  const guard = new RolesGuard(new Reflector());
  const allows = (role: string, handler: Function) => {
    try {
      return guard.canActivate(contextForRole(role, handler));
    } catch {
      return false;
    }
  };

  it("keeps operators on the production floor", () => {
    expect(allows("operator", DprController.prototype.upsert)).toBe(true);
    expect(allows("operator", CuttingSessionController.prototype.start)).toBe(true);
    expect(allows("operator", MachineLogController.prototype.upsert)).toBe(true);

    expect(allows("operator", SalesOrderController.prototype.create)).toBe(false);
    expect(allows("operator", TallyImportController.prototype.importDaybook)).toBe(false);
    expect(allows("operator", ProvisionUserController.prototype.provision)).toBe(false);
    expect(allows("operator", DailySalesSummaryController.prototype.backfill)).toBe(false);
  });

  it("lets supervisors run operations but not administer or import history", () => {
    expect(allows("supervisor", CuttingSessionController.prototype.complete)).toBe(true);
    expect(allows("supervisor", SalesOrderController.prototype.create)).toBe(true);
    expect(allows("supervisor", ExpenseController.prototype.create)).toBe(true);

    expect(allows("supervisor", ProvisionUserController.prototype.provision)).toBe(false);
    expect(allows("supervisor", TallyImportController.prototype.importDaybook)).toBe(false);
    expect(allows("supervisor", DailySalesSummaryController.prototype.backfill)).toBe(false);
    expect(allows("supervisor", MachineController.prototype.create)).toBe(false);
    expect(allows("supervisor", RawBlockController.prototype.reconcile)).toBe(false);
  });

  it("gives owner, admin and manager the elevated surface alike", () => {
    for (const role of ["owner", "admin", "manager"]) {
      expect(allows(role, ProvisionUserController.prototype.provision)).toBe(true);
      expect(allows(role, TallyImportController.prototype.importDaybook)).toBe(true);
      expect(allows(role, DailySalesSummaryController.prototype.backfill)).toBe(true);
      expect(allows(role, MachineController.prototype.create)).toBe(true);
      expect(allows(role, RawBlockController.prototype.reconcile)).toBe(true);
    }
  });

  it("keeps the Copilot owner-only, narrower than the rest of the elevated tier", () => {
    expect(allows("owner", CopilotController.prototype.ask)).toBe(true);
    for (const role of ["admin", "manager", "supervisor", "operator", "accountant", "auditor"]) {
      expect(allows(role, CopilotController.prototype.ask)).toBe(false);
    }
  });

  it("keeps auditors and accountants read-only on the shop floor", () => {
    for (const role of ["auditor", "accountant"]) {
      expect(allows(role, SalesOrderController.prototype.findAll)).toBe(true);
      expect(allows(role, CuttingSessionController.prototype.start)).toBe(false);
      expect(allows(role, SalesOrderController.prototype.create)).toBe(false);
    }
    // Accountants own the expense and reconciliation surfaces; auditors do not.
    expect(allows("accountant", ExpenseController.prototype.create)).toBe(true);
    expect(allows("accountant", RawBlockController.prototype.reconcile)).toBe(true);
    expect(allows("auditor", ExpenseController.prototype.create)).toBe(false);
    expect(allows("auditor", RawBlockController.prototype.reconcile)).toBe(false);
  });
});
