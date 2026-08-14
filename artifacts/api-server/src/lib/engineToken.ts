import crypto from "crypto";
import type { AuthUser } from "@workspace/api-zod";

/**
 * Tokens the clinical engine accepts on behalf of a signed-in user.
 *
 * The browser never sees one of these. They are minted per request from the
 * server-side OIDC session, so the engine's audit log records the actual nurse
 * rather than a shared service account.
 */
export const GATEWAY_ISSUER = "bnp-gateway";

// Short-lived because a fresh token is minted for every proxied request.
const TOKEN_TTL_SECONDS = 300;

function b64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function requireSecret(): string {
  const secret = process.env["ENGINE_JWT_SECRET"];
  if (!secret) {
    throw new Error(
      "ENGINE_JWT_SECRET is not set. It must match the clinical engine's JWT_SECRET.",
    );
  }
  return secret;
}

export function mintEngineToken(user: AuthUser): string {
  const now = Math.floor(Date.now() / 1000);

  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: GATEWAY_ISSUER,
      sub: user.id,
      username: user.email ?? user.name,
      // The gateway is authoritative for roles; the engine does not re-derive them.
      role: user.roles.includes("admin") ? "admin" : "user",
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    }),
  );

  const signingInput = `${header}.${payload}`;
  const signature = crypto
    .createHmac("sha256", requireSecret())
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}
