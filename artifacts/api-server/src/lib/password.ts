import crypto from "crypto";

/**
 * Password hashing for accounts that sign in with credentials.
 *
 * Uses scrypt from node's own crypto module rather than adding bcrypt or argon2.
 * Two reasons, both practical: a native module would have to compile inside the
 * deployment image, and this workspace enforces `minimumReleaseAge: 1440` on new
 * dependencies (`pnpm-workspace.yaml`), so pulling one in is not a same-day
 * change. scrypt is memory-hard, is in the standard library, and needs neither.
 *
 * Stored format: `scrypt$N$r$p$<salt-hex>$<hash-hex>`. The parameters travel
 * with the hash so they can be raised later without invalidating existing
 * passwords — an older hash keeps verifying against the parameters it was made
 * with.
 */

const N = 16384; // CPU/memory cost
const R = 8; // block size
const P = 1; // parallelisation
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize("NFKC"),
      salt,
      keylen,
      // maxmem must exceed roughly 128 * N * r, or node refuses the call.
      { ...params, maxmem: 256 * params.N * params.r },
      (err, derived) => (err ? reject(err) : resolve(derived)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * Whether a password matches a stored hash.
 *
 * Returns false — never throws — for a null, empty or malformed hash. An OIDC
 * account has no password hash at all, and the one thing that must not happen
 * is for "this account has no password" to be mistaken for "any password will
 * do".
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored || !password) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts as [
    string, string, string, string, string, string,
  ];
  const params = { N: Number(nRaw), r: Number(rRaw), p: Number(pRaw) };
  if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) {
    return false;
  }
  if (params.N < 1024 || params.r < 1 || params.p < 1) return false;

  let expected: Buffer;
  let salt: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let derived: Buffer;
  try {
    derived = await scrypt(password, salt, expected.length, params);
  } catch {
    return false;
  }

  // Constant-time: a length check first, because timingSafeEqual throws on a
  // length mismatch and that throw would itself leak the length.
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

/**
 * Why a password is unacceptable for a new account, or null if it is fine.
 *
 * Deliberately minimal — length is the property that actually resists offline
 * guessing, and composition rules mostly push people toward `Password1!`.
 */
export function rejectWeakPassword(password: string): string | null {
  if (password.length < 12) {
    return "Password must be at least 12 characters.";
  }
  if (/^(.)\1*$/.test(password)) {
    return "Password must not be a single repeated character.";
  }
  const banned = ["password", "changeme", "admin123", "letmein", "123456"];
  const lowered = password.toLowerCase();
  if (banned.some((bad) => lowered.includes(bad))) {
    return "Password contains a well-known guessable string.";
  }
  return null;
}
