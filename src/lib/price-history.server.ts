/**
 * Rolling ~250 trading-day OHLC history for 一年新高/新低 detection.
 * Stored under data/price-history.json (file mode, no DB required).
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { QuoteRow } from "@/lib/twse-client";

export type DayBar = {
  d: string; // YYYY-MM-DD
  c: number;
  h: number;
  l: number;
};

export type PriceHistory = {
  updatedAt: string;
  /** code → bars oldest→newest */
  bars: Record<string, DayBar[]>;
};

const MAX_BARS = 260;

const globalRef = globalThis as typeof globalThis & {
  __priceHistory__?: PriceHistory | null;
};

function historyPath() {
  return path.join(process.cwd(), "data", "price-history.json");
}

export async function loadPriceHistory(): Promise<PriceHistory> {
  if (globalRef.__priceHistory__) return globalRef.__priceHistory__;
  try {
    const raw = await readFile(historyPath(), "utf8");
    const parsed = JSON.parse(raw) as PriceHistory;
    if (!parsed.bars) parsed.bars = {};
    globalRef.__priceHistory__ = parsed;
    return parsed;
  } catch {
    const empty: PriceHistory = {
      updatedAt: new Date().toISOString(),
      bars: {},
    };
    globalRef.__priceHistory__ = empty;
    return empty;
  }
}

export async function savePriceHistory(h: PriceHistory): Promise<void> {
  await mkdir(path.dirname(historyPath()), { recursive: true });
  const tmp = `${historyPath()}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(h), "utf8");
  await rename(tmp, historyPath());
  globalRef.__priceHistory__ = h;
}

/** Upsert today's quotes into history (idempotent per date). */
export async function mergeQuotesIntoHistory(
  asOf: string,
  quotes: QuoteRow[],
): Promise<PriceHistory> {
  const h = await loadPriceHistory();
  for (const q of quotes) {
    if (q.close == null) continue;
    const bar: DayBar = {
      d: asOf,
      c: q.close,
      h: q.high ?? q.close,
      l: q.low ?? q.close,
    };
    const list = h.bars[q.code] ?? [];
    const idx = list.findIndex((b) => b.d === asOf);
    if (idx >= 0) list[idx] = bar;
    else list.push(bar);
    list.sort((a, b) => a.d.localeCompare(b.d));
    h.bars[q.code] = list.slice(-MAX_BARS);
  }
  h.updatedAt = new Date().toISOString();
  await savePriceHistory(h);
  return h;
}

export type ExtremeResult = {
  code: string;
  name: string;
  price: number;
  high: number | null;
  low: number | null;
  change: number | null;
  changePct: number | null;
  histHigh: number | null;
  fromHistHigh: number | null;
  histLow: number | null;
  fromHistLow: number | null;
  isYearHigh: boolean;
  isYearLow: boolean;
  volume: number | null;
  amount: number | null;
};

/**
 * Detect 一年新高/新低 using max high / min low over prior lookback bars.
 * Requires enough history; until then flags stay false (still builds flow).
 */
export function detectExtremes(
  asOf: string,
  quotes: QuoteRow[],
  history: PriceHistory,
  lookback = 240,
): ExtremeResult[] {
  const out: ExtremeResult[] = [];
  for (const q of quotes) {
    if (q.close == null) continue;
    const bars = history.bars[q.code] ?? [];
    const past = bars.filter((b) => b.d < asOf).slice(-lookback);
    if (past.length < 20) {
      out.push({
        code: q.code,
        name: q.name,
        price: q.close,
        high: q.high,
        low: q.low,
        change: q.change,
        changePct: q.changePct,
        histHigh: null,
        fromHistHigh: null,
        histLow: null,
        fromHistLow: null,
        isYearHigh: false,
        isYearLow: false,
        volume: q.volume,
        amount: q.amount,
      });
      continue;
    }
    const histHigh = Math.max(...past.map((b) => b.h));
    const histLow = Math.min(...past.map((b) => b.l));
    const isYearHigh = q.close >= histHigh - 1e-9;
    const isYearLow = q.close <= histLow + 1e-9;
    const fromHistHigh =
      histHigh > 0
        ? Math.round(((q.close - histHigh) / histHigh) * 10000) / 100
        : null;
    const fromHistLow =
      histLow > 0
        ? Math.round(((q.close - histLow) / histLow) * 10000) / 100
        : null;
    out.push({
      code: q.code,
      name: q.name,
      price: q.close,
      high: q.high,
      low: q.low,
      change: q.change,
      changePct: q.changePct,
      histHigh,
      fromHistHigh,
      histLow,
      fromHistLow,
      isYearHigh,
      isYearLow,
      volume: q.volume,
      amount: q.amount,
    });
  }
  return out;
}
