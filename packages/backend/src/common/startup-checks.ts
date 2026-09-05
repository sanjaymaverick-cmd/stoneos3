// Fail fast on configuration that would otherwise break at request time.
//
// Written after a real incident: SESSION_SECRET was left at the placeholder
// "REPLACE_ME" on a deployed environment. The service booted, reported
// healthy, verified passwords correctly, and then threw a bare 500 at the
// moment it tried to SIGN the session token — so the symptom ("internal
// server error when trying to login") pointed nowhere near the cause.
//
// A missing secret is not a runtime failure, it is a deployment that should
// never have been allowed to serve. These checks run before NestFactory
// starts, so the process dies with a message naming the variable instead.
//
// Split from main.ts so it can be tested without booting the application.

export interface StartupCheckResult {
  errors: string[];
  warnings: string[];
}

// Values that are obviously stand-ins rather than real configuration. The
// length rule below already catches "REPLACE_ME", but a 40-character
// placeholder would sail past it, and placeholders are exactly what get left
// behind when someone sets up an environment in a hurry.
const PLACEHOLDERS = ["replace_me", "changeme", "change_me", "todo", "xxx", "your_secret_here"];

function isPlaceholder(value: string): boolean {
  return PLACEHOLDERS.includes(value.trim().toLowerCase());
}

function isBlank(value: string | undefined): value is undefined {
  return value === undefined || value.trim() === "";
}

// Matches the minimum enforced in common/session-token.ts. Kept as a constant
// here rather than imported so a failing check cannot itself depend on the
// module it is validating.
export const MIN_SESSION_SECRET_LENGTH = 32;

export function checkStartupConfig(env: NodeJS.ProcessEnv): StartupCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Fatal: the app cannot do its job without these ---

  if (isBlank(env.DATABASE_URL)) {
    errors.push("DATABASE_URL is not set. The application cannot reach its database.");
  }

  const secret = env.SESSION_SECRET;
  if (isBlank(secret)) {
    errors.push(
      "SESSION_SECRET is not set. Nobody can sign in without it. Generate one with: " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`,
    );
  } else if (isPlaceholder(secret)) {
    errors.push(
      `SESSION_SECRET is still the placeholder "${secret}". Replace it with a real generated value.`,
    );
  } else if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    errors.push(
      `SESSION_SECRET is ${secret.length} characters; at least ${MIN_SESSION_SECRET_LENGTH} are required. ` +
        "A short secret makes every session token forgeable.",
    );
  }

  // --- Non-fatal: the app runs, but something is degraded or probably wrong ---

  if (isBlank(env.FRONTEND_URL)) {
    // parseFrontendOrigins falls back to http://localhost:3000, which is
    // never right in a deployed environment — every browser request from the
    // real frontend would fail CORS.
    warnings.push(
      "FRONTEND_URL is not set; CORS will only allow http://localhost:3000. " +
        "Deployed frontends will be blocked.",
    );
  }

  // The Copilot needs both of these. Neither affects anything else, so a
  // missing one degrades /copilot/ask rather than stopping the service.
  if (isBlank(env.GEMINI_API_KEY) && isBlank(env.GOOGLE_API_KEY)) {
    warnings.push("GEMINI_API_KEY is not set; POST /copilot/ask will fail. Nothing else is affected.");
  } else if (!isBlank(env.GEMINI_API_KEY) && isPlaceholder(env.GEMINI_API_KEY)) {
    warnings.push(`GEMINI_API_KEY is still the placeholder "${env.GEMINI_API_KEY}"; /copilot/ask will fail.`);
  }

  if (isBlank(env.COPILOT_DATABASE_URL)) {
    warnings.push(
      "COPILOT_DATABASE_URL is not set; POST /copilot/ask cannot execute queries. Nothing else is affected.",
    );
  }

  return { errors, warnings };
}

// Prints the result and stops the process if anything fatal was found.
// Returns normally when the configuration is usable.
export function assertStartupConfig(
  env: NodeJS.ProcessEnv = process.env,
  log: Pick<Console, "warn" | "error"> = console,
): void {
  const { errors, warnings } = checkStartupConfig(env);

  for (const warning of warnings) log.warn(`[config] ${warning}`);

  if (errors.length > 0) {
    log.error("[config] Refusing to start — the environment is not usable:");
    for (const error of errors) log.error(`[config]   - ${error}`);
    // Exiting beats throwing here: a throw inside bootstrap() surfaces as an
    // unhandled rejection with a stack trace, which buries the message the
    // operator actually needs to read.
    process.exit(1);
  }
}
