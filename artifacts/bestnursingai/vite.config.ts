import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// These are dev-server concerns, so they default rather than throw. Requiring
// them at config load made `vite build` fail on any machine that had not
// exported Replit's environment, which meant the app could only be built there.
const DEFAULT_PORT = 5173;

const rawPort = process.env.PORT;
const parsedPort = rawPort ? Number(rawPort) : DEFAULT_PORT;

if (Number.isNaN(parsedPort) || parsedPort <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const port = parsedPort;
const basePath = process.env.BASE_PATH ?? "/";

// The API server hosts both /api and the /bnp-api engine gateway. In production
// they are same-origin, so only the dev server needs to proxy them.
const apiTarget = process.env.API_SERVER_URL ?? "http://localhost:8080";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      // Both go to the API server. /bnp-api is a real gateway route there, so
      // it exists in production too — it used to be a dev-only proxy straight
      // to the engine, which meant published builds could never reach it.
      "/bnp-api": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
