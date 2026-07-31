import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  FileCode2,
  Flame,
  Landmark,
  Printer,
  Snowflake,
  Sparkles,
  Thermometer,
} from "lucide-react";
import type { MarketData } from "@/data/types";
import { computeInsights } from "@/lib/market-insights";
import { formatNum, formatSigned } from "@/lib/utils";
import { downloadMarket, openHtmlReport } from "@/lib/export-market";

type Props = {
  data: MarketData;
  sourceLabel: string;
};

export function MarketBriefing({ data, sourceLabel }: Props) {
  const ins = computeInsights(data);
  const fb = ins.topForeignBuy;
  const tb = ins.topTrustBuy;
  const TempIcon =
    ins.temperature === "hot"
      ? Flame
      : ins.temperature === "cold"
        ? Snowflake
        : Thermometer;

  const bullets = [
    {
      icon: ArrowUpRight,
      tone: "up" as const,
      title: `創新高 ${ins.highCount} 檔`,
      body:
        data.highs.stocks.map((s) => s.name).join("、") ||
        "今日無創新高標的",
      meta:
        ins.seriesDelta == null
          ? undefined
          : ins.seriesDelta === 0
            ? "家數持平"
            : ins.seriesDelta > 0
              ? `家數 +${ins.seriesDelta}`
              : `家數 ${ins.seriesDelta}`,
    },
    {
      icon: ArrowDownRight,
      tone: "down" as const,
      title: `創新低 ${ins.lowCount} 檔`,
      body: `新高／新低比 ${ins.highLowRatio ?? "—"} · 近5日新高均 ${ins.seriesAvg5 != null ? ins.seriesAvg5.toFixed(1) : "—"} 檔`,
    },
    {
      icon: Landmark,
      tone: "info" as const,
      title: fb ? `外資買超冠軍 · ${fb.name}` : "外資買超冠軍",
      body: fb
        ? `${fb.code}　${formatSigned(fb.net)} 張（買 ${formatNum(fb.buy)}／賣 ${formatNum(fb.sell)}）· 前30淨額 ${formatSigned(ins.foreignNetTop)} 張`
        : "無資料",
    },
    {
      icon: Building2,
      tone: "warn" as const,
      title: tb ? `投信買超冠軍 · ${tb.name}` : "投信買超冠軍",
      body: tb
        ? `${tb.code}　${formatSigned(tb.net)} 張（買 ${formatNum(tb.buy)}／賣 ${formatNum(tb.sell)}）· 前30淨額 ${formatSigned(ins.trustNetTop)} 張`
        : "無資料",
    },
    {
      icon: FileCode2,
      tone: "primary" as const,
      title: `外資／投信同時買進 ${ins.contCount} 檔`,
      body: data.foreign.contStocks.length
        ? data.foreign.contStocks.slice(0, 10).join("、") +
          (data.foreign.contStocks.length > 10
            ? ` 等 ${data.foreign.contStocks.length} 檔`
            : "")
        : "今日無同時買進名單",
    },
  ];

  const tempCls =
    ins.temperature === "hot"
      ? "border-up/30 bg-up/10 text-up"
      : ins.temperature === "cold"
        ? "border-info/30 bg-info/10 text-info"
        : "border-primary/25 bg-primary/10 text-primary";

  return (
    <div className="panel fade-in stagger-3 flex h-full flex-col gap-4 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-label">Daily briefing</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-fg text-display">
            機構籌碼簡報
          </h2>
          <p className="mt-1 text-xs text-muted">
            {data.asOfLabel} · {sourceLabel}
          </p>
        </div>
        <span className="hidden items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary sm:inline-flex">
          <Sparkles className="size-3" />
          Research
        </span>
      </div>

      <div
        className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${tempCls}`}
      >
        <TempIcon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
        <div className="min-w-0">
          <div className="text-sm font-semibold">
            市場溫度 · {ins.temperatureLabel}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed opacity-90">
            {ins.temperatureNote} {ins.flowHeadline}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-gradient-to-br from-surface-2/80 to-surface/40 px-4 py-3">
        <div className="section-label">0050 最大權重</div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-base font-semibold text-fg">
            {ins.top1Name}
          </span>
          <span className="font-mono text-lg font-semibold tabular text-primary">
            {ins.top1Weight.toFixed(2)}%
          </span>
        </div>
        <div className="mt-1 text-xs text-subtle">
          前十大合計 {ins.top10Weight}% · 持股 {ins.holdingsCount} 檔
        </div>
      </div>

      <div>
        <div className="section-label mb-2">研究要點</div>
        <ol className="space-y-1.5 text-xs leading-relaxed text-muted">
          {ins.researchNotes.slice(0, 4).map((n, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-mono text-[10px] text-subtle tabular">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{n}</span>
            </li>
          ))}
        </ol>
      </div>

      <ul className="space-y-2.5 text-sm">
        {bullets.map((b) => {
          const Icon = b.icon;
          const toneCls =
            b.tone === "up"
              ? "bg-up/10 text-up"
              : b.tone === "down"
                ? "bg-down/10 text-down"
                : b.tone === "warn"
                  ? "bg-warn/10 text-warn"
                  : b.tone === "info"
                    ? "bg-info/10 text-info"
                    : "bg-primary/10 text-primary";
          return (
            <li
              key={b.title}
              className="flex gap-3 rounded-2xl border border-border bg-surface-2/40 p-3.5 transition-colors hover:border-border-strong"
            >
              <span
                className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl ${toneCls}`}
              >
                <Icon className="size-4" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{b.title}</span>
                  {b.meta && (
                    <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      {b.meta}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs leading-relaxed text-muted">
                  {b.body}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary h-9 flex-1 rounded-xl px-3 text-xs sm:flex-none"
            onClick={() => openHtmlReport(data)}
          >
            <Printer className="size-3.5" />
            客戶報告 / PDF
          </button>
          <button
            type="button"
            className="btn-ghost h-9 flex-1 justify-center rounded-xl text-xs sm:flex-none"
            onClick={() => downloadMarket(data, "xlsx")}
          >
            下載 Excel
          </button>
        </div>
        <div className="rounded-2xl border border-dashed border-border-strong/80 bg-bg/30 p-3.5 text-xs leading-relaxed text-subtle">
          單位：張。完整交付物請至「下載中心」匯出 Excel／HTML／郵件稿。
        </div>
      </div>
    </div>
  );
}
