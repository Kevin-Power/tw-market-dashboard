import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import type { LowStock } from "@/data/types";
import { cn, formatNum, formatPct } from "@/lib/utils";
import { downloadArtifact, withBom } from "@/lib/export-market";

type Props = { stocks: LowStock[]; asOf?: string };

export function LowsTable({ stocks, asOf }: Props) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return stocks;
    return stocks.filter(
      (s) =>
        s.code.toLowerCase().includes(t) ||
        s.name.toLowerCase().includes(t),
    );
  }, [stocks, q]);

  function exportCsv() {
    const stamp = (asOf || "export").replace(/-/g, "");
    const src = filtered;
    const lines = [
      ["代號", "名稱", "成交", "漲跌幅%", "歷史高點", "距高點%", "歷史低點", "距低點%"],
      ...src.map((s) => [
        s.code,
        s.name,
        s.price,
        s.changePct ?? "",
        s.histHigh ?? "",
        s.fromHistHigh ?? "",
        s.histLow ?? "",
        s.fromHistLow ?? "",
      ]),
    ]
      .map((row) =>
        row
          .map((c) => {
            const s = String(c ?? "");
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      )
      .join("\r\n");
    downloadArtifact({
      filename: `一年新低_${stamp}.csv`,
      mime: "text/csv; charset=utf-8",
      body: withBom(lines),
    });
  }

  return (
    <div className="table-shell">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="section-label">New lows</p>
          <h3 className="mt-1 text-sm font-semibold tracking-tight text-fg">
            創一年／240 日新低
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            顯示 {filtered.length} / {stocks.length} 檔
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <label className="relative block w-full sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜尋代號或名稱"
              className="h-11 w-full rounded-xl border border-border bg-surface-2 pr-3 pl-10 text-sm text-fg placeholder:text-subtle transition-[border-color,box-shadow] focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <button
            type="button"
            className="btn-ghost h-11 shrink-0 rounded-xl px-3 text-xs"
            onClick={exportCsv}
          >
            <Download className="size-3.5" />
            CSV
          </button>
        </div>
      </div>
      <div className="max-h-[520px] overflow-auto scrollbar-thin">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="table-head sticky top-0 z-10 text-xs text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">代號</th>
              <th className="px-3 py-3 font-medium">名稱</th>
              <th className="px-3 py-3 text-right font-medium">成交</th>
              <th className="px-3 py-3 text-right font-medium">漲跌幅</th>
              <th className="px-3 py-3 text-right font-medium">歷史高點</th>
              <th className="px-3 py-3 text-right font-medium">距高點</th>
              <th className="px-3 py-3 text-right font-medium">歷史低點</th>
              <th className="px-5 py-3 text-right font-medium">距低點</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.code} className="data-row">
                <td className="px-5 py-3 font-mono text-xs text-muted">
                  {s.code}
                </td>
                <td className="px-3 py-3 font-medium text-fg">{s.name}</td>
                <td className="px-3 py-3 text-right tabular">
                  {formatNum(s.price, 2)}
                </td>
                <td
                  className={cn(
                    "px-3 py-3 text-right font-medium tabular",
                    (s.changePct ?? 0) > 0
                      ? "text-up"
                      : (s.changePct ?? 0) < 0
                        ? "text-down"
                        : "text-muted",
                  )}
                >
                  {formatPct(s.changePct)}
                </td>
                <td className="px-3 py-3 text-right tabular text-muted">
                  {formatNum(s.histHigh, 2)}
                </td>
                <td className="px-3 py-3 text-right tabular text-down">
                  {s.fromHistHigh != null
                    ? `${s.fromHistHigh.toFixed(1)}%`
                    : "—"}
                </td>
                <td className="px-3 py-3 text-right tabular text-muted">
                  {formatNum(s.histLow, 2)}
                </td>
                <td className="px-5 py-3 text-right tabular text-up">
                  {s.fromHistLow != null
                    ? `+${s.fromHistLow.toFixed(2)}%`
                    : "—"}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-12 text-center text-sm text-muted"
                >
                  沒有符合的標的
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
