import type { NextFunction, Request, Response } from "express";

/**
 * In-process rate limiting for the credentials login.
 *
 * The clinical engine already limits `/auth/login` this way
 * (`artifacts/clinical-ai-engine/middleware/rate_limit.py`); this is the same
 * idea on the gateway, which is the door a browser actually knocks on. Kept
 * dependency-free for the same reason as the password hashing: the workspace
 * delays new dependencies by 24h, and this needs no library.
 *
 * Per-process, so a multi-replica deployment blunts credential stuffing by only
 * a factor of the replica count. That is a real limit and is noted in the
 * README alongside the engine's — closing it properly means a shared store.
 */

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const SWEEP_EVERY_MS = 10 * 60 * 1000;

const attempts = new Map<string, number[]>();
let lastSweep = 0;

function clientKey(req: Request): string {
  // Express populates req.ip from X-Forwarded-For only when `trust proxy` is
  // set; behind Railway's router it is, so this is the caller rather than the
  // load balancer. Falling back to a constant is deliberate: an unknown client
  // shares one bucket rather than getting an unlimited one.
  return req.ip ?? "unknown";
}

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [key, hits] of attempts) {
    const live = hits.filter((at) => now - at < WINDOW_MS);
    if (live.length === 0) attempts.delete(key);
    else attempts.set(key, live);
  }
}

export function loginRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const now = Date.now();
  sweep(now);

  const key = clientKey(req);
  const recent = (attempts.get(key) ?? []).filter(
    (at) => now - at < WINDOW_MS,
  );

  if (recent.length >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil(
      (WINDOW_MS - (now - (recent[0] as number))) / 1000,
    );
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "Too many login attempts. Try again later." });
    return;
  }

  recent.push(now);
  attempts.set(key, recent);
  next();
}

/** Clears a client's budget — called after a successful sign-in. */
export function resetLoginAttempts(req: Request): void {
  attempts.delete(clientKey(req));
}

/** Test seam. */
export function __resetAllLoginAttempts(): void {
  attempts.clear();
  lastSweep = 0;
}
