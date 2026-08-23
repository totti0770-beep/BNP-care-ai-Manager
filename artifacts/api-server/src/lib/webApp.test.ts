import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express, { type Request, type Response } from "express";
import { mountWebApp } from "./webApp";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "webapp-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function buildOutput() {
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html>shell");
  fs.mkdirSync(path.join(root, "assets"));
  fs.writeFileSync(path.join(root, "assets", "index-abc123.js"), "bundle");
}

/** Mounts the same route order app.ts uses, and serves it on a real socket. */
async function serve(): Promise<{ base: string; close: () => Promise<void> }> {
  const app = express();
  app.get("/api/healthz", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });
  mountWebApp(app, root);

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("mountWebApp", () => {
  it("reports no build rather than mounting a catch-all that 404s everything", () => {
    expect(mountWebApp(express(), root)).toBe(false);
  });

  it("serves the shell for an app route", async () => {
    buildOutput();
    const { base, close } = await serve();
    try {
      const res = await fetch(`${base}/formulary/review`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("shell");
      // A cached shell pins the client to a bundle the API has moved past.
      expect(res.headers.get("cache-control")).toBe("no-cache");
    } finally {
      await close();
    }
  });

  it("leaves an unknown /api path as JSON, not the HTML shell", async () => {
    buildOutput();
    const { base, close } = await serve();
    try {
      const res = await fetch(`${base}/api/nope`);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    } finally {
      await close();
    }
  });

  it("still routes real API requests", async () => {
    buildOutput();
    const { base, close } = await serve();
    try {
      const res = await fetch(`${base}/api/healthz`);
      expect(await res.json()).toEqual({ ok: true });
    } finally {
      await close();
    }
  });

  it("marks fingerprinted assets immutable", async () => {
    buildOutput();
    const { base, close } = await serve();
    try {
      const res = await fetch(`${base}/assets/index-abc123.js`);
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("immutable");
    } finally {
      await close();
    }
  });
});
