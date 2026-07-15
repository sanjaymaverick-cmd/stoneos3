// Defense-in-depth validation of Gemini-generated SQL before it is ever
// executed — NOT the real safety boundary (that's Step 6A's RLS + the
// read-only stoneos_copilot_ro role, which cannot write/DDL regardless of
// what SQL text reaches Postgres). This exists so a bad generation fails
// fast with a friendly message instead of a raw Postgres permission-denied
// error reaching the user, and so nothing resembling a write/DDL/multi-
// statement attempt is even sent to the database in the first place.
//
// Pure function, no NestJS/DB dependency on purpose — this repo has no test
// framework set up anywhere (checked before building), so this is verified
// by compiling and running a standalone script against the real compiled
// output rather than pulling in Jest as unrequested scope. Keeping this a
// plain, dependency-free function is what makes that possible.

export type SqlValidationResult = { valid: true; sql: string } | { valid: false; reason: string };

// The LLM should never need any of these — SELECT is the only shape we
// ever want to execute. SET is included because the caller (not the LLM)
// is the only thing allowed to SET anything, namely the factory-scoping
// session variable — see copilot.service.ts's executeScoped().
const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "CREATE",
  "COPY",
  "EXECUTE",
  "CALL",
  "DO",
  "VACUUM",
  "SET",
];

// Function calls that mutate session/transaction state the same way a bare
// SET statement would — the \bSET\b keyword check above does NOT catch
// these, because "_" is a word character in regex, so there is no word
// boundary between "set" and "_config" and \bSET\b never matches inside
// "set_config(". set_config() is exactly the mechanism executeScoped() uses
// to apply factory scoping (see copilot.service.ts), so generated SQL that
// calls it directly (e.g. from inside a CTE evaluated before the outer
// query's table scan) could overwrite app.current_factory_id mid-
// transaction and read another factory's rows before COMMIT/ROLLBACK
// resets it. Matched separately from FORBIDDEN_KEYWORDS since it's a
// function-call shape, not a bare keyword, and optionally schema-qualified.
const FORBIDDEN_FUNCTION_CALLS: RegExp[] = [/(?:\bpg_catalog\s*\.\s*)?\bset_config\s*\(/i];

const DEFAULT_ROW_LIMIT = 500;

// Strips leading whitespace and leading `--` line comments / `/* */` block
// comments, repeatedly, so "must start with SELECT" isn't fooled by a
// comment Gemini prepended. Only used for the start-of-statement check —
// keyword scanning below deliberately still looks at the whole string
// (rejecting a forbidden keyword hidden inside a comment is the safer
// failure mode here, not a bug).
function stripLeadingComments(sql: string): string {
  let s = sql;
  for (;;) {
    const trimmed = s.replace(/^\s+/, "");
    if (trimmed !== s) {
      s = trimmed;
      continue;
    }
    if (s.startsWith("--")) {
      const nl = s.indexOf("\n");
      s = nl === -1 ? "" : s.slice(nl + 1);
      continue;
    }
    if (s.startsWith("/*")) {
      const end = s.indexOf("*/");
      s = end === -1 ? "" : s.slice(end + 2);
      continue;
    }
    return s;
  }
}

export function validateGeneratedSql(rawSql: string, defaultLimit: number = DEFAULT_ROW_LIMIT): SqlValidationResult {
  const sql = (rawSql ?? "").trim();
  if (!sql) {
    return { valid: false, reason: "Empty SQL generated" };
  }

  // Stacked-query check: a `;` followed by anything but whitespace is a red
  // flag regardless of what that content is (per brief — deliberately not
  // a full SQL-string-literal-aware parser, a semicolon embedded in a
  // string literal value gets rejected too, which is an acceptable false
  // positive for a defense-in-depth check).
  const firstSemi = sql.indexOf(";");
  if (firstSemi !== -1 && sql.slice(firstSemi + 1).trim().length > 0) {
    return { valid: false, reason: "Multiple statements detected (content follows a semicolon)" };
  }
  // A single harmless trailing semicolon (optionally trailing whitespace)
  // is fine — strip it so keyword scanning/LIMIT-append work on the body.
  const body = (firstSemi !== -1 ? sql.slice(0, firstSemi) : sql).trim();

  // A statement may start with SELECT directly, or with WITH (optionally
  // WITH RECURSIVE) for a CTE — e.g. `WITH totals AS (SELECT ...) SELECT
  // ... FROM totals`. Allowing WITH here doesn't weaken anything: a
  // data-modifying CTE (`WITH x AS (...) DELETE ...`) still contains a
  // forbidden keyword and gets rejected by the keyword scan below, which
  // scans the whole body regardless of which shape the statement takes.
  if (!/^(select|with)\b/i.test(stripLeadingComments(body))) {
    return { valid: false, reason: "Statement does not start with SELECT (or WITH for a CTE)" };
  }

  for (const keyword of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`\\b${keyword}\\b`, "i");
    if (re.test(body)) {
      return { valid: false, reason: `Contains forbidden keyword: ${keyword}` };
    }
  }

  for (const pattern of FORBIDDEN_FUNCTION_CALLS) {
    if (pattern.test(body)) {
      return { valid: false, reason: "Contains forbidden function call: set_config" };
    }
  }

  const hasLimit = /\blimit\b/i.test(body);
  const finalSql = hasLimit ? body : `${body}\nLIMIT ${defaultLimit}`;

  return { valid: true, sql: finalSql };
}
