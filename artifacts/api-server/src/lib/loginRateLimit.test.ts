import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import {
  __resetAllLoginAttempts,
  loginRateLimit,
  resetLoginAttempts,
} from "./loginRateLimit";

function reqFrom(ip: string | undefined): Request {
  return { ip } as unknown as Request;
}

function res() {
  const headers: Record<string, string> = {};
  const out = {
    statusCode: 0,
    body: undefined as unknown,
    headers,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      out.statusCode = code;
      return out;
    },
    json(payload: unknown) {
      out.body = payload;
      return out;
    },
  };
  return out as unknown as Response & typeof out;
}

function attempt(ip: string | undefined) {
  const r = res();
  const next = vi.fn() as unknown as NextFunction;
  loginRateLimit(reqFrom(ip), r, next);
  return { r, allowed: (next as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0 };
}

beforeEach(() => {
  __resetAllLoginAttempts();
});

describe("loginRateLimit", () => {
  it("allows attempts up to the limit", () => {
    for (let i = 0; i < 10; i += 1) {
      expect(attempt("203.0.113.5").allowed).toBe(true);
    }
  });

  it("blocks the eleventh attempt with 429 and a Retry-After", () => {
    for (let i = 0; i < 10; i += 1) attempt("203.0.113.5");

    const { r, allowed } = attempt("203.0.113.5");
    expect(allowed).toBe(false);
    expect(r.statusCode).toBe(429);
    expect(Number(r.headers["Retry-After"])).toBeGreaterThan(0);
  });

  it("budgets each client separately", () => {
    for (let i = 0; i < 10; i += 1) attempt("203.0.113.5");

    // A different caller must not inherit the exhausted budget.
    expect(attempt("198.51.100.9").allowed).toBe(true);
  });

  it("clears the budget after a successful sign-in", () => {
    for (let i = 0; i < 10; i += 1) attempt("203.0.113.5");
    expect(attempt("203.0.113.5").allowed).toBe(false);

    resetLoginAttempts(reqFrom("203.0.113.5"));
    expect(attempt("203.0.113.5").allowed).toBe(true);
  });

  it("gives an unidentifiable caller a shared bucket, not an unlimited one", () => {
    for (let i = 0; i < 10; i += 1) attempt(undefined);
    expect(attempt(undefined).allowed).toBe(false);
  });

  it("lets the window expire", () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 10; i += 1) attempt("203.0.113.5");
      expect(attempt("203.0.113.5").allowed).toBe(false);

      vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1000);
      expect(attempt("203.0.113.5").allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
