import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Link2,
  Loader2,
  Mail,
  Package,
  Printer,
  ShieldCheck,
} from "lucide-react";
import type { MarketData } from "@/data/types";
import { computeInsights } from "@/lib/market-insights";
import {
  downloadAllCsvs,
  downloadClientPack,
  downloadMarket,
  openHtmlReport,
  type ExportFormat,
} from "@/lib/export-market";
import { formatSigned } from "@/lib/utils";

type Props = { data: MarketData };

const PACKS: {
  id: ExportFormat | "csv-all" | "client-pack" | "print-html";
  title: string;
  desc: string;
  ext: string;
  icon: typeof FileSpreadsheet;
  primary?: boolean;
}[] = [
  {
    id: "xlsx",
    title: "完整 Excel 研究包",
    desc: "11 工作表：封面、研究摘要、籌碼四表、同時買進、新高新低、0050、走勢",
    ext: ".xlsx",
    icon: FileSpreadsheet,
    primary: true,
  },
  {
    id: "print-html",
    title: "客戶 HTML 報告 / PDF",
    desc: "開新視窗預覽，一鍵列印或另存 PDF，適合寄給客戶",
    ext: "PDF",
    icon: Printer,
  },
  {
    id: "html",
    title: "HTML 報告檔",
    desc: "下載離線 HTML，客戶本機開啟即可閱讀／列印",
    ext: ".html",
    icon: FileText,
  },
  {
    id: "html-email",
    title: "郵件 HTML 稿",
    desc: "適合貼進 Gmail／Outlook 的精簡日報版型",
    ext: ".html",
    icon: Mail,
  },
  {
    id: "summary",
    title: "市場摘要日報",
    desc: "純文字研究簡報，可轉傳 LINE／郵件",
    ext: ".txt",
    icon: FileText,
  },
  {
    id: "csv-bundle",
    title: "籌碼精選 CSV",
    desc: "外資／投信 Top10 + 創新高 + 同時買進，Excel 直接開",
    ext: ".csv",
    icon: FileSpreadsheet,
  },
  {
    id: "csv-all",
    title: "全部分表 CSV",
    desc: "一次下載 7 個 CSV（買賣超、新高新低、0050）",
    ext: "×7",
    icon: Package,
  },
  {
    id: "client-pack",
    title: "一鍵客戶交付包",
    desc: "Excel + 文字摘要 + HTML 報告 + 精選 CSV，一次備齊",
    ext: "×4",
    icon: Package,
    primary: true,
  },
  {
    id: "json",
    title: "JSON + 研究指標",
    desc: "完整資料結構附 _insights，供系統串接",
    ext: ".json",
    icon: FileJson,
  },
];

export function DownloadCenter({ data }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const ins = useMemo(() => computeInsights(data), [data]);

  const stamp = data.asOf.replace(/-/g, "");
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const docId = `TWFLOW-${stamp}`;

  async function run(id: string) {
    setBusy(id);
    setDone(null);
    try {
      if (id === "csv-all") {
        const n = await downloadAllCsvs(data);
        setDone(`已下載 ${n} 個 CSV 檔`);
      } else if (id === "client-pack") {
        const n = await downloadClientPack(data);
        setDone(`客戶交付包已開始下載（${n} 個檔案）`);
      } else if (id === "print-html") {
        openHtmlReport(data);
        setDone("已開啟客戶報告視窗，可列印或另存 PDF");
      } else {
        downloadMarket(data, id as ExportFormat);
        setDone("已開始下載");
      }
    } catch (e) {
      setDone(e instanceof Error ? e.message : "下載失敗");
    } finally {
      setBusy(null);
      setTimeout(() => setDone(null), 4000);
    }
  }

  async function copyLink(format: string) {
    const url = `${origin}/api/export?format=${format}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(format);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
              <Download className="size-5" strokeWidth={1.75} />
            </div>
            <div>
              <p className="section-label">Client deliverables</p>
              <h3 className="mt-1 text-lg font-semibold tracking-tight text-fg text-display">
                客戶下載中心
              </h3>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
                依資料日{" "}
                <span className="font-mono text-fg">{data.asOfLabel}</span>{" "}
                產出研究級交付物。文件編號{" "}
                <span className="font-mono text-primary">{docId}</span>
                。Excel 含封面與方法論；HTML 可直接轉 PDF。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={busy === "client-pack"}
              onClick={() => void run("client-pack")}
            >
              {busy === "client-pack" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Package className="size-4" />
              )}
              一鍵交付包
            </button>
            <button
              type="button"
              className="btn-ghost h-11 rounded-xl px-4"
              disabled={busy === "xlsx"}
              onClick={() => void run("xlsx")}
            >
              {busy === "xlsx" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="size-4" />
              )}
              Excel
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { l: "創新高", v: String(ins.highCount) },
            { l: "創新低", v: String(ins.lowCount) },
            { l: "同時買進", v: String(ins.contCount) },
            {
              l: "外資前30淨額",
              v: formatSigned(ins.foreignNetTop),
            },
          ].map((k) => (
            <div
              key={k.l}
              className="rounded-xl border border-border bg-surface-2/50 px-3 py-2.5"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
                {k.l}
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold tabular text-fg">
                {k.v}
              </div>
            </div>
          ))}
        </div>

        {done && (
          <div className="mt-4 rounded-xl border border-down/25 bg-down/10 px-3 py-2 text-sm text-down">
            {done}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PACKS.map((p) => {
          const Icon = p.icon;
          const isBusy = busy === p.id;
          return (
            <div
              key={p.id}
              className={`panel flex flex-col gap-4 p-5 transition-colors ${
                p.primary ? "border-primary/25" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`flex size-10 items-center justify-center rounded-xl border ${
                    p.primary
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-surface-2 text-muted"
                  }`}
                >
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-subtle">
                  {p.ext}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold text-fg">{p.title}</h4>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {p.desc}
                </p>
                <p className="mt-2 font-mono text-[11px] text-subtle">
                  {p.id === "print-html"
                    ? "瀏覽器列印"
                    : `台股籌碼…_${stamp}${p.ext.startsWith("×") || p.ext === "PDF" ? "" : p.ext}`}
                </p>
              </div>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void run(p.id)}
                className={
                  p.primary
                    ? "btn-primary h-10 w-full text-sm"
                    : "btn-ghost h-10 w-full justify-center rounded-xl"
                }
              >
                {isBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : p.id === "print-html" ? (
                  <Printer className="size-4" />
                ) : (
                  <Download className="size-4" />
                )}
                {p.id === "print-html" ? "預覽" : "下載"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="panel p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-2 text-primary">
            <Link2 className="size-4" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="section-label">Share links</p>
            <h4 className="mt-1 text-sm font-semibold text-fg">
              客戶直連下載 API
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              資料更新後連結內容自動同步，可放進郵件、CRM 或客戶入口。
            </p>
            <div className="mt-3 space-y-2">
              {(
                [
                  ["xlsx", "完整 Excel"],
                  ["html", "HTML 報告"],
                  ["html-email", "郵件 HTML"],
                  ["summary", "文字摘要"],
                  ["csv-bundle", "精選 CSV"],
                  ["json", "JSON"],
                ] as const
              ).map(([fmt, label]) => {
                const href = `${origin}/api/export?format=${fmt}`;
                return (
                  <div
                    key={fmt}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2/50 p-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-fg">{label}</div>
                      <code className="mt-0.5 block truncate font-mono text-[11px] text-subtle">
                        {href || `/api/export?format=${fmt}`}
                      </code>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={`/api/export?format=${fmt}`}
                        className="btn-ghost h-9 rounded-lg px-3 text-xs"
                        download
                      >
                        <Download className="size-3.5" />
                        開啟
                      </a>
                      <button
                        type="button"
                        className="btn-ghost h-9 rounded-lg px-3 text-xs"
                        onClick={() => void copyLink(fmt)}
                      >
                        {copied === fmt ? (
                          <Check className="size-3.5 text-down" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        複製
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border-strong/80 bg-bg/30 px-4 py-3 text-xs leading-relaxed text-subtle">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          檔案內容與看板資料日一致。CSV 含 UTF-8 BOM，Excel
          可直接開啟繁中。買賣超淨額採原始 Excel 欄位。僅供資訊彙整，非投資建議。
        </div>
      </div>
    </div>
  );
}
