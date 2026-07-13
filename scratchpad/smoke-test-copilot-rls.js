// Throwaway smoke test for Step 6A — Copilot RLS + read-only role.
// Not committed to the repo. Uses the `pg` driver directly (not Prisma) to
// get raw control over `SET LOCAL` and to connect as the stoneos_copilot_ro
// role, exactly as the copilot will in Step 6B.
//
// Seeds two disposable, uniquely-named test factories with overlapping-shaped
// data (own factory/user/customer/vehicle rows + expense, sales_order+
// sales_line_item, invoice+payment), proves cross-tenant isolation on a
// direct-column table and two child (subquery) tables, proves fail-closed
// behavior when app.current_factory_id is unset, proves write rejection,
// and cleans up all seeded data at the end. Does not touch any pre-existing
// data in the DB.
//
// Requires `pg` (not a workspace dependency — install standalone to run:
// `npm install pg` from wherever you run this file from).
const { Client } = require("pg");

const OWNER_URL = "postgresql://stoneos:stoneos_dev_only@localhost:5432/stoneos";
const RO_URL = "postgresql://stoneos_copilot_ro:stoneos_dev_only@localhost:5432/stoneos";

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) {
    pass++;
    console.log(`PASS: ${label}`);
  } else {
    fail++;
    console.log(`FAIL: ${label}`);
  }
}

async function main() {
  const owner = new Client({ connectionString: OWNER_URL });
  await owner.connect();

  // --- Pre-existing data snapshot (must be untouched at the end) ---
  const before = await owner.query(
    "SELECT (SELECT count(*) FROM factory) AS factories, (SELECT count(*) FROM expense) AS expenses, (SELECT count(*) FROM app_user) AS users"
  );
  console.log("Pre-existing data snapshot:", before.rows[0]);

  const marker = `RLS-SMOKE-${Date.now()}`;
  let factoryA, factoryB, customerA, customerB, invoiceA, invoiceB, salesOrderA;

  try {
    // --- Seed two factories with overlapping-shaped data ---
    const fA = await owner.query("INSERT INTO factory (id, name) VALUES (gen_random_uuid(), $1) RETURNING id", [
      `${marker}-A`,
    ]);
    const fB = await owner.query("INSERT INTO factory (id, name) VALUES (gen_random_uuid(), $1) RETURNING id", [
      `${marker}-B`,
    ]);
    factoryA = fA.rows[0].id;
    factoryB = fB.rows[0].id;

    // Direct-column table: expense
    await owner.query(
      "INSERT INTO expense (id, factory_id, category, amount, expense_date) VALUES (gen_random_uuid(), $1, 'diesel', 1000, now())",
      [factoryA]
    );
    await owner.query(
      "INSERT INTO expense (id, factory_id, category, amount, expense_date) VALUES (gen_random_uuid(), $1, 'diesel', 2000, now())",
      [factoryB]
    );

    // Child table via sales_order -> sales_line_item
    const cA = await owner.query("INSERT INTO customer (id, factory_id, name) VALUES (gen_random_uuid(), $1, $2) RETURNING id", [
      factoryA,
      `${marker}-cust-A`,
    ]);
    const cB = await owner.query("INSERT INTO customer (id, factory_id, name) VALUES (gen_random_uuid(), $1, $2) RETURNING id", [
      factoryB,
      `${marker}-cust-B`,
    ]);
    customerA = cA.rows[0].id;
    customerB = cB.rows[0].id;

    const soA = await owner.query(
      "INSERT INTO sales_order (id, factory_id, customer_id, order_date) VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id",
      [factoryA, customerA]
    );
    const soB = await owner.query(
      "INSERT INTO sales_order (id, factory_id, customer_id, order_date) VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id",
      [factoryB, customerB]
    );
    salesOrderA = soA.rows[0].id;
    const salesOrderB = soB.rows[0].id;

    await owner.query(
      "INSERT INTO sales_line_item (id, sales_order_id, variety_name, quantity, unit_price, payment_type) VALUES (gen_random_uuid(), $1, 'Black Galaxy', 10, 100, 'cash')",
      [salesOrderA]
    );
    await owner.query(
      "INSERT INTO sales_line_item (id, sales_order_id, variety_name, quantity, unit_price, payment_type) VALUES (gen_random_uuid(), $1, 'Black Galaxy', 20, 100, 'cash')",
      [salesOrderB]
    );

    // Child table via invoice -> payment
    const invA = await owner.query(
      "INSERT INTO invoice (id, factory_id, customer_id, invoice_number, invoice_date, invoiced_amount) VALUES (gen_random_uuid(), $1, $2, $3, now(), 5000) RETURNING id",
      [factoryA, customerA, `${marker}-INV-A`]
    );
    const invB = await owner.query(
      "INSERT INTO invoice (id, factory_id, customer_id, invoice_number, invoice_date, invoiced_amount) VALUES (gen_random_uuid(), $1, $2, $3, now(), 6000) RETURNING id",
      [factoryB, customerB, `${marker}-INV-B`]
    );
    invoiceA = invA.rows[0].id;
    invoiceB = invB.rows[0].id;

    await owner.query("INSERT INTO payment (id, invoice_id, amount, payment_date) VALUES (gen_random_uuid(), $1, 5000, now())", [
      invoiceA,
    ]);
    await owner.query("INSERT INTO payment (id, invoice_id, amount, payment_date) VALUES (gen_random_uuid(), $1, 6000, now())", [
      invoiceB,
    ]);

    console.log(`Seeded factory A = ${factoryA}, factory B = ${factoryB}`);

    // ================================================================
    // 1. Cross-tenant isolation — direct-column table (expense), bare
    //    SELECT * with no WHERE clause at all.
    // ================================================================
    {
      const ro = new Client({ connectionString: RO_URL });
      await ro.connect();
      await ro.query("BEGIN");
      await ro.query("SELECT set_config('app.current_factory_id', $1, true)", [factoryA]);
      const r = await ro.query("SELECT * FROM expense WHERE category = 'diesel' AND amount IN (1000, 2000)");
      check(
        "Direct-column (expense): only factory A's row returned, never factory B's, with a bare SELECT",
        r.rows.length === 1 && Number(r.rows[0].amount) === 1000
      );
      await ro.query("COMMIT");
      await ro.end();
    }

    // ================================================================
    // 2. Cross-tenant isolation — child table via subquery (sales_line_item)
    // ================================================================
    {
      const ro = new Client({ connectionString: RO_URL });
      await ro.connect();
      await ro.query("BEGIN");
      await ro.query("SELECT set_config('app.current_factory_id', $1, true)", [factoryA]);
      const r = await ro.query("SELECT * FROM sales_line_item WHERE variety_name = 'Black Galaxy'");
      check(
        "Child table (sales_line_item via sales_order): only factory A's row returned",
        r.rows.length === 1 && Number(r.rows[0].quantity) === 10
      );
      await ro.query("COMMIT");
      await ro.end();
    }

    // ================================================================
    // 3. Cross-tenant isolation — child table via subquery (payment)
    // ================================================================
    {
      const ro = new Client({ connectionString: RO_URL });
      await ro.connect();
      await ro.query("BEGIN");
      await ro.query("SELECT set_config('app.current_factory_id', $1, true)", [factoryA]);
      const r = await ro.query("SELECT * FROM payment WHERE amount IN (5000, 6000)");
      check(
        "Child table (payment via invoice): only factory A's row returned",
        r.rows.length === 1 && Number(r.rows[0].amount) === 5000
      );
      await ro.query("COMMIT");
      await ro.end();
    }

    // ================================================================
    // 4. Fail-closed — app.current_factory_id never set in a fresh session.
    //    This is the single most important assertion.
    // ================================================================
    {
      const ro = new Client({ connectionString: RO_URL });
      await ro.connect();
      const r = await ro.query("SELECT * FROM expense");
      check("Fail-closed: app.current_factory_id unset -> SELECT * FROM expense returns ZERO rows (not error, not all rows)", r.rows.length === 0);
      await ro.end();
    }

    // Also confirm it's zero rows, not an error, on a child table.
    {
      const ro = new Client({ connectionString: RO_URL });
      await ro.connect();
      const r = await ro.query("SELECT * FROM sales_line_item");
      check("Fail-closed (child table): app.current_factory_id unset -> sales_line_item returns ZERO rows", r.rows.length === 0);
      await ro.end();
    }

    // ================================================================
    // 5. Write rejection.
    // ================================================================
    // Each write attempt gets its own connection + transaction — once a
    // statement is rejected by a GRANT check, Postgres aborts the whole
    // transaction block (all subsequent statements in it fail with
    // "current transaction is aborted", not a fresh permission check), so
    // reusing one transaction across attempts would give false negatives.
    async function expectPermissionDenied(label, sql, params) {
      const ro = new Client({ connectionString: RO_URL });
      await ro.connect();
      await ro.query("BEGIN");
      await ro.query("SELECT set_config('app.current_factory_id', $1, true)", [factoryA]);
      try {
        await ro.query(sql, params);
        check(label, false);
      } catch (e) {
        // INSERT/UPDATE/DELETE are blocked by GRANT ("permission denied for
        // table"); DDL like DROP TABLE is blocked by ownership ("must be
        // owner of table") since stoneos_copilot_ro owns nothing — both are
        // valid proof the role cannot perform the write/DDL.
        check(label, /permission denied|must be owner/i.test(e.message));
      } finally {
        await ro.query("ROLLBACK").catch(() => {});
        await ro.end();
      }
    }

    await expectPermissionDenied(
      "INSERT into expense rejected with permission error",
      "INSERT INTO expense (id, factory_id, category, amount, expense_date) VALUES (gen_random_uuid(), $1, 'x', 1, now())",
      [factoryA]
    );
    await expectPermissionDenied(
      "UPDATE on expense rejected with permission error",
      "UPDATE expense SET amount = 999 WHERE factory_id = $1",
      [factoryA]
    );
    await expectPermissionDenied(
      "DELETE on expense rejected with permission error",
      "DELETE FROM expense WHERE factory_id = $1",
      [factoryA]
    );
    await expectPermissionDenied("DROP TABLE expense rejected with permission error", "DROP TABLE expense", []);

    // ================================================================
    // 6. `factory` table itself — readable, scoped by id.
    // ================================================================
    {
      const ro = new Client({ connectionString: RO_URL });
      await ro.connect();
      await ro.query("BEGIN");
      await ro.query("SELECT set_config('app.current_factory_id', $1, true)", [factoryA]);
      const r = await ro.query("SELECT * FROM factory WHERE name LIKE $1", [`${marker}%`]);
      check("factory table: readable and scoped by id (only factory A's row visible)", r.rows.length === 1 && r.rows[0].id === factoryA);
      await ro.query("COMMIT");
      await ro.end();
    }

    // ================================================================
    // 7. Role privilege sanity — not superuser, no BYPASSRLS, no create db/role.
    // ================================================================
    {
      const r = await owner.query(
        "SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = 'stoneos_copilot_ro'"
      );
      const row = r.rows[0];
      check(
        "stoneos_copilot_ro: not superuser, no BYPASSRLS, no CREATEDB, no CREATEROLE",
        row && !row.rolsuper && !row.rolbypassrls && !row.rolcreatedb && !row.rolcreaterole
      );
    }

    console.log(`\n${pass} passed, ${fail} failed`);
  } finally {
    // --- Cleanup: delete only the seeded test rows, FK-safe order ---
    await owner.query("DELETE FROM payment WHERE invoice_id IN (SELECT id FROM invoice WHERE invoice_number LIKE $1)", [`${marker}%`]);
    await owner.query("DELETE FROM sales_line_item WHERE sales_order_id IN (SELECT id FROM sales_order WHERE factory_id IN (SELECT id FROM factory WHERE name LIKE $1))", [`${marker}%`]);
    await owner.query("DELETE FROM invoice WHERE invoice_number LIKE $1", [`${marker}%`]);
    await owner.query("DELETE FROM sales_order WHERE factory_id IN (SELECT id FROM factory WHERE name LIKE $1)", [`${marker}%`]);
    await owner.query("DELETE FROM expense WHERE factory_id IN (SELECT id FROM factory WHERE name LIKE $1)", [`${marker}%`]);
    await owner.query("DELETE FROM customer WHERE factory_id IN (SELECT id FROM factory WHERE name LIKE $1)", [`${marker}%`]);
    await owner.query("DELETE FROM factory WHERE name LIKE $1", [`${marker}%`]);

    const after = await owner.query(
      "SELECT (SELECT count(*) FROM factory) AS factories, (SELECT count(*) FROM expense) AS expenses, (SELECT count(*) FROM app_user) AS users"
    );
    console.log("Post-cleanup data snapshot:", after.rows[0]);
    console.log(
      "Pre-existing data untouched:",
      before.rows[0].factories === after.rows[0].factories &&
        before.rows[0].expenses === after.rows[0].expenses &&
        before.rows[0].users === after.rows[0].users
    );

    await owner.end();
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
