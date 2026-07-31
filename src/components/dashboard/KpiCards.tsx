import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  GitMerge,
  Landmark,
} from "lucide-react";
import type { MarketData } from "@/data/types";
import { computeInsights } from "@/lib/market-insights";
import { formatNum, formatSigned } from "@/lib/utils";

type Props = { data: MarketData };

export function KpiCards({ data }: Props) {
  const ins = computeInsights(data);
  const topForeign = ins.topForeignBuy;
  const topTrust = ins.topTrustBuy;

  const cards = [
    {
      label: "創新高家數",
      value: formatNum(ins.highCount),
      hint:
        ins.seriesDelta == null
          ? "當日清單"
          : ins.seriesDelta === 0
            ? "與前一交易日持平"
            : ins.seriesDelta > 0
              ? `較前一日 +${ins.seriesDelta}`
              : `較前一日 ${ins.seriesDelta}`,
      icon: ArrowUpRight,
      tone: "up" as const,
      accent: "var(--color-up)",
    },
    {
      label: "創新低家數",
      value: formatNum(ins.lowCount),
      hint:
        ins.highLowRatio != null
          ? `新高／新低比 ${ins.highLowRatio}`
          : "創 240 日新低清單",
      icon: ArrowDownRight,
      tone: "down" as const,
      accent: "var(--color-down)",
    },
    {
      label: "外資買超冠軍",
      value: topForeign?.name ?? "—",
      hint: topForeign
        ? `+${formatNum(topForeign.net)} 張 · 前30 ${formatSigned(ins.foreignNetTop)}`
        : "無資料",
      icon: Landmark,
      tone: "info" as const,
      accent: "var(--color-info)",
    },
    {
      label: "投信買超冠軍",
      value: topTrust?.name ?? "—",
      hint: topTrust
        ? `+${formatNum(topTrust.net)} 張 · 前30 ${formatSigned(ins.trustNetTop)}`
        : "無資料",
      icon: Building2,
      tone: "warn" as const,
      accent: "var(--color-warn)",
    },
    {
      label: "同時買進",
      value: formatNum(ins.contCount),
      hint:
        data.foreign.contStocks.slice(0, 2).join("、") ||
        "外資＋投信同向",
      icon: GitMerge,
      tone: "primary" as const,
      accent: "var(--color-primary)",
      desktopOnly: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-4">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <div
            key={c.label}
            className={`kpi-card fade-in stagger-${Math.min(i + 1, 5)}${
              c.desktopOnly ? " max-lg:hidden" : ""
            }`}
            style={{ ["--kpi-accent" as string]: c.accent }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="section-label">{c.label}</span>
              <span
                className={
                  c.tone === "up"
                    ? "rounded-lg bg-up/10 p-2 text-up"
                    : c.tone === "down"
                      ? "rounded-lg bg-down/10 p-2 text-down"
                      : c.tone === "warn"
                        ? "rounded-lg bg-warn/10 p-2 text-warn"
                        : c.tone === "primary"
                          ? "rounded-lg bg-primary/10 p-2 text-primary"
                          : "rounded-lg bg-info/10 p-2 text-info"
                }
              >
                <Icon className="size-4" strokeWidth={1.75} />
              </span>
            </div>
            <div className="min-w-0">
              <div className="truncate text-2xl font-semibold tracking-tight text-fg text-display sm:text-[1.65rem]">
                {c.value}
              </div>
              <div className="mt-1.5 truncate text-xs text-subtle tabular">
                {c.hint}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
