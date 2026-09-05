// Password hashing for owner-issued credentials.
//
// Uses scrypt from node:crypto rather than bcrypt/argon2 on purpose: both of
// those are native addons, and the production image is node:*-alpine (musl),
// where native builds are the single most common source of "works locally,
// dies in the image" failures. scrypt is memory-hard, in the standard library,
// and needs no build step.
//
// Stored format (single column, self-describing so the cost parameters can be
// raised later without breaking existing hashes):
//
//     scrypt$<N>$<r>$<p>$<salt-base64>$<hash-base64>
//
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

// OWASP's floor for scrypt at the time of writing. N is the CPU/memory cost.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;
const SALT_BYTES = 16;

// scrypt's default maxmem (32 MB) is too small for N=16384, r=8 on some
// builds — 128 * N * r is ~16 MB, and node wants headroom. Ask for 64 MB.
const MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(plain, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

// Returns false rather than throwing for every malformed or unmatched hash —
// including the deliberately unusable '!' written by the local-credentials
// migration for rows that predate this scheme. A caller must not be able to
// distinguish "no such user" from "wrong password" from "hash unreadable".
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64");
    expected = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  try {
    const derived = await scrypt(plain, salt, expected.length, { N: n, r, p, maxmem: MAXMEM });
    // Lengths are equal by construction above, so timingSafeEqual is safe to
    // call directly — it throws on a length mismatch.
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// Used when the owner issues or resets a login. Avoids look-alike characters
// (0/O, 1/l/I) because these get read off a screen and typed on a phone.
const ALPHABET = "abcdefghijkmnopqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePassword(length = 12): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
