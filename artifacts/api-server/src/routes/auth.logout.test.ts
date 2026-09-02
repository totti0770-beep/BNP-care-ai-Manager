/**
 * Signing out must not depend on the identity provider being reachable.
 *
 * `GET /api/logout` used to call `getOidcConfig()` — which runs OIDC discovery
 * against REPL_ID — *before* `clearSession`. On a deployment with no hosted
 * issuer that throws, so the handler answered 500 having never cleared the
 * session, and the user stayed signed in. Observed in production on
 * 2026-09-01 at 17:44:26: `GET /api/logout → 500`.
 *
 * The failure mode is the dangerous kind: the user is shown an error, and the
 * true state is the opposite of what an error implies. On a shared clinical
 * workstation it hands the next person the previous nurse's session.
 *
 * These tests fix the *order*, which is the actual defect. The provider call is
 * made to fail in the first case precisely so that a regression — moving the
 * OIDC work back above the session clear — cannot pass.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

// @workspace/db throws at import time without this; the pool itself is lazy and
// never connects, because every query path is mocked below.
process.env.DATABASE_URL ??= "postgres://unused:unused@127.0.0.1:5432/unused";

const cleared: Array<string | undefined> = [];
let discoveryWorks = false;

vi.mock("../lib/auth", () => ({
  ISSUER_URL: "https://issuer.example",
  SESSION_COOKIE: "sid",
  SESSION_TTL: 1000,
  getOidcConfig: vi.fn(async () => {
    if (!discoveryWorks) {
      // What openid-client does when REPL_ID is undefined.
      throw new Error("OIDC discovery failed");
    }
    return {} as never;
  }),
  createSession: vi.fn(async () => "new-sid"),
  getSession: vi.fn(async () => null),
  updateSession: vi.fn(async () => undefined),
  deleteSession: vi.fn(async () => undefined),
  deleteSessionsForUser: vi.fn(async () => undefined),
  clearSession: vi.fn(async (_res: unknown, sid?: string) => {
    cleared.push(sid);
  }),
  getSessionId: vi.fn(() => "session-being-ended"),
}));

vi.mock("openid-client", () => ({
  buildEndSessionUrl: vi.fn(() => new URL("https://issuer.example/end-session")),
  buildAuthorizationUrl: vi.fn(() => new URL("https://issuer.example/authorize")),
  randomState: vi.fn(() => "state"),
  randomNonce: vi.fn(() => "nonce"),
  randomPKCECodeVerifier: vi.fn(() => "verifier"),
  calculatePKCECodeChallenge: vi.fn(async () => "challenge"),
  discovery: vi.fn(),
}));

const { default: router } = await import("./auth");

async function serve() {
  const app = express();
  // app.ts attaches a logger; the handler's error path uses req.log.
  app.use((req, _res, next) => {
    (req as unknown as { log: unknown }).log = {
      error: () => {},
      warn: () => {},
      info: () => {},
    };
    next();
  });
  app.use("/api", router);

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

beforeEach(() => {
  cleared.length = 0;
  discoveryWorks = false;
  delete process.env.REPL_ID;
});

describe("GET /api/logout", () => {
  it("clears the session when no issuer is configured, and does not 500", async () => {
    const { base, close } = await serve();
    try {
      const res = await fetch(`${base}/api/logout`, { redirect: "manual" });

      expect(res.status).not.toBe(500);
      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);
      // The point of the fix.
      expect(cleared).toEqual(["session-being-ended"]);
    } finally {
      await close();
    }
  });

  it("clears the session even when the provider round-trip fails", async () => {
    // REPL_ID is set, so the OIDC branch is taken — and discovery still throws.
    // A sign-out that has already happened locally must not report an error.
    process.env.REPL_ID = "some-repl-id";
    const { base, close } = await serve();
    try {
      const res = await fetch(`${base}/api/logout`, { redirect: "manual" });

      expect(res.status).not.toBe(500);
      expect(cleared).toEqual(["session-being-ended"]);
    } finally {
      await close();
    }
  });

  it("still ends the provider session where OIDC is configured", async () => {
    process.env.REPL_ID = "some-repl-id";
    discoveryWorks = true;
    const { base, close } = await serve();
    try {
      const res = await fetch(`${base}/api/logout`, { redirect: "manual" });

      expect(res.headers.get("location")).toBe("https://issuer.example/end-session");
      expect(cleared).toEqual(["session-being-ended"]);
    } finally {
      await close();
    }
  });
});

describe("GET /api/login", () => {
  it("redirects to the app instead of 500ing when no issuer is configured", async () => {
    // The web app assumes OIDC until /api/auth/methods answers, so a
    // password-only deployment can offer this route on first paint. It did, and
    // the user got a 500 (production, 2026-09-01 17:40:21).
    const { base, close } = await serve();
    try {
      const res = await fetch(`${base}/api/login`, { redirect: "manual" });

      expect(res.status).not.toBe(500);
      expect(res.headers.get("location")).toBe("/");
    } finally {
      await close();
    }
  });

  it("still starts the OIDC flow where it is configured", async () => {
    process.env.REPL_ID = "some-repl-id";
    discoveryWorks = true;
    const { base, close } = await serve();
    try {
      const res = await fetch(`${base}/api/login`, { redirect: "manual" });

      expect(res.headers.get("location")).toBe("https://issuer.example/authorize");
    } finally {
      await close();
    }
  });
});
