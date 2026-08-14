import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthUser } from "@workspace/api-zod";
import { GATEWAY_ISSUER, mintEngineToken } from "./engineToken";

const SECRET = "test-secret-not-used-anywhere-real";
const ORIGINAL = process.env["ENGINE_JWT_SECRET"];

beforeEach(() => {
  process.env["ENGINE_JWT_SECRET"] = SECRET;
});

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env["ENGINE_JWT_SECRET"];
  } else {
    process.env["ENGINE_JWT_SECRET"] = ORIGINAL;
  }
});

function decode(token: string) {
  const [header, payload] = token.split(".");
  return {
    header: JSON.parse(Buffer.from(header!, "base64url").toString()),
    payload: JSON.parse(Buffer.from(payload!, "base64url").toString()),
  };
}

function nurse(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "oidc-sub-1",
    name: "Sara Ahmed",
    email: "nurse@hospital.example",
    roles: ["user"],
    ...overrides,
  };
}

describe("mintEngineToken", () => {
  it("produces a verifiable HS256 signature", () => {
    const token = mintEngineToken(nurse());
    const [header, payload, signature] = token.split(".");

    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");

    expect(signature).toBe(expected);
    expect(decode(token).header).toEqual({ alg: "HS256", typ: "JWT" });
  });

  it("identifies the individual user, not a shared account", () => {
    // This is what makes the engine's audit log attributable. Before the
    // gateway, every request authenticated as one shared `clinicadmin`.
    const { payload } = decode(mintEngineToken(nurse()));
    expect(payload.sub).toBe("oidc-sub-1");
    expect(payload.username).toBe("nurse@hospital.example");
    expect(payload.iss).toBe(GATEWAY_ISSUER);
  });

  it("falls back to the display name when there is no email", () => {
    const { payload } = decode(mintEngineToken(nurse({ email: undefined })));
    expect(payload.username).toBe("Sara Ahmed");
  });

  it("maps the admin role through", () => {
    const { payload } = decode(
      mintEngineToken(nurse({ roles: ["user", "admin"] })),
    );
    expect(payload.role).toBe("admin");
  });

  it("never grants admin from an unrecognised role", () => {
    const { payload } = decode(
      mintEngineToken(nurse({ roles: ["user", "superuser", "root"] })),
    );
    expect(payload.role).toBe("user");
  });

  it("is short-lived", () => {
    const { payload } = decode(mintEngineToken(nurse()));
    const ttl = payload.exp - payload.iat;
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  it("refuses to mint without a configured secret", () => {
    // Failing here surfaces as a 503, rather than the engine accepting tokens
    // signed with a predictable key.
    delete process.env["ENGINE_JWT_SECRET"];
    expect(() => mintEngineToken(nurse())).toThrow(/ENGINE_JWT_SECRET/);
  });
});
