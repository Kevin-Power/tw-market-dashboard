import { useCallback, useRef, useState, type DragEvent } from "react";
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";
import {
  MarketParseError,
  parseMarketFromFiles,
} from "@/lib/parse-market-xlsx";
import type { MarketData } from "@/data/types";
import { cn } from "@/lib/utils";

type Slot = "foreign" | "highs" | "lows";

const SLOTS: {
  key: Slot;
  title: string;
  hint: string;
  match: RegExp;
}[] = [
  {
    key: "foreign",
    title: "外資投信",
    hint: "檔名含「外資」或「投信」",
    match: /外資|投信|foreign/i,
  },
  {
    key: "highs",
    title: "一年新高",
    hint: "檔名含「新高」",
    match: /新高|high/i,
  },
  {
    key: "lows",
    title: "一年新低",
    hint: "檔名含「新低」",
    match: /新低|low/i,
  },
];

type Props = {
  onUpdated: (
    data: MarketData,
    meta: { updatedAt: string; source: string },
  ) => void;
};

export function DailyUpload({ onUpdated }: Props) {
  const [files, setFiles] = useState<Partial<Record<Slot, File>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const assignFiles = useCallback((list: FileList | File[]) => {
    const arr = Array.from(list).filter((f) => /\.xlsx?$/i.test(f.name));
    setFiles((prev) => {
      const next = { ...prev };
      for (const f of arr) {
        const slot = SLOTS.find((s) => s.match.test(f.name));
        if (slot) next[slot.key] = f;
      }
      const unmatched = arr.filter(
        (f) => !SLOTS.some((s) => s.match.test(f.name)),
      );
      if (unmatched.length && Object.keys(next).length < 3) {
        const empty = SLOTS.filter((s) => !next[s.key]);
        unmatched.forEach((f, i) => {
          if (empty[i]) next[empty[i]!.key] = f;
        });
      }
      return next;
    });
    setError(null);
    setIssues([]);
    setOkMsg(null);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files?.length) assignFiles(e.dataTransfer.files);
    },
    [assignFiles],
  );

  async function submit() {
    if (!files.foreign || !files.highs || !files.lows) {
      setError("請上傳三份 Excel：外資投信、一年新高、一年新低");
      return;
    }
    setBusy(true);
    setError(null);
    setIssues([]);
    setOkMsg(null);
    try {
      const data = await parseMarketFromFiles({
        foreign: files.foreign,
        highs: files.highs,
        lows: files.lows,
      });
      const res = await fetch("/api/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, source: "daily-upload" }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        hint?: string;
        issues?: string[];
        updatedAt?: string;
        source?: string;
        asOf?: string;
        counts?: Record<string, number>;
      } | null;
      if (!res.ok) {
        setIssues(body?.issues ?? []);
        throw new Error(
          body?.hint || body?.error || `上傳失敗 (${res.status})`,
        );
      }
      onUpdated(data, {
        updatedAt: body?.updatedAt ?? new Date().toISOString(),
        source: body?.source ?? "daily-upload",
      });
      const c = body?.counts;
      setOkMsg(
        c
          ? `已更新 ${data.asOfLabel}（新高 ${c.highs}／新低 ${c.lows}／外資買超 ${c.foreignBuy}）`
          : `已更新資料日 ${data.asOfLabel}`,
      );
    } catch (e) {
      if (e instanceof MarketParseError) {
        setError(e.message);
        setIssues(e.details.slice(0, 8));
      } else {
        setError(e instanceof Error ? e.message : "解析或上傳失敗");
      }
    } finally {
      setBusy(false);
    }
  }

  const ready = Boolean(files.foreign && files.highs && files.lows);
  const filled = [files.foreign, files.highs, files.lows].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="panel p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <RefreshCw className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="section-label">Daily sync</p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-fg text-display">
              每日更新資料
            </h3>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
              收盤後上傳三份 Excel。系統會依原始欄位解析（買賣超以 Excel
              「買超／賣超」欄為準，不自行重算），並通過校驗後才寫入看板。
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 max-w-[12rem] flex-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${(filled / 3) * 100}%` }}
                />
              </div>
              <span className="text-xs text-subtle tabular">
                {filled}/3 檔就緒
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "panel border-dashed p-5 transition-[border-color,background-color] duration-200 sm:p-7",
          dragging
            ? "border-primary/50 bg-primary/5"
            : "border-border-strong bg-surface/50",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) assignFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mx-auto flex w-full max-w-lg flex-col items-center gap-2.5 rounded-2xl border border-border bg-surface-2/70 px-5 py-10 text-center transition-[border-color,background-color,transform] duration-200 hover:border-primary/35 hover:bg-surface-2 active:scale-[0.99]"
        >
          <span className="flex size-14 items-center justify-center rounded-2xl border border-border bg-surface text-primary">
            <Upload className="size-6" strokeWidth={1.5} />
          </span>
          <span className="text-sm font-semibold text-fg">
            拖曳三份 Excel 到此，或點擊選擇
          </span>
          <span className="text-xs text-subtle">
            支援 .xlsx · 檔名含「外資／新高／新低」可自動對位
          </span>
        </button>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {SLOTS.map((s) => {
            const f = files[s.key];
            return (
              <div
                key={s.key}
                className={cn(
                  "rounded-2xl border px-4 py-3.5 transition-colors",
                  f
                    ? "border-primary/30 bg-primary/8"
                    : "border-border bg-surface-2/50",
                )}
              >
                <div className="flex items-center gap-2 text-xs font-medium text-muted">
                  <FileSpreadsheet
                    className={cn("size-3.5", f ? "text-primary" : "")}
                  />
                  {s.title}
                  {f && (
                    <CheckCircle2 className="ml-auto size-3.5 text-primary" />
                  )}
                </div>
                <div className="mt-2 truncate text-sm font-medium text-fg">
                  {f ? f.name : "尚未選擇"}
                </div>
                <div className="mt-0.5 text-[11px] text-subtle">{s.hint}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => void submit()}
            className="btn-primary"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                校驗並更新中…
              </>
            ) : (
              <>
                <RefreshCw className="size-4" />
                套用今日資料
              </>
            )}
          </button>
          {okMsg && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-down/25 bg-down/10 px-3 py-1.5 text-sm text-down">
              <CheckCircle2 className="size-4" />
              {okMsg}
            </span>
          )}
        </div>

        {(error || issues.length > 0) && (
          <div
            className="mt-4 rounded-2xl border border-up/25 bg-up/8 px-4 py-3 text-sm text-up"
            role="alert"
          >
            {error && <div className="font-medium">{error}</div>}
            {issues.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-up/90">
                {issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
