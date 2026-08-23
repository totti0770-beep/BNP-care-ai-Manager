import { Router, type IRouter, type Request, type Response } from "express";
import { mintEngineToken } from "../lib/engineToken";

const ENGINE_URL = (
  process.env["ENGINE_URL"] ?? "http://127.0.0.1:8000"
).replace(/\/+$/, "");

// Document uploads are chunked and embedded synchronously, so allow a long tail.
const UPSTREAM_TIMEOUT_MS = 120_000;

// Hop-by-hop headers, plus anything carrying the caller's own credentials —
// the engine is authenticated with a freshly minted token, never with the
// browser's session cookie.
const DROPPED_REQUEST_HEADERS = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "keep-alive",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const DROPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
]);

const router: IRouter = Router();

/**
 * Reverse proxy for the Python clinical engine.
 *
 * This exists so that `/bnp-api` is a real route in every environment rather
 * than a Vite dev-server proxy, and so that the engine is only ever reachable
 * as an authenticated, identified user.
 */
router.use(async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  let token: string;
  try {
    token = mintEngineToken(req.user);
  } catch (err) {
    req.log?.error({ err }, "Cannot mint clinical engine token");
    res.status(503).json({ error: "Clinical engine is not configured" });
    return;
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (DROPPED_REQUEST_HEADERS.has(name) || value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  headers.set("authorization", `Bearer ${token}`);
  // Preserved so the engine can record who asked, from where, in its audit log.
  headers.set("x-forwarded-for", req.ip ?? "");

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const target = `${ENGINE_URL}${req.originalUrl.slice("/bnp-api".length) || "/"}`;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? (req as unknown as ReadableStream) : undefined,
      // Required by undici whenever a request streams its body.
      ...(hasBody ? { duplex: "half" } : {}),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    } as RequestInit);

    upstream.headers.forEach((value, name) => {
      if (!DROPPED_RESPONSE_HEADERS.has(name.toLowerCase())) {
        res.setHeader(name, value);
      }
    });

    res.status(upstream.status);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    req.log?.error({ err, target }, "Clinical engine request failed");
    res.status(502).json({ error: "Clinical engine unavailable" });
  }
});

export default router;
