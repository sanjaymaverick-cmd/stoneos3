import test from "node:test";
import assert from "node:assert/strict";
// Node's built-in type-stripping test runner requires the explicit extension.
// @ts-ignore -- production TS imports stay extensionless; this file runs directly in Node.
import { canAccessRoute, isPublicPath, navLinksFor } from "./routePolicy.ts";

test("operator is limited to production workflows", () => {
  assert.equal(canAccessRoute("operator", "/dashboard"), true);
  assert.equal(canAccessRoute("operator", "/dpr"), true);
  assert.equal(canAccessRoute("operator", "/polishing"), true);
  assert.equal(canAccessRoute("operator", "/sales"), false);
  assert.equal(canAccessRoute("operator", "/expenses"), false);
  assert.equal(canAccessRoute("operator", "/recovery-ratio"), false);
  assert.equal(canAccessRoute("operator", "/admin/users"), false);
  assert.equal(canAccessRoute("operator", "/copilot"), false);
});

test("supervisor can operate and sell but cannot administer", () => {
  assert.equal(canAccessRoute("supervisor", "/dpr"), true);
  assert.equal(canAccessRoute("supervisor", "/sales"), true);
  assert.equal(canAccessRoute("supervisor", "/expenses"), true);
  assert.equal(canAccessRoute("supervisor", "/admin/users"), false);
  assert.equal(canAccessRoute("supervisor", "/setup/opening-inventory"), false);
  assert.equal(canAccessRoute("supervisor", "/copilot"), false);
});

test("owner, admin and manager all reach administration", () => {
  for (const role of ["owner", "admin", "manager"]) {
    assert.equal(canAccessRoute(role, "/admin/users"), true);
    assert.equal(canAccessRoute(role, "/setup/opening-inventory"), true);
    assert.equal(canAccessRoute(role, "/dashboard"), true);
    assert.equal(canAccessRoute(role, "/sales"), true);
  }
});

test("copilot is owner-only, narrower than the rest of the elevated tier", () => {
  assert.equal(canAccessRoute("owner", "/copilot"), true);
  for (const role of ["admin", "manager", "supervisor", "operator", "accountant", "auditor"]) {
    assert.equal(canAccessRoute(role, "/copilot"), false);
  }
});

test("the more specific policy wins over the root catch-all", () => {
  // "/" admits every role; "/admin" must still refuse an operator.
  assert.equal(canAccessRoute("operator", "/"), true);
  assert.equal(canAccessRoute("operator", "/admin/users"), false);
  assert.equal(canAccessRoute("operator", "/copilot"), false);
});

test("auditor and accountant get the reporting surfaces", () => {
  for (const role of ["auditor", "accountant"]) {
    assert.equal(canAccessRoute(role, "/sales"), true);
    assert.equal(canAccessRoute(role, "/recovery-ratio"), true);
    assert.equal(canAccessRoute(role, "/admin/users"), false);
  }
  assert.equal(canAccessRoute("accountant", "/expenses"), true);
  assert.equal(canAccessRoute("auditor", "/expenses"), false);
});

test("missing and unknown roles fail closed", () => {
  assert.equal(canAccessRoute(undefined, "/dashboard"), false);
  assert.equal(canAccessRoute("", "/dashboard"), false);
  assert.equal(canAccessRoute("intern", "/dashboard"), false);
  assert.equal(canAccessRoute("owner", "/not-a-route"), false);
});

test("sign-in and sign-up are public so AuthGate can show them", () => {
  assert.equal(isPublicPath("/sign-in"), true);
  assert.equal(isPublicPath("/sign-up"), true);
  assert.equal(isPublicPath("/sign-in/factor-one"), true);
  assert.equal(isPublicPath("/dashboard"), false);
});

test("nav never offers a link the guard would refuse", () => {
  for (const role of ["owner", "admin", "manager", "supervisor", "operator", "accountant", "auditor"]) {
    for (const link of navLinksFor(role)) {
      assert.equal(canAccessRoute(role, link.href), true, `${role} was offered ${link.href}`);
    }
  }
});

test("nav reflects the role", () => {
  const hrefs = (role: string) => navLinksFor(role).map((l) => l.href);
  assert.deepEqual(hrefs("operator"), ["/dashboard", "/dpr", "/polishing"]);
  assert.ok(hrefs("manager").includes("/setup/opening-inventory"));
  assert.ok(!hrefs("supervisor").includes("/setup/opening-inventory"));
  assert.ok(hrefs("owner").includes("/copilot"));
  assert.ok(!hrefs("manager").includes("/copilot"));
  assert.ok(hrefs("manager").includes("/admin/users"));
  assert.equal(navLinksFor(undefined).length, 0);
});
