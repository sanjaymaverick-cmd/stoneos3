import * as jwt from "jsonwebtoken";
import { signSession, verifySession, SessionClaims } from "./session-token";

const SECRET = "test-secret-that-is-at-least-32-characters-long";
const CLAIMS: SessionClaims = {
  sub: "u-1",
  username: "ramesh.k",
  factoryId: "f-1",
  role: "operator",
  tv: 3,
};

describe("signSession / verifySession", () => {
  const original = process.env.SESSION_SECRET;
  beforeEach(() => {
    process.env.SESSION_SECRET = SECRET;
    delete process.env.SESSION_TTL_HOURS;
  });
  afterAll(() => {
    process.env.SESSION_SECRET = original;
  });

  it("round-trips the claims the guard depends on", () => {
    expect(verifySession(signSession(CLAIMS))).toMatchObject(CLAIMS);
  });

  it("refuses a token signed with a different secret", () => {
    const forged = jwt.sign(CLAIMS, "another-secret-that-is-32-characters-x", { algorithm: "HS256" });
    expect(verifySession(forged)).toBeNull();
  });

  it("refuses an unsigned alg:none token", () => {
    // The classic JWT downgrade. Pinning algorithms on verify is what stops it.
    const none = jwt.sign(CLAIMS, "", { algorithm: "none" });
    expect(verifySession(none)).toBeNull();
  });

  it("refuses an expired token", () => {
    const expired = jwt.sign(CLAIMS, SECRET, { algorithm: "HS256", expiresIn: -10 });
    expect(verifySession(expired)).toBeNull();
  });

  // The tokens are built inside each test, not in the table: an it.each table
  // is evaluated while the suite is being collected, which is before
  // beforeEach has put SESSION_SECRET in place.
  it.each([
    ["garbage", () => "not-a-token"],
    ["empty", () => ""],
    ["a truncated token", () => signSession(CLAIMS).slice(0, -6)],
  ])("returns null for %s rather than throwing", (_label, makeToken) => {
    expect(verifySession(makeToken())).toBeNull();
  });

  it("rejects a validly-signed token that is missing required claims", () => {
    // Signed with the right key, but without tv the guard could not check
    // revocation — so it must not be accepted at all.
    const partial = jwt.sign({ sub: "u-1", username: "x", factoryId: "f-1", role: "owner" }, SECRET, {
      algorithm: "HS256",
    });
    expect(verifySession(partial)).toBeNull();
  });

  it("rejects a token whose tv is not a number", () => {
    const wrongType = jwt.sign({ ...CLAIMS, tv: "3" }, SECRET, { algorithm: "HS256" });
    expect(verifySession(wrongType)).toBeNull();
  });

  it("honours SESSION_TTL_HOURS", () => {
    process.env.SESSION_TTL_HOURS = "1";
    const decoded = jwt.decode(signSession(CLAIMS)) as { exp: number; iat: number };
    expect(decoded.exp - decoded.iat).toBe(3600);
  });

  it("falls back to 12 hours when the TTL is absent or nonsense", () => {
    process.env.SESSION_TTL_HOURS = "not-a-number";
    const decoded = jwt.decode(signSession(CLAIMS)) as { exp: number; iat: number };
    expect(decoded.exp - decoded.iat).toBe(12 * 3600);
  });

  it("refuses to sign or verify without a strong secret", () => {
    process.env.SESSION_SECRET = "too-short";
    expect(() => signSession(CLAIMS)).toThrow(/at least 32 characters/);
    // verify swallows the throw and reports the token as invalid, which is the
    // safe direction: no secret means nothing is trusted.
    expect(verifySession("anything")).toBeNull();

    delete process.env.SESSION_SECRET;
    expect(() => signSession(CLAIMS)).toThrow(/SESSION_SECRET/);
  });
});
