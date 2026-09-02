import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";

// The exact 39 tenant-scoped tables carrying RLS + a tenant_isolation
// policy — copied VERBATIM from the CREATE POLICY statements in
//   20260713000000_copilot_rls_readonly_role (35: sections 3a + 3b)
//   20260902000000_inventory_ledger        (2: inventory_location,
//                                              inventory_movement)
//   20260902010000_opening_inventory       (2: opening_inventory_snapshot
//                                              direct; opening_inventory_line
//                                              via its parent snapshot)
// not re-derived by hand, so this list cannot silently drift from the
// migrations. EVERY future tenant-scoped table must be added to an RLS
// migration and to this list together, or the Copilot refuses to start.
export const EXPECTED_RLS_TABLES: readonly string[] = [
  // 3a. Direct-column policies (19)
  "factory",
  "app_user",
  "supplier",
  "customer",
  "machine",
  "cutting_session",
  "polishing_session",
  "vehicle",
  "raw_block",
  "slab",
  "daily_production_report",
  "consumable",
  "invoice",
  "sales_order",
  "daily_sales_summary",
  "expense",
  "tally_import_batch",
  "inventory_snapshot",
  "utility_reading",
  // Added by 20260902000000_inventory_ledger (direct factory_id column).
  "inventory_location",
  "inventory_movement",
  "opening_inventory_snapshot",
  // 3b. Child-table policies (17)
  "cutting_day_log",
  "polishing_session_slab",
  "raw_block_photo",
  "block_state_transition",
  "slab_photo",
  "slab_state_transition",
  "block_reconciliation",
  "machine_runtime_log",
  "consumable_purchase",
  "consumable_usage_log",
  "payment",
  "sales_line_item",
  "expense_allocation",
  "tally_ledger_entry",
  "tally_voucher_item",
  "tally_trial_balance_snapshot",
  // Added by 20260902010000_opening_inventory (scoped via its parent snapshot).
  "opening_inventory_line",
];

interface RlsStatusRow {
  tablename: string;
  rowsecurity: boolean;
  has_policy: boolean;
}

// Startup-time safety net (mitigates KG-8 from Step 6A's review — a future
// table added to the tenant-scoped set could silently ship without RLS).
// Runs once on module init, queries pg_class/pg_policies directly (real
// Postgres catalogs, not trusting the migration history), and if anything
// expected is missing, fails ONLY this module's own readiness — never
// crashes the app. The rest of StoneOS does not depend on the Copilot to
// function; see the brief's explicit instruction to contain KG-8's blast
// radius to this one feature.
@Injectable()
export class CopilotReadinessService implements OnModuleInit {
  private readonly logger = new Logger(CopilotReadinessService.name);
  private _ready = false;
  private _reason = "not yet checked";

  constructor(private prisma: PrismaService) {}

  get ready(): boolean {
    return this._ready;
  }

  get reason(): string {
    return this._reason;
  }

  async onModuleInit(): Promise<void> {
    await this.checkRlsCoverage();
  }

  async checkRlsCoverage(): Promise<void> {
    try {
      const rows = await this.prisma.$queryRaw<RlsStatusRow[]>`
        SELECT
          c.relname AS tablename,
          c.relrowsecurity AS rowsecurity,
          EXISTS (
            SELECT 1 FROM pg_policies p
            WHERE p.schemaname = 'public'
              AND p.tablename = c.relname
              AND p.policyname = 'tenant_isolation'
          ) AS has_policy
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname IN (${Prisma.join(EXPECTED_RLS_TABLES as string[])})
      `;

      const found = new Map(rows.map((r) => [r.tablename, r]));
      const problems: string[] = [];
      for (const table of EXPECTED_RLS_TABLES) {
        const row = found.get(table);
        if (!row) {
          problems.push(`${table}: table not found`);
        } else if (!row.rowsecurity) {
          problems.push(`${table}: row-level security not enabled`);
        } else if (!row.has_policy) {
          problems.push(`${table}: tenant_isolation policy missing`);
        }
      }

      if (problems.length > 0) {
        this._ready = false;
        this._reason = `RLS coverage check failed for ${problems.length}/${EXPECTED_RLS_TABLES.length} table(s): ${problems.join("; ")}`;
        this.logger.error(`COPILOT MODULE NOT READY (containing blast radius to this feature only) — ${this._reason}`);
      } else {
        this._ready = true;
        this._reason = "";
        this.logger.log(`Copilot RLS coverage check passed — all ${EXPECTED_RLS_TABLES.length} expected tables have RLS + tenant_isolation.`);
      }
    } catch (e: any) {
      this._ready = false;
      this._reason = `RLS coverage check errored: ${e?.message ?? String(e)}`;
      this.logger.error(`COPILOT MODULE NOT READY — ${this._reason}`);
    }
  }
}
