#!/usr/bin/env node
/**
 * Render production entry:
 * 1. Apply SQL migrations when DATABASE_URL is set (Neon / managed Postgres)
 * 2. Boot Nitro node-server (.output/server/index.mjs)
 *
 * Render injects PORT; HOST=0.0.0.0 is set in render.yaml.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const server = join(root, ".output/server/index.mjs");

if (!existsSync(server)) {
  console.error(
    "[render-start] missing .output/server/index.mjs — run build first (npm run build:render)",
  );
  process.exit(1);
}

// Ensure we listen on all interfaces (Render / Docker)
if (!process.env.HOST) process.env.HOST = "0.0.0.0";
if (!process.env.NITRO_HOST) process.env.NITRO_HOST = process.env.HOST;
// Prefer Render's PORT when present
if (process.env.PORT && !process.env.NITRO_PORT) {
  process.env.NITRO_PORT = process.env.PORT;
}

async function migrate() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log(
      "[render-start] no DATABASE_URL — PGLite fallback (ephemeral on free tier)",
    );
    return;
  }
  console.log("[render-start] applying migrations…");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "scripts/migrate.mjs")], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`migrate exited ${code}`));
    });
    child.on("error", reject);
  });
}

await migrate();

console.log(
  `[render-start] starting server HOST=${process.env.HOST} PORT=${process.env.PORT || process.env.NITRO_PORT || "3000"}`,
);

const child = spawn(process.execPath, [server], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[render-start] server killed by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    child.kill(sig);
  });
}
