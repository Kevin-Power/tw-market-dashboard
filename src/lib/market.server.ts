/**
 * Market snapshot storage:
 * - DATABASE_URL set  → Postgres (Neon / managed) via getSql()
 * - otherwise         → JSON file under data/market-snapshot.json
 *   (Render Free 無外接 DB 時可靠、冷啟動快，不依賴 PGLite WASM)
 */
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { MarketData } from "@/data/types";
import seed from "@/data/market.json";
import {
  normalizeMarketData,
  parseMarketData,
} from "@/lib/market-schema";

export type MarketSnapshot = {
  data: MarketData;
  source: string;
  updatedAt: string;
  storage: "postgres" | "file";
};

type FileEnvelope = {
  payload: MarketData;
  source: string;
  updatedAt: string;
};

const globalRef = globalThis as typeof globalThis & {
  __marketFileCache__?: MarketSnapshot | null;
  __marketFileChain__?: Promise<unknown>;
};

function hasDatabaseUrl(): boolean {
  const u =
    typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;
  return !!(u && u.trim());
}

function seedData(): MarketData {
  const normalized = normalizeMarketData(seed as MarketData);
  const checked = parseMarketData(normalized);
  if (!checked.ok) {
    console.error("[market] seed failed validation", checked.issues);
    return seed as MarketData;
  }
  return checked.data;
}

function dataDir(): string {
  return path.join(process.cwd(), "data");
}

function snapshotPath(): string {
  return path.join(dataDir(), "market-snapshot.json");
}

async function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = globalRef.__marketFileChain__ ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  globalRef.__marketFileChain__ = prev.then(() => gate);
  try {
    await prev.catch(() => undefined);
    return await fn();
  } finally {
    release();
  }
}

async function readFileSnapshot(): Promise<MarketSnapshot | null> {
  if (globalRef.__marketFileCache__) return globalRef.__marketFileCache__;
  try {
    const raw = await readFile(snapshotPath(), "utf8");
    const env = JSON.parse(raw) as FileEnvelope;
    const checked = parseMarketData(env.payload);
    if (!checked.ok) {
      console.error("[market] file snapshot invalid", checked.issues);
      return null;
    }
    const snap: MarketSnapshot = {
      data: checked.data,
      source: env.source || "file",
      updatedAt: env.updatedAt || new Date().toISOString(),
      storage: "file",
    };
    globalRef.__marketFileCache__ = snap;
    return snap;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      console.error("[market] read file failed", err);
    }
    return null;
  }
}

async function writeFileSnapshot(
  data: MarketData,
  source: string,
): Promise<MarketSnapshot> {
  const updatedAt = new Date().toISOString();
  const env: FileEnvelope = { payload: data, source, updatedAt };
  await mkdir(dataDir(), { recursive: true });
  const target = snapshotPath();
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(env), "utf8");
  await rename(tmp, target);
  const snap: MarketSnapshot = {
    data,
    source,
    updatedAt,
    storage: "file",
  };
  globalRef.__marketFileCache__ = snap;
  return snap;
}

async function getFromFile(): Promise<MarketSnapshot> {
  return withFileLock(async () => {
    const existing = await readFileSnapshot();
    if (existing) return existing;
    return writeFileSnapshot(seedData(), "seed");
  });
}

async function saveToFile(
  data: MarketData,
  source: string,
): Promise<MarketSnapshot> {
  return withFileLock(() => writeFileSnapshot(data, source));
}

async function getFromPostgres(): Promise<MarketSnapshot> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const rows = await sql.query<{
    payload: MarketData | string;
    source: string;
    updated_at: string | Date;
  }>("select payload, source, updated_at from market_snapshot where id = 1");

  if (rows[0]) {
    let payload: unknown = rows[0].payload;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = null;
      }
    }
    const checked = parseMarketData(payload);
    if (checked.ok) {
      const updatedAt =
        rows[0].updated_at instanceof Date
          ? rows[0].updated_at.toISOString()
          : String(rows[0].updated_at);
      return {
        data: checked.data,
        source: rows[0].source,
        updatedAt,
        storage: "postgres",
      };
    }
    console.error(
      "[market] stored snapshot invalid, reseeding:",
      checked.issues,
    );
  }

  return saveToPostgres(seedData(), "seed");
}

async function saveToPostgres(
  data: MarketData,
  source: string,
): Promise<MarketSnapshot> {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const payload = JSON.stringify(data);
  const rows = await sql.query<{
    source: string;
    updated_at: string | Date;
  }>(
    `insert into market_snapshot (id, as_of, payload, source, updated_at)
     values (1, $1, $2::jsonb, $3, now())
     on conflict (id) do update set
       as_of = excluded.as_of,
       payload = excluded.payload,
       source = excluded.source,
       updated_at = now()
     returning source, updated_at`,
    [data.asOf, payload, source],
  );
  const updatedAt =
    rows[0]?.updated_at instanceof Date
      ? rows[0].updated_at.toISOString()
      : String(rows[0]?.updated_at ?? new Date().toISOString());
  return {
    data,
    source: rows[0]?.source ?? source,
    updatedAt,
    storage: "postgres",
  };
}

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  if (hasDatabaseUrl()) {
    try {
      return await getFromPostgres();
    } catch (err) {
      console.error(
        "[market] postgres failed, falling back to file store",
        err,
      );
      return getFromFile();
    }
  }
  return getFromFile();
}

export async function saveMarketSnapshot(
  data: MarketData,
  source = "upload",
): Promise<MarketSnapshot> {
  const normalized = normalizeMarketData(data);
  const checked = parseMarketData(normalized);
  if (!checked.ok) {
    throw new Error(`invalid market payload: ${checked.error}`);
  }

  if (hasDatabaseUrl()) {
    try {
      return await saveToPostgres(checked.data, source);
    } catch (err) {
      console.error(
        "[market] postgres save failed, writing file store",
        err,
      );
      return saveToFile(checked.data, source);
    }
  }
  return saveToFile(checked.data, source);
}

/** Storage backend label for health / meta */
export function marketStorageMode(): "postgres" | "file" {
  return hasDatabaseUrl() ? "postgres" : "file";
}
