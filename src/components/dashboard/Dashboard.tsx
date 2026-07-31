import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
} from "lucide-react";
import type { MarketApiResponse, MarketData } from "@/data/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCards } from "./KpiCards";
import { HighsChart } from "./HighsChart";
import { FlowTable } from "./FlowTable";
import { HighsTable } from "./HighsTable";
import { LowsTable } from "./LowsTable";
import { HoldingsTable } from "./HoldingsTable";
import { GasGuide } from "./GasGuide";
import { DailyUpload } from "./DailyUpload";
import { DownloadCenter } from "./DownloadCenter";
import { MarketBriefing } from "./MarketBriefing";
import { AutoFetch } from "./AutoFetch";
import { SetupWizard } from "./SetupWizard";
import {
  downloadClientPack,
  downloadMarket,
  openHtmlReport,
} from "@/lib/export-market";

type Props = {
  initial: MarketData;
  initialMeta?: { source: string; updatedAt: string };
};

function stripMeta(raw: MarketApiResponse): {
  data: MarketData;
  source: string;
  updatedAt: string;
} {
  const { _meta, ...rest } = raw;
  return {
    data: rest as MarketData,
    source: _meta?.source ?? "api",
    updatedAt: _meta?.updatedAt ?? new Date().toISOString(),
  };
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const mm = String(tw.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tw.getUTCDate()).padStart(2, "0");
  const hh = String(tw.getUTCHours()).padStart(2, "0");
  const mi = String(tw.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi}`;
}

function sourceLabel(source: string): string {
  if (source === "daily-upload") return "今日上傳";
  if (source === "gas") return "GAS 推送";
  if (source === "twse-live") return "證交所自動";
  if (source === "seed") return "示範資料";
  if (source === "file" || source === "verify-file") return "本機快照";
  if (source === "api" || source === "verify") return "正式資料";
  return source;
}

export function Dashboard({ initial, initialMeta }: Props) {
  const [data, setData] = useState<MarketData>(initial);
  const [source, setSource] = useState(initialMeta?.source ?? "seed");
  const [updatedAt, setUpdatedAt] = useState(
    initialMeta?.updatedAt ?? new Date().toISOString(),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("setup");
  const [menuOpen, setMenuOpen] = useState(false);
  const [packBusy, setPackBusy] = useState(false);

  const apply = useCallback(
    (next: MarketData, meta: { updatedAt: string; source: string }) => {
      setData(next);
      setUpdatedAt(meta.updatedAt);
      setSource(meta.source);
    },
    [],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/market", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as MarketApiResponse;
      const { data: next, source: src, updatedAt: ts } = stripMeta(json);
      apply(next, { source: src, updatedAt: ts });
    } finally {
      setRefreshing(false);
    }
  }, [apply]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void refresh();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-report-menu]")) return;
      setMenuOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <header className="sticky top-0 z-30 border-b border-border/80 bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 flex size-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary shadow-[0_0_24px_-6px_color-mix(in_oklab,var(--color-primary)_55%,transparent)]">
              <Activity className="size-5" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-fg text-display sm:text-[1.35rem]">
                  台股籌碼看板
                </h1>
                <span className="hidden rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-subtle sm:inline">
                  PRO
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">
                請先完成「上線導引」→ 自動籌碼 → 客戶下載
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">
              資料日
              <span className="font-mono text-fg">{data.asOfLabel}</span>
            </span>
            <span className="chip chip-live">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-50" />
                <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
              </span>
              {sourceLabel(source)}
            </span>

            <div className="relative" data-report-menu>
              <button
                type="button"
                className="btn-primary h-9 rounded-full px-3.5 text-xs"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <Download className="size-3.5" />
                客戶報告
                <ChevronDown className="size-3.5 opacity-70" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-surface py-1 shadow-panel">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs text-fg hover:bg-surface-2"
                    onClick={() => {
                      openHtmlReport(data);
                      setMenuOpen(false);
                    }}
                  >
                    <Printer className="size-3.5 text-primary" />
                    HTML 報告 → PDF
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs text-fg hover:bg-surface-2"
                    onClick={() => {
                      downloadMarket(data, "xlsx");
                      setMenuOpen(false);
                    }}
                  >
                    <FileSpreadsheet className="size-3.5 text-primary" />
                    完整 Excel
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs text-fg hover:bg-surface-2"
                    onClick={() => {
                      downloadMarket(data, "summary");
                      setMenuOpen(false);
                    }}
                  >
                    <FileText className="size-3.5 text-primary" />
                    文字摘要
                  </button>
                  <button
                    type="button"
                    disabled={packBusy}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-xs text-fg hover:bg-surface-2 disabled:opacity-50"
                    onClick={() => {
                      setPackBusy(true);
                      void downloadClientPack(data).finally(() => {
                        setPackBusy(false);
                        setMenuOpen(false);
                      });
                    }}
                  >
                    {packBusy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5 text-primary" />
                    )}
                    客戶交付包
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="btn-ghost disabled:opacity-50"
            >
              {refreshing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              <span className="font-mono tabular">
                {formatUpdatedAt(updatedAt)}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <KpiCards data={data} />

        <div className="grid gap-4 lg:grid-cols-5 lg:gap-5">
          <div className="lg:col-span-3">
            <HighsChart data={data} />
          </div>
          <div className="lg:col-span-2">
            <MarketBriefing data={data} sourceLabel={sourceLabel(source)} />
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="fade-in stagger-4">
          <TabsList>
            <TabsTrigger value="setup">① 上線導引</TabsTrigger>
            <TabsTrigger value="upload">② 每日更新</TabsTrigger>
            <TabsTrigger value="foreign">外資籌碼</TabsTrigger>
            <TabsTrigger value="trust">投信籌碼</TabsTrigger>
            <TabsTrigger value="highs">一年新高</TabsTrigger>
            <TabsTrigger value="lows">一年新低</TabsTrigger>
            <TabsTrigger value="0050">0050</TabsTrigger>
            <TabsTrigger value="download">下載中心</TabsTrigger>
            <TabsTrigger value="gas">部署細節</TabsTrigger>
          </TabsList>

          <TabsContent value="setup">
            <SetupWizard />
          </TabsContent>

          <TabsContent value="upload">
            <div className="space-y-4">
              <AutoFetch onUpdated={apply} />
              <DailyUpload onUpdated={apply} />
            </div>
          </TabsContent>

          <TabsContent value="foreign">
            <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
              <FlowTable
                title="外資買超前 30 名"
                rows={data.foreign.foreignBuy}
                mode="buy"
                asOf={data.asOf}
              />
              <FlowTable
                title="外資賣超前 30 名"
                rows={data.foreign.foreignSell}
                mode="sell"
                asOf={data.asOf}
              />
            </div>
          </TabsContent>

          <TabsContent value="trust">
            <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
              <FlowTable
                title="投信買超前 30 名"
                rows={data.foreign.trustBuy}
                mode="buy"
                asOf={data.asOf}
              />
              <FlowTable
                title="投信賣超前 30 名"
                rows={data.foreign.trustSell}
                mode="sell"
                asOf={data.asOf}
              />
            </div>
          </TabsContent>

          <TabsContent value="highs">
            <HighsTable stocks={data.highs.stocks} asOf={data.asOf} />
          </TabsContent>

          <TabsContent value="lows">
            <LowsTable stocks={data.lows.lows} asOf={data.asOf} />
          </TabsContent>

          <TabsContent value="0050">
            <HoldingsTable holdings={data.lows.holdings} asOf={data.asOf} />
          </TabsContent>

          <TabsContent value="download">
            <DownloadCenter data={data} />
          </TabsContent>

          <TabsContent value="gas">
            <GasGuide />
          </TabsContent>
        </Tabs>

        <footer className="border-t border-border pt-8 pb-10 text-center">
          <p className="text-xs text-subtle">
            資料日{" "}
            <span className="font-mono text-muted">{data.asOfLabel}</span>
            {" · "}
            {sourceLabel(source)}
            {" · "}非投資建議
          </p>
        </footer>
      </main>
    </div>
  );
}
