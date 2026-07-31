import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import seed from "@/data/market.json";
import type { MarketData } from "@/data/types";
import { Dashboard } from "@/components/dashboard/Dashboard";

const loadMarket = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getMarketSnapshot } = await import("@/lib/market.server");
    const snap = await getMarketSnapshot();
    return {
      data: snap.data,
      source: snap.source,
      updatedAt: snap.updatedAt,
    };
  } catch (err) {
    console.error("[loadMarket] fallback to seed", err);
    return {
      data: seed as MarketData,
      source: "seed",
      updatedAt: new Date().toISOString(),
    };
  }
});

export const Route = createFileRoute("/")({
  loader: () => loadMarket(),
  component: HomePage,
});

function HomePage() {
  const { data, source, updatedAt } = Route.useLoaderData();
  return (
    <Dashboard
      initial={data}
      initialMeta={{ source, updatedAt }}
    />
  );
}
