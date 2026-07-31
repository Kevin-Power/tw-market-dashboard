import { createFileRoute } from "@tanstack/react-router";
import { buildLatestLiveMarket } from "@/lib/build-live-market";
import { saveMarketSnapshot } from "@/lib/market.server";

/**
 * Daily auto-generate market snapshot from TWSE/TPEx.
 *
 * GET|POST /api/cron/daily?token=...
 * Authorization: Bearer <MARKET_UPDATE_TOKEN|CRON_SECRET>
 * Header X-Market-Token / X-Cron-Secret
 *
 * Query: asOf=YYYY-MM-DD (optional force date)
 *
 * Free Render: point cron-job.org or GAS time trigger here after 15:30 TW.
 */
function authorize(request: Request): boolean {
  const secrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.MARKET_UPDATE_TOKEN?.trim(),
  ].filter(Boolean) as string[];

  // Dev / open: allow if no secrets configured
  if (!secrets.length) return true;

  const url = new URL(request.url);
  const q =
    url.searchParams.get("token") ||
    url.searchParams.get("secret") ||
    "";
  if (q && secrets.includes(q)) return true;

  const header =
    request.headers.get("X-Cron-Secret") ||
    request.headers.get("X-Market-Token") ||
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (header && secrets.includes(header)) return true;

  // same-origin dashboard button
  if (request.headers.get("Sec-Fetch-Site") === "same-origin") return true;

  return false;
}

async function run(request: Request) {
  if (!authorize(request)) {
    return Response.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const asOf = url.searchParams.get("asOf") || undefined;
  const force = url.searchParams.get("force") === "1";

  try {
    // Skip if already have this trading day unless force
    if (!force && !asOf) {
      const { getMarketSnapshot } = await import("@/lib/market.server");
      const cur = await getMarketSnapshot();
      const built = await buildLatestLiveMarket();
      if (cur.data.asOf === built.dateTried && cur.source === "twse-live") {
        return Response.json({
          ok: true,
          skipped: true,
          reason: "already_current",
          asOf: cur.data.asOf,
          source: cur.source,
        });
      }
      const snap = await saveMarketSnapshot(built.data, "twse-live");
      return Response.json({
        ok: true,
        skipped: false,
        asOf: snap.data.asOf,
        source: snap.source,
        storage: snap.storage,
        sources: built.sources,
        warnings: built.warnings,
        counts: {
          highs: built.highCount,
          lows: built.lowCount,
          foreignBuy: snap.data.foreign.foreignBuy.length,
          cont: snap.data.foreign.contStocks.length,
        },
        historyDepth: built.historyDepth,
        updatedAt: snap.updatedAt,
      });
    }

    const built = await buildLatestLiveMarket({ asOf });
    const snap = await saveMarketSnapshot(built.data, "twse-live");
    return Response.json({
      ok: true,
      skipped: false,
      asOf: snap.data.asOf,
      source: snap.source,
      storage: snap.storage,
      sources: built.sources,
      warnings: built.warnings,
      counts: {
        highs: built.highCount,
        lows: built.lowCount,
        foreignBuy: snap.data.foreign.foreignBuy.length,
        cont: snap.data.foreign.contStocks.length,
      },
      historyDepth: built.historyDepth,
      updatedAt: snap.updatedAt,
    });
  } catch (err) {
    console.error("[cron/daily]", err);
    return Response.json(
      {
        ok: false,
        error: "fetch_failed",
        hint: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}

export const Route = createFileRoute("/api/cron/daily")({
  server: {
    handlers: {
      GET: async ({ request }) => run(request),
      POST: async ({ request }) => run(request),
    },
  },
});
