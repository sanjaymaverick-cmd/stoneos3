// Signing and verification for the app's own session tokens.
//
// Replaces Clerk-issued session tokens. The token is a plain HS256 JWT whose
// claims mirror what the old Clerk guard used to read out of Clerk's
// publicMetadata, plus `tv` (token version) which is what makes revocation
// immediate — see SessionAuthGuard.
//
// The token is NOT the authority on whether a user may act: the guard still
// loads the row and re-checks `active` and `tokenVersion` on every request.
// The signature only proves the claims were not forged.
import * as jwt from "jsonwebtoken";

export interface SessionClaims {
  sub: string; // app_user.id
  username: string;
  factoryId: string;
  role: string;
  tv: number; // app_user.tokenVersion at issue time
}

// A weak or missing secret makes every token forgeable, so this refuses to
// guess a default. Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to at least 32 characters. Generate one with: " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`,
    );
  }
  return value;
}

// Defaults to a 12-hour working day: long enough that a supervisor is not
// re-authenticating mid-shift, short enough that a forgotten phone is not a
// standing key. Revocation does not wait for this to elapse.
function ttlSeconds(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : 12) * 3600;
}

export function signSession(claims: SessionClaims): string {
  return jwt.sign(claims, secret(), { algorithm: "HS256", expiresIn: ttlSeconds() });
}

// Returns null for anything that does not verify — expired, tampered, wrong
// algorithm, malformed. Callers turn that into a 401 without distinguishing,
// so a probe learns nothing about why a token was refused.
export function verifySession(token: string): SessionClaims | null {
  try {
    // Pinning algorithms is what stops an attacker presenting a token that
    // claims alg:"none" or an asymmetric algorithm the library would then
    // verify against the secret as a public key.
    const decoded = jwt.verify(token, secret(), { algorithms: ["HS256"] });
    if (typeof decoded === "string") return null;

    const { sub, username, factoryId, role, tv } = decoded as Record<string, unknown>;
    if (
      typeof sub !== "string" ||
      typeof username !== "string" ||
      typeof factoryId !== "string" ||
      typeof role !== "string" ||
      typeof tv !== "number"
    ) {
      return null;
    }
    return { sub, username, factoryId, role, tv };
  } catch {
    return null;
  }
}
