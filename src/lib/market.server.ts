import { getSql } from "@/lib/db";
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
};

function seedData(): MarketData {
  const normalized = normalizeMarketData(seed as MarketData);
  const checked = parseMarketData(normalized);
  if (!checked.ok) {
    console.error("[market] seed failed validation", checked.issues);
    // last resort — return raw seed so preview still works
    return seed as MarketData;
  }
  return checked.data;
}

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
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
      };
    }
    console.error(
      "[market] stored snapshot invalid, reseeding:",
      checked.issues,
    );
  }

  return saveMarketSnapshot(seedData(), "seed");
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

  const sql = await getSql();
  const payload = JSON.stringify(checked.data);
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
    [checked.data.asOf, payload, source],
  );
  const updatedAt =
    rows[0]?.updated_at instanceof Date
      ? rows[0].updated_at.toISOString()
      : String(rows[0]?.updated_at ?? new Date().toISOString());
  return { data: checked.data, source: rows[0]?.source ?? source, updatedAt };
}
