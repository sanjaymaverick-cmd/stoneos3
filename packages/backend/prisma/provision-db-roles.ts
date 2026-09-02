// Sets up the database ROLES that migrations deliberately cannot.
//
// Run once per database, after `prisma migrate deploy`, before starting the
// app:
//
//     COPILOT_DB_PASSWORD='<a strong secret>' npx ts-node prisma/provision-db-roles.ts
//
// Why this is not a migration: a migration is static SQL committed to the
// repo, so any password inside it is a published password. Migration
// 20260713000000 used to do exactly that — it created stoneos_copilot_ro with
// the literal password 'stoneos_dev_only'. That role can SELECT every table,
// and although RLS confines it to zero rows until app.current_factory_id is
// set, the role can set that itself. Anyone who could read the repo could read
// any factory's data.
//
// So the migration now creates the role NOLOGIN and with no password at all,
// which makes it unusable, and this script is the only thing that turns it on.
// Idempotent: safe to re-run, and re-running is how you rotate the password.

import { Client } from "pg";

const COPILOT_ROLE = "stoneos_copilot_ro";

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail("DATABASE_URL is not set. Point it at the database you are provisioning.");

  const password = process.env.COPILOT_DB_PASSWORD;
  if (!password) {
    fail(
      "COPILOT_DB_PASSWORD is not set.\n\n" +
        "  This is the login password for the Copilot's read-only role. Generate a\n" +
        "  strong one and keep it in your secret store, not in the repo:\n\n" +
        "      node -e \"console.log(require('crypto').randomBytes(24).toString('base64url'))\"\n\n" +
        "  Then set COPILOT_DATABASE_URL to use the same password.",
    );
  }
  if (password.length < 16) {
    fail("COPILOT_DB_PASSWORD is shorter than 16 characters. Use a generated secret, not a memorable one.");
  }
  if (password === "stoneos_dev_only") {
    fail(
      "COPILOT_DB_PASSWORD is still the old committed development password.\n" +
        "  That value is public in this repository's history. Choose a new one.",
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const { rows: roleRows } = await client.query(
      "SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1",
      [COPILOT_ROLE],
    );
    if (roleRows.length === 0) {
      fail(
        `Role ${COPILOT_ROLE} does not exist.\n` +
          "  Run `npx prisma migrate deploy` first — migration 20260713000000 creates it.",
      );
    }

    // ALTER ROLE cannot take the password as a bind parameter, so the value
    // goes in through a session setting (which can be parameterised) and is
    // quoted by format(%L) on the server. Concatenating it into the SQL text
    // would let an awkward password break out of the literal.
    await client.query("SELECT set_config('provision.copilot_pw', $1, false)", [password]);
    await client.query(`
      DO $$
      BEGIN
        EXECUTE format(
          'ALTER ROLE %I WITH LOGIN PASSWORD %L',
          'stoneos_copilot_ro',
          current_setting('provision.copilot_pw', true)
        );
      END $$;
    `);
    // Do not leave the secret readable for the rest of the session.
    await client.query("SELECT set_config('provision.copilot_pw', '', false)");

    // Re-assert the security posture rather than assuming the migration got it
    // right — this role must never be able to see across tenants.
    const { rows: after } = await client.query(
      "SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1",
      [COPILOT_ROLE],
    );
    const role = after[0];
    if (role.rolsuper || role.rolbypassrls) {
      fail(
        `${COPILOT_ROLE} has superuser or BYPASSRLS. Either defeats row-level security\n` +
          "  entirely and would let the Copilot read every factory. Revoke it before continuing.",
      );
    }
    if (!role.rolcanlogin) fail(`${COPILOT_ROLE} still cannot log in — the password was not applied.`);

    // The app relies on owning its tables to be exempt from RLS, so a
    // mismatch here means the app will silently read zero rows everywhere.
    const { rows: ownership } = await client.query(`
      SELECT count(*) FILTER (WHERE c.relforcerowsecurity) AS forced,
             count(*) FILTER (WHERE c.relrowsecurity) AS enabled,
             count(*) AS total
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    `);
    const { forced, enabled } = ownership[0];
    if (Number(forced) > 0) {
      console.warn(
        `\n  WARNING: ${forced} table(s) still have FORCE ROW LEVEL SECURITY.\n` +
          "  The application owns these tables and will read ZERO ROWS from them unless it\n" +
          "  is superuser or holds BYPASSRLS. This database predates the migration that\n" +
          "  removed FORCE; re-run `prisma migrate deploy`.",
      );
    }

    console.log(`\n  ${COPILOT_ROLE} provisioned.`);
    console.log(`    login enabled : yes`);
    console.log(`    superuser     : no`);
    console.log(`    bypasses RLS  : no`);
    console.log(`    RLS-enabled tables: ${enabled}`);
    console.log(`\n  Set COPILOT_DATABASE_URL to use this password, then start the app.\n`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("\n  Provisioning failed:", e.message, "\n");
  process.exit(1);
});
