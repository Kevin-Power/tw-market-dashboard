import { createFileRoute } from "@tanstack/react-router";
import { dbSource } from "@/lib/db";
import { getMarketSnapshot } from "@/lib/market.server";

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
              asOf: snap.data.asOf,
              source: snap.source,
              db: dbSource,
              ms: Date.now() - started,
              ts: new Date().toISOString(),
            },
            {
              status: 200,
              headers: {
                "Cache-Control": "no-store",
                "X-Market-AsOf": snap.data.asOf,
              },
            },
          );
        } catch (err) {
          console.error("[api/health]", err);
          return Response.json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
              db: dbSource,
              ms: Date.now() - started,
            },
            { status: 503, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
