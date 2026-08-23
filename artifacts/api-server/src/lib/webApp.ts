import fs from "node:fs";
import path from "node:path";
import express, { type Express, type Request, type Response } from "express";

/**
 * Serve the built single-page app from this process, at the same origin as
 * `/api` and `/bnp-api`.
 *
 * On a platform that gives one public URL per service (Railway), this is what
 * keeps the browser same-origin with the API — so the session cookie is a
 * first-party cookie and no CORS or second public hostname is involved. Under
 * docker compose nginx fronts the SPA and reaches this process only under
 * `/api` and `/bnp-api`, so these routes are never hit there and that topology
 * is unchanged.
 *
 * Returns whether a build was found. Running from source there is none, and
 * mounting a catch-all that 404s every path would be worse than not mounting
 * one at all — so the absence is a no-op, not an error.
 *
 * Mount this *after* the API routes and their 404 handler: the catch-all below
 * would otherwise answer an unknown `/api/...` path with the HTML shell, and a
 * client parsing that as JSON gets a confusing syntax error instead of a 404.
 */
export function mountWebApp(app: Express, webRoot: string): boolean {
  const root = path.resolve(webRoot);

  if (!fs.existsSync(path.join(root, "index.html"))) {
    return false;
  }

  // Vite fingerprints these filenames, so they can be cached forever. Anything
  // else — index.html above all — must not be, or a client pins to a stale
  // bundle and keeps calling an API contract that has moved.
  app.use(
    "/assets",
    express.static(path.join(root, "assets"), {
      immutable: true,
      maxAge: "1y",
    }),
  );

  app.use(express.static(root, { index: false, maxAge: 0 }));

  // Client-side routing: a path that is not a file is a route inside the app,
  // so it gets the shell rather than a 404.
  app.get(/.*/, (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(root, "index.html"));
  });

  return true;
}
