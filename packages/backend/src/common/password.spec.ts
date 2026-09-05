import { generatePassword, hashPassword, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("verifies a password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery");
    await expect(verifyPassword("correct horse battery", hash)).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery");
    await expect(verifyPassword("correct horse batteryy", hash)).resolves.toBe(false);
    await expect(verifyPassword("", hash)).resolves.toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toEqual(b);
    // Both still verify — the salt is carried in the encoded hash.
    await expect(verifyPassword("same-password", a)).resolves.toBe(true);
    await expect(verifyPassword("same-password", b)).resolves.toBe(true);
  });

  it("never stores the password in the hash", async () => {
    const hash = await hashPassword("plaintext-leak-check");
    expect(hash).not.toContain("plaintext-leak-check");
    expect(hash.startsWith("scrypt$16384$8$1$")).toBe(true);
  });

  it.each([
    ["the migration's deliberately unusable hash", "!"],
    ["an empty string", ""],
    ["a bcrypt hash from another system", "$2b$10$abcdefghijklmnopqrstuv"],
    ["too few fields", "scrypt$16384$8$1$onlysalt"],
    ["a non-scrypt algorithm label", "argon2$16384$8$1$c2FsdA==$aGFzaA=="],
    ["non-numeric cost parameters", "scrypt$abc$8$1$c2FsdA==$aGFzaA=="],
    ["an empty hash segment", "scrypt$16384$8$1$c2FsdA==$"],
  ])("returns false rather than throwing for %s", async (_label, stored) => {
    await expect(verifyPassword("anything", stored)).resolves.toBe(false);
  });
});

describe("generatePassword", () => {
  it("defaults to 12 characters and honours an explicit length", () => {
    expect(generatePassword()).toHaveLength(12);
    expect(generatePassword(20)).toHaveLength(20);
  });

  it("omits characters that are misread when typed off a screen", () => {
    // 0/O and 1/l/I are the classic confusions for a password read aloud or
    // copied from a printout onto a phone.
    const sample = Array.from({ length: 200 }, () => generatePassword(24)).join("");
    expect(sample).not.toMatch(/[0O1lIB]/);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generatePassword()));
    expect(seen.size).toBe(50);
  });
});
