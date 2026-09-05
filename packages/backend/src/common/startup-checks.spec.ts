import { checkStartupConfig, assertStartupConfig, MIN_SESSION_SECRET_LENGTH } from "./startup-checks";

const GOOD_SECRET = "a".repeat(MIN_SESSION_SECRET_LENGTH);

// A fully valid environment; individual tests break one thing at a time.
const validEnv = (): NodeJS.ProcessEnv => ({
  DATABASE_URL: "postgresql://user:pass@host:5432/stoneos",
  SESSION_SECRET: GOOD_SECRET,
  FRONTEND_URL: "https://app.example.com",
  GEMINI_API_KEY: "real-looking-key",
  COPILOT_DATABASE_URL: "postgresql://ro:pass@host:5432/stoneos",
});

describe("checkStartupConfig — fatal", () => {
  it("passes a complete environment with nothing to say", () => {
    expect(checkStartupConfig(validEnv())).toEqual({ errors: [], warnings: [] });
  });

  it("rejects a missing DATABASE_URL", () => {
    const { errors } = checkStartupConfig({ ...validEnv(), DATABASE_URL: undefined });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/DATABASE_URL/);
  });

  it("rejects a missing SESSION_SECRET and says how to make one", () => {
    const { errors } = checkStartupConfig({ ...validEnv(), SESSION_SECRET: undefined });
    expect(errors[0]).toMatch(/SESSION_SECRET is not set/);
    expect(errors[0]).toMatch(/randomBytes\(32\)/);
  });

  it("rejects the placeholder that caused the original incident", () => {
    const { errors } = checkStartupConfig({ ...validEnv(), SESSION_SECRET: "REPLACE_ME" });
    expect(errors[0]).toMatch(/placeholder/);
  });

  it.each(["replace_me", "  ChangeMe  ", "TODO", "xxx"])(
    "treats %p as a placeholder regardless of case or padding",
    (value) => {
      const { errors } = checkStartupConfig({ ...validEnv(), SESSION_SECRET: value });
      expect(errors[0]).toMatch(/placeholder/);
    },
  );

  it("rejects a secret that is merely too short, and names the length", () => {
    const short = "a".repeat(MIN_SESSION_SECRET_LENGTH - 1);
    const { errors } = checkStartupConfig({ ...validEnv(), SESSION_SECRET: short });
    expect(errors[0]).toMatch(new RegExp(`${short.length} characters`));
    expect(errors[0]).toMatch(/forgeable/);
  });

  it("accepts a secret of exactly the minimum length", () => {
    expect(checkStartupConfig({ ...validEnv(), SESSION_SECRET: GOOD_SECRET }).errors).toEqual([]);
  });

  it("treats whitespace-only values as missing rather than valid", () => {
    const { errors } = checkStartupConfig({ ...validEnv(), DATABASE_URL: "   " });
    expect(errors[0]).toMatch(/DATABASE_URL is not set/);
  });

  it("reports every fatal problem at once rather than one per restart", () => {
    const { errors } = checkStartupConfig({});
    expect(errors).toHaveLength(2);
    expect(errors.join(" ")).toMatch(/DATABASE_URL/);
    expect(errors.join(" ")).toMatch(/SESSION_SECRET/);
  });
});

describe("checkStartupConfig — warnings", () => {
  it("warns, but does not fail, when FRONTEND_URL is absent", () => {
    const { errors, warnings } = checkStartupConfig({ ...validEnv(), FRONTEND_URL: undefined });
    expect(errors).toEqual([]);
    expect(warnings[0]).toMatch(/localhost:3000/);
  });

  it("warns when the Copilot has no API key", () => {
    const { errors, warnings } = checkStartupConfig({ ...validEnv(), GEMINI_API_KEY: undefined });
    expect(errors).toEqual([]);
    expect(warnings[0]).toMatch(/copilot/i);
  });

  it("accepts GOOGLE_API_KEY as the alternative to GEMINI_API_KEY", () => {
    const { warnings } = checkStartupConfig({
      ...validEnv(),
      GEMINI_API_KEY: undefined,
      GOOGLE_API_KEY: "real-looking-key",
    });
    expect(warnings.join(" ")).not.toMatch(/GEMINI_API_KEY is not set/);
  });

  it("warns about a placeholder Gemini key without stopping the service", () => {
    const { errors, warnings } = checkStartupConfig({ ...validEnv(), GEMINI_API_KEY: "REPLACE_ME" });
    expect(errors).toEqual([]);
    expect(warnings[0]).toMatch(/placeholder/);
  });

  it("warns when the Copilot has no read-only connection string", () => {
    const { errors, warnings } = checkStartupConfig({ ...validEnv(), COPILOT_DATABASE_URL: undefined });
    expect(errors).toEqual([]);
    expect(warnings[0]).toMatch(/COPILOT_DATABASE_URL/);
  });
});

describe("assertStartupConfig", () => {
  const log = { warn: jest.fn(), error: jest.fn() };
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    log.warn.mockClear();
    log.error.mockClear();
    exitSpy = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  });
  afterEach(() => exitSpy.mockRestore());

  it("does not exit on a valid environment", () => {
    assertStartupConfig(validEnv(), log);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("exits non-zero and prints the offending variable when fatal", () => {
    assertStartupConfig({ ...validEnv(), SESSION_SECRET: "REPLACE_ME" }, log);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(log.error.mock.calls.flat().join(" ")).toMatch(/SESSION_SECRET/);
  });

  it("prints warnings but keeps going", () => {
    assertStartupConfig({ ...validEnv(), COPILOT_DATABASE_URL: undefined }, log);
    expect(log.warn).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
