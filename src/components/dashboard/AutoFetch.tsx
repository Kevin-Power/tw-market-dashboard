import { useState } from "react";
import { Loader2, Radar, Sparkles } from "lucide-react";
import type { MarketData } from "@/data/types";

type Props = {
  onUpdated: (
    data: MarketData,
    meta: { updatedAt: string; source: string },
  ) => void;
};

export function AutoFetch({ onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(force: boolean) {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch(
        `/api/cron/daily?force=${force ? "1" : "0"}`,
        {
          method: "POST",
          headers: { "Sec-Fetch-Site": "same-origin" },
        },
      );
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        hint?: string;
        skipped?: boolean;
        asOf?: string;
        warnings?: string[];
        counts?: Record<string, number>;
        historyDepth?: number;
        sources?: string[];
        updatedAt?: string;
        source?: string;
      };
      if (!res.ok || !body.ok) {
        throw new Error(body.hint || body.error || `HTTP ${res.status}`);
      }

      // reload full market
      const m = await fetch("/api/market", { cache: "no-store" });
      const json = (await m.json()) as MarketData & {
        _meta?: { updatedAt?: string; source?: string };
      };
      const { _meta, ...data } = json;
      onUpdated(data as MarketData, {
        updatedAt: _meta?.updatedAt ?? body.updatedAt ?? new Date().toISOString(),
        source: _meta?.source ?? body.source ?? "twse-live",
      });

      if (body.skipped) {
        setMsg(`已是最新（${body.asOf}），無需重抓`);
      } else {
        const c = body.counts;
        setMsg(
          `已產生 ${body.asOf} 籌碼：外資買超 ${c?.foreignBuy ?? "—"} 檔 · 新高 ${c?.highs ?? 0} · 新低 ${c?.lows ?? 0}` +
            (body.historyDepth != null
              ? ` · 價史 ${body.historyDepth} 日`
              : "") +
            (body.warnings?.length
              ? `（${body.warnings[0]}）`
              : ""),
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <Radar className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <p className="section-label">Auto generate</p>
            <h3 className="mt-1 text-base font-semibold tracking-tight text-fg text-display">
              自動產生新交易日籌碼
            </h3>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
              直接從證交所／櫃買公開資料抓取外資、投信買賣超與收盤行情，寫入看板。
              盤後約 15:30 後資料才會齊；也可設外部排程呼叫{" "}
              <code className="rounded bg-surface-2 px-1 font-mono text-[11px] text-primary">
                /api/cron/daily
              </code>
              。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => void run(true)}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            立即抓取最新交易日
          </button>
        </div>
      </div>
      {msg && (
        <div className="mt-4 rounded-xl border border-down/25 bg-down/10 px-3 py-2 text-sm text-down">
          {msg}
        </div>
      )}
      {err && (
        <div className="mt-4 rounded-xl border border-up/25 bg-up/10 px-3 py-2 text-sm text-up">
          {err}
        </div>
      )}
      <ul className="mt-4 grid gap-2 text-xs text-subtle sm:grid-cols-3">
        <li className="rounded-xl border border-border bg-surface-2/40 px-3 py-2">
          來源：TWSE T86 + 櫃買三大法人
        </li>
        <li className="rounded-xl border border-border bg-surface-2/40 px-3 py-2">
          單位：張（股數 ÷ 1,000）
        </li>
        <li className="rounded-xl border border-border bg-surface-2/40 px-3 py-2">
          新高新低：累積日線後自動判定
        </li>
      </ul>
    </div>
  );
}
