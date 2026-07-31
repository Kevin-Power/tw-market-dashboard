import { createFileRoute } from "@tanstack/react-router";
import {
  getMarketSnapshot,
  saveMarketSnapshot,
} from "@/lib/market.server";
import type { MarketData } from "@/data/types";
import { parseMarketData } from "@/lib/market-schema";

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Market-Token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data: unknown, init: ResponseInit = {}, request?: Request) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (request) {
    for (const [k, v] of Object.entries(corsHeaders(request))) {
      headers.set(k, v);
    }
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

/**
 * Write protection for POST /api/market.
 * - No MARKET_UPDATE_TOKEN → open (demo / internal)
 * - Matching X-Market-Token / Bearer → allowed (GAS, cron)
 * - Same-origin browser (看板「每日更新」) → allowed without embedding secret in client
 */
function authorizeWrite(request: Request): boolean {
  const token = process.env.MARKET_UPDATE_TOKEN?.trim();
  if (!token) return true;

  const header =
    request.headers.get("X-Market-Token") ||
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (header === token) return true;

  if (request.headers.get("Sec-Fetch-Site") === "same-origin") return true;

  const origin = request.headers.get("Origin");
  const host = request.headers.get("Host") || request.headers.get("X-Forwarded-Host");
  if (origin && host) {
    try {
      const o = new URL(origin);
      const hostOnly = host.split(",")[0]!.trim().split(":")[0];
      const originHost = o.hostname;
      if (originHost === hostOnly || o.host === host.trim()) return true;
    } catch {
      /* ignore */
    }
  }

  return false;
}

export const Route = createFileRoute("/api/market")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),

      GET: async ({ request }) => {
        try {
          const snap = await getMarketSnapshot();
          return json(
            {
              ...snap.data,
              _meta: {
                source: snap.source,
                updatedAt: snap.updatedAt,
                daily: true,
                highCount: snap.data.highs.stocks.length,
                lowCount: snap.data.lows.lows.length,
                db: process.env.DATABASE_URL ? "neon" : "pglite",
              },
            },
            {
              headers: {
                "Cache-Control":
                  "public, max-age=30, stale-while-revalidate=120",
              },
            },
            request,
          );
        } catch (err) {
          console.error("[api/market] GET failed", err);
          return json(
            { error: "failed_to_load_market" },
            { status: 500 },
            request,
          );
        }
      },

      POST: async ({ request }) => {
        if (!authorizeWrite(request)) {
          return json(
            {
              error: "unauthorized",
              hint: "請帶 X-Market-Token，或使用看板同源上傳",
            },
            { status: 401 },
            request,
          );
        }
        try {
          const body = (await request.json()) as
            | MarketData
            | { data: MarketData; source?: string };
          const raw =
            body && typeof body === "object" && "data" in body && body.data
              ? body.data
              : (body as MarketData);
          const source =
            body &&
            typeof body === "object" &&
            "source" in body &&
            body.source
              ? String(body.source)
              : "api";

          const checked = parseMarketData(raw);
          if (!checked.ok) {
            return json(
              {
                error: "invalid_payload",
                hint: checked.error,
                issues: checked.issues,
              },
              { status: 400 },
              request,
            );
          }

          const snap = await saveMarketSnapshot(checked.data, source);
          return json(
            {
              ok: true,
              asOf: snap.data.asOf,
              source: snap.source,
              updatedAt: snap.updatedAt,
              counts: {
                highs: snap.data.highs.stocks.length,
                lows: snap.data.lows.lows.length,
                holdings: snap.data.lows.holdings.length,
                foreignBuy: snap.data.foreign.foreignBuy.length,
                cont: snap.data.foreign.contStocks.length,
              },
            },
            { status: 200 },
            request,
          );
        } catch (err) {
          console.error("[api/market] POST failed", err);
          return json(
            {
              error: "save_failed",
              hint: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
            request,
          );
        }
      },
    },
  },
});
