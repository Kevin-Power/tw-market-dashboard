#!/usr/bin/env node
/**
 * Smoke-check a running instance (dev or Render).
 * Usage: node scripts/verify-deploy.mjs [baseUrl]
 */
const base = (process.argv[2] || "http://127.0.0.1:8080").replace(/\/$/, "");

async function check(path, expect = 200) {
  const url = `${base}${path}`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, { redirect: "follow" });
    const ms = Date.now() - t0;
    const ct = res.headers.get("content-type") || "";
    let extra = "";
    if (ct.includes("json")) {
      const j = await res.json();
      extra = j.ok != null ? ` ok=${j.ok}` : j.asOf ? ` asOf=${j.asOf}` : "";
      if (j.error) extra += ` err=${j.error}`;
    } else {
      const buf = await res.arrayBuffer();
      extra = ` bytes=${buf.byteLength}`;
    }
    const pass = res.status === expect;
    console.log(`${pass ? "✓" : "✗"} ${res.status} ${path} (${ms}ms)${extra}`);
    return pass;
  } catch (e) {
    console.log(`✗ ERR ${path} ${e.message}`);
    return false;
  }
}

const paths = [
  ["/", 200],
  ["/api/health", 200],
  ["/api/market", 200],
  ["/api/export?format=xlsx", 200],
  ["/api/export?format=summary", 200],
  ["/api/export?format=html", 200],
  ["/api/export?format=json", 200],
  ["/api/export?format=csv-bundle", 200],
];

let ok = 0;
for (const [p, s] of paths) {
  if (await check(p, s)) ok++;
}
console.log(`\n${ok}/${paths.length} checks passed @ ${base}`);
process.exit(ok === paths.length ? 0 : 1);
