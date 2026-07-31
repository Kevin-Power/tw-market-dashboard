import { Download } from "lucide-react";
import type { Holding } from "@/data/types";
import { cn, formatNum } from "@/lib/utils";
import { downloadArtifact, withBom } from "@/lib/export-market";

type Props = { holdings: Holding[]; asOf?: string };

export function HoldingsTable({ holdings, asOf }: Props) {
  const maxW = Math.max(...holdings.map((h) => h.weight), 1);
  const top3 = holdings.slice(0, 3).reduce((s, h) => s + h.weight, 0);

  function exportCsv() {
    const stamp = (asOf || "export").replace(/-/g, "");
    const lines = [
      ["序", "股票", "持股(千股)", "權重%", "增減"],
      ...holdings.map((h, i) => [i + 1, h.name, h.sharesK, h.weight, h.change ?? ""]),
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
      filename: `0050持股_${stamp}.csv`,
      mime: "text/csv; charset=utf-8",
      body: withBom(lines),
    });
  }

  return (
    <div className="table-shell">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="section-label">0050</p>
          <h3 className="mt-1 text-sm font-semibold tracking-tight text-fg">
            元大台灣 50 持股明細
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            前三大權重合計 {top3.toFixed(1)}% · 共 {holdings.length} 檔
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost h-8 rounded-lg px-2.5 text-xs"
          onClick={exportCsv}
        >
          <Download className="size-3.5" />
          CSV
        </button>
      </div>
      <div className="max-h-[520px] overflow-auto scrollbar-thin">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="table-head sticky top-0 z-10 text-xs text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">#</th>
              <th className="px-3 py-3 font-medium">股票</th>
              <th className="px-3 py-3 text-right font-medium">持股(千股)</th>
              <th className="px-3 py-3 font-medium">權重</th>
              <th className="px-3 py-3 text-right font-medium">權重%</th>
              <th className="px-5 py-3 text-right font-medium">增減</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h, i) => {
              const ch =
                typeof h.change === "number"
                  ? h.change
                  : h.change === "N/A"
                    ? null
                    : Number(h.change);
              return (
                <tr key={h.name} className="data-row">
                  <td className="px-5 py-3 text-subtle tabular">
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-md text-[11px] font-medium",
                        i < 3 ? "bg-primary/12 text-primary" : "text-subtle",
                      )}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-medium text-fg">{h.name}</td>
                  <td className="px-3 py-3 text-right tabular text-muted">
                    {formatNum(h.sharesK)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${(h.weight / maxW) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-medium tabular text-fg">
                    {h.weight.toFixed(2)}%
                  </td>
                  <td
                    className={cn(
                      "px-5 py-3 text-right tabular",
                      ch == null
                        ? "text-muted"
                        : ch > 0
                          ? "text-up"
                          : ch < 0
                            ? "text-down"
                            : "text-muted",
                    )}
                  >
                    {ch == null
                      ? "N/A"
                      : ch === 0
                        ? "0"
                        : ch > 0
                          ? `+${ch.toFixed(4)}`
                          : ch.toFixed(4)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
