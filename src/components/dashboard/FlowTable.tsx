import { Download } from "lucide-react";
import type { FlowRow } from "@/data/types";
import { cn, formatNum, formatSigned } from "@/lib/utils";
import { downloadArtifact, withBom } from "@/lib/export-market";

type Props = {
  title: string;
  rows: FlowRow[];
  mode: "buy" | "sell";
  asOf?: string;
};

function exportCsv(title: string, rows: FlowRow[], asOf?: string) {
  const stamp = (asOf || "export").replace(/-/g, "");
  const lines = [
    ["報表", title],
    ["排名", "代號", "名稱", "買進(張)", "賣出(張)", "買賣超(張)"],
    ...rows.map((r) => [r.rank, r.code, r.name, r.buy, r.sell, r.net]),
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
    filename: `${title.replace(/\s+/g, "_")}_${stamp}.csv`,
    mime: "text/csv; charset=utf-8",
    body: withBom(lines),
  });
}

export function FlowTable({ title, rows, mode, asOf }: Props) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.net)), 1);

  return (
    <div className="table-shell">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-fg">
            {title}
          </h3>
          <p className="mt-0.5 text-[11px] text-subtle">
            單位：張 · 前 {rows.length} 名
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-semibold",
              mode === "buy" ? "bg-up/10 text-up" : "bg-down/10 text-down",
            )}
          >
            {mode === "buy" ? "買超" : "賣超"}
          </span>
          <button
            type="button"
            className="btn-ghost h-8 rounded-lg px-2.5 text-xs"
            title="下載此表 CSV"
            onClick={() => exportCsv(title, rows, asOf)}
          >
            <Download className="size-3.5" />
            CSV
          </button>
        </div>
      </div>
      <div className="max-h-[440px] overflow-auto scrollbar-thin">
        <table className="w-full min-w-[340px] text-left text-sm">
          <thead className="table-head sticky top-0 z-10 text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-3 py-3 font-medium">代號</th>
              <th className="px-3 py-3 font-medium">名稱</th>
              <th className="hidden px-3 py-3 text-right font-medium sm:table-cell">
                買進
              </th>
              <th className="hidden px-3 py-3 text-right font-medium sm:table-cell">
                賣出
              </th>
              <th className="px-4 py-3 text-right font-medium">
                {mode === "buy" ? "買超" : "賣超"}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const width = Math.max(6, (Math.abs(r.net) / maxAbs) * 100);
              return (
                <tr key={`${r.code}-${r.rank}`} className="data-row">
                  <td className="px-4 py-3 text-subtle tabular">
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-md text-[11px] font-medium",
                        i < 3
                          ? "bg-primary/12 text-primary"
                          : "bg-surface-2 text-subtle",
                      )}
                    >
                      {r.rank}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-muted">
                    {r.code}
                  </td>
                  <td className="px-3 py-3 font-medium text-fg">{r.name}</td>
                  <td className="hidden px-3 py-3 text-right tabular text-muted sm:table-cell">
                    {formatNum(r.buy)}
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular text-muted sm:table-cell">
                    {formatNum(r.sell)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div
                      className={cn(
                        "font-semibold tabular",
                        r.net >= 0 ? "text-up" : "text-down",
                      )}
                    >
                      {formatSigned(r.net)}
                    </div>
                    <div className="mt-1.5 ml-auto h-1 w-16 overflow-hidden rounded-full bg-surface-3 sm:w-20">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          r.net >= 0 ? "bg-up/70" : "bg-down/70",
                        )}
                        style={{ width: `${width}%` }}
                      />
                    </div>
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
