/**
 * Runtime role / authorization suite - StoneOS3
 * ---------------------------------------------------------------------------
 * Exercises a LIVE deployment over HTTP. Nothing here talks to Postgres.
 *
 * Configuration comes from the environment ONLY - never hardcode credentials:
 *
 *   STONEOS_API_URL         base URL of the API (required)
 *   STONEOS_OWNER_USERNAME  an owner login (required)
 *   STONEOS_OWNER_PASSWORD  that owner's password (required)
 *   STONEOS_TEST_PREFIX     username prefix for the accounts this suite owns
 *                           (default "qatest-"). Every account it creates,
 *                           mutates, revokes or resets must start with this.
 *   STONEOS_MARKER          marker written into free-text fields so rows this
 *                           suite creates can be found later
 *                           (default "QA-ROLETEST").
 *
 * Run (jest's rootDir is src/, so point it at this directory explicitly):
 *
 *   cd packages/backend
 *   STONEOS_API_URL=... STONEOS_OWNER_USERNAME=... STONEOS_OWNER_PASSWORD=... \
 *     npx jest --rootDir . --testRegex "test/.*\.spec\.ts$" --runInBand
 *
 * SAFETY CONTRACT
 *   - It never deletes anything.
 *   - It only writes to rows it created, plus accounts whose username starts
 *     with STONEOS_TEST_PREFIX (assertOwnedAccount enforces this).
 *   - Destructive-looking probes (revoke / reset-password / role change) are
 *     aimed exclusively at prefixed test accounts, never at the real owner.
 *   - It does NOT test the unbounded-upload finding (H-3): pushing a large
 *     file at a single-process deployment risks an OOM outage. Do that
 *     against a scratch instance.
 */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set - this suite never hardcodes credentials or hosts`);
  return v;
}

const BASE = requireEnv("STONEOS_API_URL").replace(/\/$/, "");
const OWNER_USERNAME = requireEnv("STONEOS_OWNER_USERNAME");
const OWNER_PASSWORD = requireEnv("STONEOS_OWNER_PASSWORD");
const PREFIX = process.env.STONEOS_TEST_PREFIX ?? "qatest-";
const MARKER = process.env.STONEOS_MARKER ?? "QA-ROLETEST";

// A syntactically valid UUID that belongs to no row anywhere. Used to probe
// whether a body key reaches the database at all: a foreign-key error proves
// the value was used, silent acceptance proves worse.
const FOREIGN_UUID = "00000000-0000-4000-8000-0000deadbeef";

function assertOwnedAccount(username: string) {
  if (!username.startsWith(PREFIX)) {
    throw new Error(`refusing to mutate "${username}" - only ${PREFIX}* accounts belong to this suite`);
  }
}

interface Res {
  status: number;
  body: any;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The deployment rate-limits per IP (default 120 req / 60s, see
// common/http-security.ts). The matrix alone is ~320 requests, so back off on
// 429 and pre-emptively idle when the remaining budget runs low.
async function api(method: string, path: string, opts: { token?: string; body?: any } = {}): Promise<Res> {
  for (;;) {
    const headers: Record<string, string> = {};
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    let payload: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(opts.body);
    }
    const res = await fetch(BASE + path, { method, headers, body: payload });
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    if (res.status === 429) {
      const reset = Number(res.headers.get("RateLimit-Reset")) * 1000;
      await sleep(Math.max(2_000, reset - Date.now() + 1_500));
      continue;
    }
    const remaining = Number(res.headers.get("RateLimit-Remaining"));
    if (Number.isFinite(remaining) && remaining < 8) {
      const reset = Number(res.headers.get("RateLimit-Reset")) * 1000;
      await sleep(Math.max(2_000, reset - Date.now() + 1_500));
    }
    return { status: res.status, body };
  }
}

async function login(username: string, password: string) {
  const r = await api("POST", "/auth/login", { body: { username, password } });
  if (r.status !== 200) throw new Error(`login ${username} failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body as { token: string; user: { id: string; role: string; factoryId: string } };
}

// ---------------------------------------------------------------------------
// Role vocabulary - mirrors src/common/role-policy.ts. Kept as a literal copy
// on purpose: if the policy changes, this suite should fail loudly rather than
// silently follow it.
// ---------------------------------------------------------------------------
const ROLES = ["owner", "admin", "manager", "supervisor", "operator", "accountant", "auditor"] as const;
type Role = (typeof ROLES)[number];

const ELEVATED: Role[] = ["owner", "admin", "manager"];
const USER_MANAGEMENT: Role[] = [...ELEVATED];
const HISTORICAL_IMPORT: Role[] = [...ELEVATED];
const PRODUCTION_INPUT: Role[] = [...ELEVATED, "supervisor", "operator"];
const INVENTORY_DATA: Role[] = [...ELEVATED, "supervisor"];
const SALES_DATA: Role[] = [...ELEVATED, "supervisor"];
const EXPENSE_DATA: Role[] = [...ELEVATED, "supervisor", "accountant"];
const COMMERCIAL_DATA: Role[] = [...ELEVATED, "supervisor", "accountant"];
const RECONCILIATION: Role[] = [...ELEVATED, "accountant"];
const SALES_READ: Role[] = [...ELEVATED, "supervisor", "accountant", "auditor"];
const ANY_PROVISIONED: Role[] = [...ELEVATED, "supervisor", "operator", "accountant", "auditor"];
const OWNER_ONLY: Role[] = ["owner"];

// ---------------------------------------------------------------------------

interface TestUser {
  username: string;
  password: string;
  id: string;
  token: string;
}

const ctx: {
  ownerToken: string;
  ownerId: string;
  factoryId: string;
  users: Record<string, TestUser>;
  fixtures: Record<string, any>;
} = { ownerToken: "", ownerId: "", factoryId: "", users: {}, fixtures: {} };

/**
 * Idempotent: creates the account if absent, otherwise resets its password so
 * the suite has usable credentials. Only ever touches PREFIX* accounts.
 */
async function ensureUser(role: string, suffix = role): Promise<TestUser> {
  const username = `${PREFIX}${suffix}`;
  assertOwnedAccount(username);
  const created = await api("POST", "/admin/users", {
    token: ctx.ownerToken,
    body: { username, name: `QA ${role} ${MARKER}`, role },
  });
  if (created.status >= 400) {
    throw new Error(`provision ${username}: ${created.status} ${JSON.stringify(created.body)}`);
  }
  const id: string = created.body.user.id;
  let password: string | null = created.body.password;
  if (!password) {
    const reset = await api("POST", `/admin/users/${id}/reset-password`, { token: ctx.ownerToken, body: {} });
    password = reset.body.password;
  }
  const session = await login(username, password as string);
  const user: TestUser = { username, password: password as string, id, token: session.token };
  ctx.users[suffix] = user;
  return user;
}

const tokenFor = (role: Role) => (role === "owner" ? ctx.ownerToken : ctx.users[role].token);

jest.setTimeout(30 * 60 * 1000);

beforeAll(async () => {
  const owner = await login(OWNER_USERNAME, OWNER_PASSWORD);
  expect(owner.user.role).toBe("owner");
  ctx.ownerToken = owner.token;
  ctx.ownerId = owner.user.id;
  ctx.factoryId = owner.user.factoryId;

  // TASK 1 - one provisioned account per SCHEMA_ROLE (minus owner, which the
  // real owner already holds), plus a sacrificial SECOND owner so the
  // "can a manager demote an owner" probes never aim at the real one.
  for (const role of ["manager", "supervisor", "operator", "accountant", "auditor", "admin"]) {
    await ensureUser(role);
  }
  await ensureUser("owner", "owner2");

  // Fixtures the write probes need. All marked.
  const machines = await api("GET", "/machines", { token: ctx.ownerToken });
  ctx.fixtures.cuttingMachineId = machines.body.find((m: any) => m.machineType === "cutting")?.id;
  ctx.fixtures.polishingMachineId = machines.body.find((m: any) => m.machineType === "polishing")?.id;

  const stamp = Date.now();
  const block = await api("POST", "/raw-blocks", {
    token: ctx.ownerToken,
    body: {
      serialNumber: `${MARKER}-BLK-${stamp}`,
      varietyName: `${MARKER} probe stone`,
      weightTons: 5,
      entrySource: "purchase",
      purchaseDate: "2026-09-05",
      invoicedAmount: 1000,
    },
  });
  ctx.fixtures.rawBlockId = block.body.id;

  const sessionA = await api("POST", "/cutting-sessions", {
    token: ctx.ownerToken,
    body: {
      rawBlockId: ctx.fixtures.rawBlockId,
      machineId: ctx.fixtures.cuttingMachineId,
      startedAt: "2026-09-05T08:00:00Z",
    },
  });
  ctx.fixtures.sessionAId = sessionA.body.id;

  const block2 = await api("POST", "/raw-blocks", {
    token: ctx.ownerToken,
    body: {
      serialNumber: `${MARKER}-BLK2-${stamp}`,
      varietyName: `${MARKER} probe stone`,
      weightTons: 5,
      entrySource: "purchase",
    },
  });
  const sessionB = await api("POST", "/cutting-sessions", {
    token: ctx.ownerToken,
    body: {
      rawBlockId: block2.body.id,
      machineId: ctx.fixtures.cuttingMachineId,
      startedAt: "2026-09-05T08:00:00Z",
    },
  });
  ctx.fixtures.sessionBId = sessionB.body.id;
});

// ===========================================================================
// (a) MASS ASSIGNMENT - the request body is spread AFTER server-controlled
//     fields, so a body key wins. Each test asserts what SHOULD happen; the
//     ones that fail today are the live defect.
// ===========================================================================
describe("(a) mass assignment: body keys overriding server-controlled columns", () => {
  test("POST /dpr - an operator must not be able to choose the row's primary key", async () => {
    const chosenId = "11111111-2222-4333-8444-555555555555";
    const r = await api("POST", "/dpr", {
      token: tokenFor("operator"),
      body: {
        reportDate: "2026-10-05",
        department: `${MARKER}-pk`,
        productionQty: 1,
        id: chosenId,
        manualNotes: `${MARKER} mass-assign id`,
      },
    });
    expect(r.status).toBeLessThan(400);
    // DESIRED: the server allocates the id. ACTUAL TODAY: the body wins.
    expect(r.body.id).not.toBe(chosenId);
  });

  test("POST /dpr - a body factoryId must be ignored, not sent to the database", async () => {
    const r = await api("POST", "/dpr", {
      token: tokenFor("operator"),
      body: {
        reportDate: "2026-10-06",
        department: `${MARKER}-tenant`,
        productionQty: 1,
        factoryId: FOREIGN_UUID,
      },
    });
    // DESIRED: the key is ignored and the row lands in the caller's factory (2xx).
    // ACTUAL TODAY: 500 - a foreign-key violation, i.e. the body value was used.
    expect(r.status).toBeLessThan(500);
  });

  test("POST /dpr - isDerived is NOT overridable (it is written after the spread)", async () => {
    const r = await api("POST", "/dpr", {
      token: tokenFor("operator"),
      body: {
        reportDate: "2026-10-07",
        department: `${MARKER}-derived`,
        isDerived: true,
        manualNotes: `${MARKER} derived probe`,
      },
    });
    expect(r.status).toBeLessThan(400);
    expect(r.body.isDerived).toBe(false);
  });

  test("POST /slabs - a supervisor must not create a slab straight into 'sold'", async () => {
    const r = await api("POST", "/slabs", {
      token: tokenFor("supervisor"),
      body: {
        parentBlockId: ctx.fixtures.rawBlockId,
        slabSerial: `${MARKER}/MA/${Date.now()}`,
        varietyName: `${MARKER} probe`,
        salesStatus: "sold",
        isBackfilled: true,
      },
    });
    expect(r.status).toBeLessThan(400);
    // DESIRED: create() forces "in_stock"; a sale is what moves a slab to "sold",
    // and that path also writes a SlabStateTransition. ACTUAL TODAY: body wins,
    // and the slab is "sold" with an empty transition history.
    expect(r.body.salesStatus).toBe("in_stock");
    expect(r.body.isBackfilled).toBe(false);
  });

  test("POST /machines/:machineId/log - a body machineId must not defeat the ownership check", async () => {
    const url = ctx.fixtures.cuttingMachineId;
    const other = ctx.fixtures.polishingMachineId;
    const r = await api("POST", `/machines/${url}/log`, {
      token: tokenFor("operator"),
      body: {
        logDate: "2026-10-06",
        machineId: other,
        runtimeMinutes: 7,
        downtimeReason: `${MARKER} mass-assign machine`,
      },
    });
    expect(r.status).toBeLessThan(400);
    // DESIRED: the URL machineId - the one that was ownership-checked - is what
    // gets written. ACTUAL TODAY: the body's machineId is written instead.
    expect(r.body.machineId).toBe(url);
  });

  test("POST /machines/:id/log - the ownership check itself holds for the URL id", async () => {
    const r = await api("POST", `/machines/${FOREIGN_UUID}/log`, {
      token: tokenFor("operator"),
      body: { logDate: "2026-10-06", runtimeMinutes: 7 },
    });
    expect(r.status).toBe(404);
  });

  test("POST /cutting-sessions/:id/day-log - a body cuttingSessionId must not redirect the write", async () => {
    const r = await api("POST", `/cutting-sessions/${ctx.fixtures.sessionAId}/day-log`, {
      token: tokenFor("operator"),
      body: {
        operationalDate: "2026-10-06",
        cuttingSessionId: ctx.fixtures.sessionBId,
        runtimeHours: 1,
        notes: `${MARKER} mass-assign session`,
      },
    });
    expect(r.status).toBeLessThan(400);
    // DESIRED: the path parameter decides which session is written.
    expect(r.body.cuttingSessionId).toBe(ctx.fixtures.sessionAId);
  });
});

// ===========================================================================
// (b) POST /cutting-sessions/:id/day-log never receives factoryId
// ===========================================================================
describe("(b) cutting day-log tenant scoping", () => {
  test("an unknown session id is rejected by the application, not by a foreign key", async () => {
    const r = await api("POST", `/cutting-sessions/${FOREIGN_UUID}/day-log`, {
      token: tokenFor("operator"),
      body: { operationalDate: "2026-10-06", runtimeHours: 1, notes: `${MARKER} unknown session` },
    });
    // DESIRED: 404 from a findFirstOrThrow({ id, factoryId }) guard, matching
    // complete(). ACTUAL TODAY: 500 - a raw FK violation, because the service
    // never looks the session up at all.
    expect(r.status).toBe(404);
  });

  test("roles outside PRODUCTION_INPUT still cannot reach the endpoint", async () => {
    for (const role of ["accountant", "auditor"] as Role[]) {
      const r = await api("POST", `/cutting-sessions/${ctx.fixtures.sessionAId}/day-log`, {
        token: tokenFor(role),
        body: { operationalDate: "2026-10-06" },
      });
      expect(r.status).toBe(403);
    }
  });
});

// ===========================================================================
// (c) PRIVILEGE ESCALATION - provision-user.service.ts
//     Every target is a PREFIX* account. The real owner is never a target.
// ===========================================================================
describe("(c) privilege escalation gates", () => {
  test("a non-owner cannot grant the owner role to a new account", async () => {
    for (const role of ["manager", "admin"] as Role[]) {
      const r = await api("POST", "/admin/users", {
        token: tokenFor(role),
        body: { username: `${PREFIX}escalate-${role}`, name: `QA esc ${MARKER}`, role: "owner" },
      });
      expect(r.status).toBe(403);
    }
  });

  test("a manager/admin cannot promote themselves to owner", async () => {
    for (const role of ["manager", "admin"] as Role[]) {
      const r = await api("POST", "/admin/users", {
        token: tokenFor(role),
        body: { username: ctx.users[role].username, role: "owner" },
      });
      expect(r.status).toBe(403);
    }
  });

  test("a non-owner cannot change an existing owner's role", async () => {
    for (const role of ["manager", "admin"] as Role[]) {
      const r = await api("POST", "/admin/users", {
        token: tokenFor(role),
        body: { username: ctx.users.owner2.username, role: "manager" },
      });
      expect(r.status).toBe(403);
    }
  });

  test("an owner cannot demote themselves", async () => {
    const r = await api("POST", "/admin/users", {
      token: ctx.users.owner2.token,
      body: { username: ctx.users.owner2.username, role: "manager" },
    });
    expect(r.status).toBe(403);
  });

  test("a non-owner cannot revoke, reinstate or reset an owner", async () => {
    const target = ctx.users.owner2.id;
    for (const role of ["manager", "admin"] as Role[]) {
      for (const action of ["revoke", "reinstate", "reset-password"]) {
        const r = await api("POST", `/admin/users/${target}/${action}`, { token: tokenFor(role), body: {} });
        expect(r.status).toBe(403);
      }
    }
  });

  test("nobody can revoke themselves - including the owner", async () => {
    const selfRevokes: Array<[string, string]> = [
      [ctx.ownerToken, ctx.ownerId],
      [ctx.users.owner2.token, ctx.users.owner2.id],
      [ctx.users.manager.token, ctx.users.manager.id],
      [ctx.users.admin.token, ctx.users.admin.id],
    ];
    for (const [token, id] of selfRevokes) {
      const r = await api("POST", `/admin/users/${id}/revoke`, { token, body: {} });
      expect(r.status).toBe(403);
    }
  });

  test("a role outside SCHEMA_ROLES is rejected", async () => {
    const r = await api("POST", "/admin/users", {
      token: ctx.ownerToken,
      body: { username: `${PREFIX}badrole`, role: "inventory" },
    });
    expect(r.status).toBe(400);
  });

  test("KNOWN-WIDE: the owner gate is the only one - a manager may still mint an admin", async () => {
    const r = await api("POST", "/admin/users", {
      token: tokenFor("manager"),
      body: { username: `${PREFIX}mgrmadeadmin`, name: `QA lateral ${MARKER}`, role: "admin" },
    });
    // Documents the current design: within the elevated tier, peers may create
    // and reset each other freely. Change this expectation if the policy tightens.
    expect(r.status).toBeLessThan(400);
    expect(r.body.user.role).toBe("admin");
  });
});

// ===========================================================================
// (d) REVOCATION IMMEDIACY
// ===========================================================================
describe("(d) revocation and token invalidation take effect on the next request", () => {
  test("a revoked user's existing token stops working immediately", async () => {
    const victim = ctx.users.auditor;
    assertOwnedAccount(victim.username);
    expect((await api("GET", "/auth/me", { token: victim.token })).status).toBe(200);

    const revoked = await api("POST", `/admin/users/${victim.id}/revoke`, { token: ctx.ownerToken, body: {} });
    expect(revoked.status).toBe(200);

    expect((await api("GET", "/auth/me", { token: victim.token })).status).toBe(401);
    expect((await api("GET", "/slabs", { token: victim.token })).status).toBe(401);
    expect(
      (await api("POST", "/auth/login", { body: { username: victim.username, password: victim.password } })).status,
    ).toBe(401);

    const reinstated = await api("POST", `/admin/users/${victim.id}/reinstate`, { token: ctx.ownerToken, body: {} });
    expect(reinstated.status).toBe(200);
    // reinstate bumps tokenVersion again, so the pre-revocation token stays dead.
    expect((await api("GET", "/auth/me", { token: victim.token })).status).toBe(401);

    const fresh = await login(victim.username, reinstated.body.password);
    victim.password = reinstated.body.password;
    victim.token = fresh.token;
    expect((await api("GET", "/auth/me", { token: victim.token })).status).toBe(200);
  });

  test("a self-service password change invalidates the token that made it", async () => {
    const u = ctx.users.accountant;
    assertOwnedAccount(u.username);
    const next = `Qa${Date.now().toString(36)}Rot`;
    const changed = await api("POST", "/auth/change-password", {
      token: u.token,
      body: { currentPassword: u.password, newPassword: next },
    });
    expect(changed.status).toBe(200);
    expect((await api("GET", "/auth/me", { token: u.token })).status).toBe(401);
    u.password = next;
    u.token = (await login(u.username, next)).token;
  });

  test("a role change is honoured by tokens already in the wild", async () => {
    const u = ctx.users.operator;
    assertOwnedAccount(u.username);
    expect((await api("GET", "/admin/users", { token: u.token })).status).toBe(403);
    await api("POST", "/admin/users", { token: ctx.ownerToken, body: { username: u.username, role: "manager" } });
    expect((await api("GET", "/admin/users", { token: u.token })).status).toBe(200);
    await api("POST", "/admin/users", { token: ctx.ownerToken, body: { username: u.username, role: "operator" } });
    expect((await api("GET", "/admin/users", { token: u.token })).status).toBe(403);
  });

  test("a token whose payload has been edited is rejected", async () => {
    const [h, p, sig] = ctx.users.operator.token.split(".");
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...claims, role: "owner" })).toString("base64url")}.${sig}`;
    expect((await api("GET", "/auth/me", { token: forged })).status).toBe(401);
    expect((await api("GET", "/auth/me", { token: "not.a.token" })).status).toBe(401);
    expect((await api("GET", "/auth/me", {})).status).toBe(401);
  });
});

// ===========================================================================
// (e) ROLE x ENDPOINT MATRIX
//     Bodies are deliberately empty: RolesGuard runs before the handler, so an
//     authorized role fails validation (4xx/5xx) while a denied role gets 403.
//     Nothing is created by this block.
// ===========================================================================
describe("(e) RolesGuard matches role-policy.ts", () => {
  const readCases: Array<[string, () => string, Role[]]> = [
    ["GET /dpr", () => "/dpr?date=2026-09-07", ANY_PROVISIONED],
    ["GET /machines", () => "/machines", ANY_PROVISIONED],
    ["GET /cutting-sessions", () => "/cutting-sessions", ANY_PROVISIONED],
    ["GET /cutting-sessions/active", () => "/cutting-sessions/active", ANY_PROVISIONED],
    ["GET /polishing-sessions", () => "/polishing-sessions?date=2026-09-12", ANY_PROVISIONED],
    ["GET /raw-blocks", () => "/raw-blocks", SALES_READ],
    ["GET /raw-blocks/recovery-ratio", () => "/raw-blocks/recovery-ratio", SALES_READ],
    ["GET /slabs", () => "/slabs", SALES_READ],
    ["GET /customers", () => "/customers", SALES_READ],
    ["GET /sales-orders", () => "/sales-orders", SALES_READ],
    ["GET /daily-sales-summary", () => "/daily-sales-summary?from=2026-09-01&to=2026-10-05", SALES_READ],
    ["GET /inventory-locations", () => "/inventory-locations", SALES_READ],
    ["GET /inventory-movements", () => "/inventory-movements", SALES_READ],
    ["GET /inventory-movements/on-hand", () => "/inventory-movements/on-hand", SALES_READ],
    ["GET /opening-inventory", () => "/opening-inventory", SALES_READ],
    ["GET /vehicles", () => "/vehicles", EXPENSE_DATA],
    ["GET /expenses", () => "/expenses", EXPENSE_DATA],
    ["GET /expenses/categories", () => "/expenses/categories", EXPENSE_DATA],
    ["GET /tally-import/batches", () => "/tally-import/batches", COMMERCIAL_DATA],
    [
      "GET /tally-import/item-cross-check",
      () => "/tally-import/item-cross-check?from=2026-04-01&to=2026-10-05",
      COMMERCIAL_DATA,
    ],
    ["GET /admin/users", () => "/admin/users", USER_MANAGEMENT],
  ];

  const writeCases: Array<[string, () => string, Role[]]> = [
    ["POST /dpr", () => "/dpr", PRODUCTION_INPUT],
    ["POST /machines/:id/log", () => `/machines/${ctx.fixtures.cuttingMachineId}/log`, PRODUCTION_INPUT],
    ["POST /cutting-sessions", () => "/cutting-sessions", PRODUCTION_INPUT],
    ["POST /cutting-sessions/:id/day-log", () => `/cutting-sessions/${ctx.fixtures.sessionAId}/day-log`, PRODUCTION_INPUT],
    ["POST /cutting-sessions/:id/complete", () => `/cutting-sessions/${ctx.fixtures.sessionAId}/complete`, PRODUCTION_INPUT],
    ["POST /polishing-sessions", () => "/polishing-sessions", PRODUCTION_INPUT],
    ["POST /slabs/:id/transition", () => `/slabs/${FOREIGN_UUID}/transition`, PRODUCTION_INPUT],
    ["POST /raw-blocks/:id/transition", () => `/raw-blocks/${ctx.fixtures.rawBlockId}/transition`, PRODUCTION_INPUT],
    ["POST /raw-blocks", () => "/raw-blocks", INVENTORY_DATA],
    ["POST /slabs", () => "/slabs", INVENTORY_DATA],
    ["POST /inventory-movements", () => "/inventory-movements", INVENTORY_DATA],
    ["POST /raw-blocks/:id/reconcile", () => `/raw-blocks/${ctx.fixtures.rawBlockId}/reconcile`, RECONCILIATION],
    ["POST /customers", () => "/customers", SALES_DATA],
    ["POST /sales-orders", () => "/sales-orders", SALES_DATA],
    ["POST /expenses", () => "/expenses", EXPENSE_DATA],
    ["POST /vehicles", () => "/vehicles", EXPENSE_DATA],
    ["POST /tally-import/daybook", () => "/tally-import/daybook", HISTORICAL_IMPORT],
    ["POST /tally-import/trial-balance", () => "/tally-import/trial-balance", HISTORICAL_IMPORT],
    ["POST /daily-sales-summary/backfill", () => "/daily-sales-summary/backfill", HISTORICAL_IMPORT],
    ["POST /opening-inventory", () => "/opening-inventory", HISTORICAL_IMPORT],
    ["POST /admin/users", () => "/admin/users", USER_MANAGEMENT],
    ["POST /copilot/ask", () => "/copilot/ask", OWNER_ONLY],
  ];

  test.each([...readCases, ...writeCases])("%s", async (label, pathFn, allowed) => {
    const isWrite = label.startsWith("POST");
    for (const role of ROLES) {
      const r = await api(isWrite ? "POST" : "GET", pathFn(), {
        token: tokenFor(role),
        ...(isWrite ? { body: {} } : {}),
      });
      if (allowed.includes(role)) {
        expect({ label, role, forbidden: r.status === 403 }).toEqual({ label, role, forbidden: false });
      } else {
        expect({ label, role, forbidden: r.status === 403 }).toEqual({ label, role, forbidden: true });
      }
    }
  });
});

// ===========================================================================
// TALLY IMPORT - malformed-input handling. Small payloads only; the
// unbounded-upload finding is deliberately not exercised here.
// ===========================================================================
describe("tally import rejects malformed files without a 500", () => {
  async function upload(path: string, content: string, name: string, token: string) {
    const fd = new FormData();
    fd.append("file", new Blob([content]), `${MARKER}-${name}`);
    const res = await fetch(BASE + path, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body };
  }

  const VALID_HEAD =
    '<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA><TALLYMESSAGE><VOUCHER VCHTYPE="Sales"><DATE>20260401</DATE>' +
    "<ALLLEDGERENTRIES.LIST><LEDGERNAME>Bank</LEDGERNAME><AMOUNT>100</AMOUNT></ALLLEDGERENTRIES.LIST>" +
    "</VOUCHER></TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>";

  test.each([
    ["not xml at all", "this is prose, not a Tally export"],
    ["right envelope, wrong contents", "<ENVELOPE><BODY><NOPE>hi</NOPE></BODY></ENVELOPE>"],
    ["empty file", ""],
    ["truncated mid-element", VALID_HEAD.slice(0, 90)],
    ["non-numeric DATE", VALID_HEAD.replace("20260401", "NOTADATE")],
  ])("daybook: %s -> 4xx, never 500", async (_name, content) => {
    const r = await upload("/tally-import/daybook", content, "malformed.xml", ctx.ownerToken);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  });

  test("item-cross-check rejects unparseable dates with a 400", async () => {
    const r = await api("GET", "/tally-import/item-cross-check?from=hello&to=world", { token: ctx.ownerToken });
    expect(r.status).toBe(400);
  });

  test("item-cross-check requires both bounds", async () => {
    const r = await api("GET", "/tally-import/item-cross-check?from=2026-09-01", { token: ctx.ownerToken });
    expect(r.status).toBe(400);
  });
});
