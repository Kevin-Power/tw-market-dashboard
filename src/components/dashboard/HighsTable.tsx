import { Download } from "lucide-react";
import type { HighStock } from "@/data/types";
import { cn, formatNum, formatPct, formatSigned } from "@/lib/utils";
import { downloadArtifact, withBom } from "@/lib/export-market";

type Props = { stocks: HighStock[]; asOf?: string };

export function HighsTable({ stocks, asOf }: Props) {
  function exportCsv() {
    const stamp = (asOf || "export").replace(/-/g, "");
    const lines = [
      ["代號", "名稱", "成交", "漲跌", "漲跌幅%", "成交張數", "金額(百萬)"],
      ...stocks.map((s) => [
        s.code,
        s.name,
        s.price,
        s.change,
        s.changePct,
        s.vol ?? "",
        s.amountM ?? "",
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
      filename: `一年新高_${stamp}.csv`,
      mime: "text/csv; charset=utf-8",
      body: withBom(lines),
    });
  }

  return (
    <div className="table-shell">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="section-label">New highs</p>
          <h3 className="mt-1 text-sm font-semibold tracking-tight text-fg">
            今日創一年新高
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip">
            共 <span className="font-mono text-fg">{stocks.length}</span> 檔
          </span>
          <button
            type="button"
            className="btn-ghost h-8 rounded-lg px-2.5 text-xs"
            onClick={exportCsv}
          >
            <Download className="size-3.5" />
            CSV
          </button>
        </div>
      </div>
      <div className="overflow-auto scrollbar-thin">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="table-head text-xs text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">代號</th>
              <th className="px-3 py-3 font-medium">名稱</th>
              <th className="px-3 py-3 text-right font-medium">成交</th>
              <th className="px-3 py-3 text-right font-medium">漲跌</th>
              <th className="px-3 py-3 text-right font-medium">漲幅</th>
              <th className="px-3 py-3 text-right font-medium">成交張數</th>
              <th className="px-5 py-3 text-right font-medium">金額(百萬)</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((s) => (
              <tr key={s.code} className="data-row">
                <td className="px-5 py-3 font-mono text-xs text-primary/90">
                  {s.code}
                </td>
                <td className="px-3 py-3 font-medium text-fg">{s.name}</td>
                <td className="px-3 py-3 text-right tabular text-fg">
                  {formatNum(s.price, 2)}
                </td>
                <td
                  className={cn(
                    "px-3 py-3 text-right font-medium tabular",
                    s.change > 0
                      ? "text-up"
                      : s.change < 0
                        ? "text-down"
                        : "text-muted",
                  )}
                >
                  {formatSigned(s.change, 2)}
                </td>
                <td
                  className={cn(
                    "px-3 py-3 text-right font-medium tabular",
                    s.changePct > 0
                      ? "text-up"
                      : s.changePct < 0
                        ? "text-down"
                        : "text-muted",
                  )}
                >
                  {formatPct(s.changePct)}
                </td>
                <td className="px-3 py-3 text-right tabular text-muted">
                  {formatNum(s.vol)}
                </td>
                <td className="px-5 py-3 text-right tabular text-muted">
                  {formatNum(s.amountM, 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
