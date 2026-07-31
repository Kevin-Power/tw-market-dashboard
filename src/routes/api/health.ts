import { createFileRoute } from "@tanstack/react-router";
import {
  getMarketSnapshot,
  marketStorageMode,
} from "@/lib/market.server";

/**
 * Lightweight health for Render / load balancers.
 * GET /api/health → 200 when market snapshot is readable.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        try {
          const snap = await getMarketSnapshot();
          return Response.json(
            {
              ok: true,
              service: "tw-market-dashboard",
              version: "1.0.0",
              asOf: snap.data.asOf,
              asOfLabel: snap.data.asOfLabel,
              source: snap.source,
              storage: snap.storage ?? marketStorageMode(),
              counts: {
                highs: snap.data.highs.stocks.length,
                lows: snap.data.lows.lows.length,
                holdings: snap.data.lows.holdings.length,
              },
              ms: Date.now() - started,
              ts: new Date().toISOString(),
            },
            {
              status: 200,
              headers: {
                "Cache-Control": "no-store",
                "X-Market-AsOf": snap.data.asOf,
                "X-Market-Storage": snap.storage ?? marketStorageMode(),
              },
            },
          );
        } catch (err) {
          console.error("[api/health]", err);
          return Response.json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
              storage: marketStorageMode(),
              ms: Date.now() - started,
            },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
