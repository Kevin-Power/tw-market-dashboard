/**
 * Post-build fix for TanStack Start + Nitro production:
 *
 * 1. SSR CSS hash mismatch — copy/register CSS so layout isn't blank on Render
 * 2. PGLite WASM assets — Nitro inlines the JS but drops pglite.data / .wasm;
 *    without them /api/* and market_snapshot fail with ENOENT on free tier
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const publicAssets = path.join(root, ".output/public/assets");
const serverIndex = path.join(root, ".output/server/index.mjs");
const serverDir = path.join(root, ".output/server");
const serverLibs = path.join(root, ".output/server/_libs");

if (!fs.existsSync(publicAssets) || !fs.existsSync(serverIndex)) {
  console.warn("[sync-ssr-assets] missing .output — skip");
  process.exit(0);
}

// ── 1. PGLite runtime assets (node-server / Render free, no DATABASE_URL) ──
const pgliteDist = path.join(
  root,
  "node_modules/@electric-sql/pglite/dist",
);
const pgliteFiles = ["pglite.data", "pglite.wasm", "initdb.wasm"];
if (fs.existsSync(serverLibs) && fs.existsSync(pgliteDist)) {
  for (const name of pgliteFiles) {
    const src = path.join(pgliteDist, name);
    if (!fs.existsSync(src)) {
      console.warn("[sync-ssr-assets] missing pglite asset", name);
      continue;
    }
    const dest = path.join(serverLibs, name);
    fs.copyFileSync(src, dest);
    console.log(
      "[sync-ssr-assets] pglite asset",
      name,
      `(${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`,
    );
  }
} else {
  console.warn(
    "[sync-ssr-assets] skip pglite assets (no _libs or package)",
  );
}

// ── 2. Copy SSR-side CSS into public ──
const ssrCssDir = path.join(
  root,
  "node_modules/.nitro/vite/services/ssr/assets",
);
if (fs.existsSync(ssrCssDir)) {
  for (const name of fs.readdirSync(ssrCssDir)) {
    if (!name.endsWith(".css")) continue;
    const dest = path.join(publicAssets, name);
    fs.copyFileSync(path.join(ssrCssDir, name), dest);
    console.log("[sync-ssr-assets] ensured public", name);
  }
}

const cssFiles = fs
  .readdirSync(publicAssets)
  .filter((f) => f.endsWith(".css"));
if (!cssFiles.length) {
  console.warn("[sync-ssr-assets] no CSS in public");
  process.exit(0);
}

// Prefer the client-built CSS already in the map if present; else first file
let indexSrc = fs.readFileSync(serverIndex, "utf8");
const preferred =
  cssFiles.find((f) => indexSrc.includes(`/assets/${f}`)) ?? cssFiles[0];
const preferredHref = `/assets/${preferred}`;
console.log("[sync-ssr-assets] preferred css:", preferredHref);

// Register any public CSS missing from the virtual map
function assetMeta(filePath, publicPath) {
  const buf = fs.readFileSync(filePath);
  const etag = crypto.createHash("sha1").update(buf).digest("base64url");
  const mtime = fs.statSync(filePath).mtime.toISOString();
  return `  "${publicPath}": {
    "type": "text/css; charset=utf-8",
    "etag": "\\"${buf.length.toString(16)}-${etag.slice(0, 27)}\\"",
    "mtime": "${mtime}",
    "size": ${buf.length},
    "path": "../public/assets/${path.basename(filePath)}"
  }`;
}

for (const name of cssFiles) {
  const href = `/assets/${name}`;
  if (indexSrc.includes(`"${href}"`)) continue;
  const entry = assetMeta(path.join(publicAssets, name), href);
  indexSrc = indexSrc.replace(
    /(var public_assets_data_default = \{)([\s\S]*?)(\n\};)/,
    (m, open, body, close) => {
      const needsComma = body.trim().length > 0 && !body.trimEnd().endsWith(",");
      return `${open}${body}${needsComma ? "," : ""}\n${entry}${close}`;
    },
  );
  console.log("[sync-ssr-assets] registered", href);
}
fs.writeFileSync(serverIndex, indexSrc);

// Rewrite SSR module hrefs to preferred (registered) css
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(mjs|js)$/.test(name)) continue;
    if (full === serverIndex) continue;
    let src = fs.readFileSync(full, "utf8");
    const next = src.replace(
      /\/assets\/styles-[A-Za-z0-9_-]+\.css/g,
      preferredHref,
    );
    if (next !== src) {
      fs.writeFileSync(full, next);
      console.log("[sync-ssr-assets] patched", path.relative(root, full));
    }
  }
}
walk(serverDir);

console.log(
  "[sync-ssr-assets] done — css:",
  cssFiles.join(", "),
);
