/**
 * Build MarketData from TWSE/TPEx public feeds for a trading day.
 */
import type {
  FlowRow,
  Holding,
  HighStock,
  LowStock,
  MarketData,
} from "@/data/types";
import { getMarketSnapshot } from "@/lib/market.server";
import {
  detectExtremes,
  loadPriceHistory,
  mergeQuotesIntoHistory,
} from "@/lib/price-history.server";
import {
  formatAsOfLabel,
  formatRocDate,
  formatYmd,
  isoToExcelSerial,
  parseYmdToIso,
  recentWeekdays,
} from "@/lib/tw-market-dates";
import {
  fetchTpexInst,
  fetchTwseQuotes,
  fetchTwseT86,
  sharesToLots,
  type InstRow,
} from "@/lib/twse-client";
import { normalizeMarketData, parseMarketData } from "@/lib/market-schema";

export type LiveBuildResult = {
  data: MarketData;
  dateTried: string;
  sources: string[];
  warnings: string[];
  highCount: number;
  lowCount: number;
  historyDepth: number;
};

function mergeInst(a: InstRow[], b: InstRow[]): InstRow[] {
  const map = new Map<string, InstRow>();
  for (const r of [...a, ...b]) {
    const prev = map.get(r.code);
    if (!prev) {
      map.set(r.code, { ...r });
      continue;
    }
    map.set(r.code, {
      code: r.code,
      name: r.name || prev.name,
      foreignBuy: prev.foreignBuy + r.foreignBuy,
      foreignSell: prev.foreignSell + r.foreignSell,
      foreignNet: prev.foreignNet + r.foreignNet,
      trustBuy: prev.trustBuy + r.trustBuy,
      trustSell: prev.trustSell + r.trustSell,
      trustNet: prev.trustNet + r.trustNet,
    });
  }
  return [...map.values()];
}

function toFlow(
  rows: InstRow[],
  pick: "foreign" | "trust",
  mode: "buy" | "sell",
  limit = 30,
): FlowRow[] {
  const scored = rows
    .map((r) => {
      const buy = pick === "foreign" ? r.foreignBuy : r.trustBuy;
      const sell = pick === "foreign" ? r.foreignSell : r.trustSell;
      const net = pick === "foreign" ? r.foreignNet : r.trustNet;
      return {
        code: r.code,
        name: r.name,
        buy: sharesToLots(buy),
        sell: sharesToLots(sell),
        net: sharesToLots(net),
      };
    })
    .filter((r) => (mode === "buy" ? r.net > 0 : r.net < 0));

  scored.sort((a, b) =>
    mode === "buy" ? b.net - a.net : a.net - b.net,
  );

  return scored.slice(0, limit).map((r, i) => ({
    rank: i + 1,
    code: r.code,
    name: r.name,
    buy: r.buy,
    sell: r.sell,
    net: r.net,
  }));
}

function contBuyNames(rows: InstRow[], limit = 40): string[] {
  return rows
    .filter((r) => r.foreignNet > 0 && r.trustNet > 0)
    .sort(
      (a, b) =>
        b.foreignNet + b.trustNet - (a.foreignNet + a.trustNet),
    )
    .slice(0, limit)
    .map((r) => r.name.trim());
}

/** Backfill OHLC history so 一年新高/新低 becomes meaningful sooner. */
async function backfillQuotes(
  asOf: string,
  warnings: string[],
  targetDays = 45,
): Promise<void> {
  const hist = await loadPriceHistory();
  const depths = Object.values(hist.bars).map((b) => b.length);
  const median = depths.length
    ? depths.sort((a, b) => a - b)[Math.floor(depths.length / 2)]!
    : 0;
  if (median >= 25) return;

  const days = recentWeekdays(targetDays + 5).filter(
    (d) => parseYmdToIso(formatYmd(d)) <= asOf,
  );
  let ok = 0;
  for (const day of days) {
    const ymd = formatYmd(day);
    const iso = parseYmdToIso(ymd);
    try {
      // skip if we already have substantial coverage for this date
      const sample = Object.values(hist.bars)[0];
      if (sample?.some((b) => b.d === iso) && ok > 5) {
        // still try a few more
      }
      const quotes = await fetchTwseQuotes(ymd);
      if (quotes.length < 50) continue;
      await mergeQuotesIntoHistory(iso, quotes);
      ok += 1;
      // be polite to TWSE
      await new Promise((r) => setTimeout(r, 350));
    } catch {
      /* holiday / empty */
    }
    if (ok >= targetDays) break;
  }
  if (ok > 0) {
    warnings.push(`已回填 ${ok} 個交易日收盤行情以計算新高新低`);
  }
}

async function tryBuildForDate(day: Date): Promise<LiveBuildResult> {
  const ymd = formatYmd(day);
  const asOf = parseYmdToIso(ymd);
  const roc = formatRocDate(day);
  const warnings: string[] = [];
  const sources: string[] = [];

  const twseInst = await fetchTwseT86(ymd);
  sources.push("TWSE T86");
  let tpexInst: InstRow[] = [];
  try {
    tpexInst = await fetchTpexInst(roc);
    if (tpexInst.length) sources.push("TPEx 三大法人");
  } catch (e) {
    warnings.push(
      `櫃買三大法人略過：${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const inst = mergeInst(twseInst, tpexInst);
  if (inst.length < 10) {
    throw new Error(`法人資料過少 (${inst.length}) @ ${ymd}`);
  }

  const quotes = await fetchTwseQuotes(ymd);
  sources.push("TWSE 收盤行情");
  if (quotes.length < 50) {
    warnings.push("收盤行情筆數偏少，新高新低可能不完整");
  }

  await mergeQuotesIntoHistory(asOf, quotes);
  await backfillQuotes(asOf, warnings, 40);
  const history = await loadPriceHistory();
  const extremes = detectExtremes(asOf, quotes, history);
  const highList = extremes.filter((e) => e.isYearHigh);
  const lowList = extremes.filter((e) => e.isYearLow);

  const depths = Object.values(history.bars).map((b) => b.length);
  const historyDepth = depths.length
    ? depths.sort((a, b) => a - b)[Math.floor(depths.length / 2)]!
    : 0;

  if (historyDepth < 20) {
    warnings.push(
      `價格歷史約 ${historyDepth} 日；累積愈多新高新低愈準。外資投信籌碼已是當日完整官方資料。`,
    );
  }

  const highStocks: HighStock[] = highList
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
    .slice(0, 80)
    .map((e) => ({
      code: e.code,
      name: e.name,
      price: e.price,
      change: e.change ?? 0,
      changePct: e.changePct ?? 0,
      volRank: null,
      volHighDays: null,
      vol: e.volume != null ? sharesToLots(e.volume) : null,
      volChange: null,
      amountM:
        e.amount != null
          ? Math.round((e.amount / 1_000_000) * 100) / 100
          : null,
      amountRank: null,
      amountHighDays: null,
    }));

  const lowStocks: LowStock[] = lowList
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))
    .slice(0, 200)
    .map((e) => ({
      code: e.code,
      name: e.name,
      price: e.price,
      high: e.high,
      low: e.low,
      change: e.change,
      changePct: e.changePct,
      histHigh: e.histHigh,
      fromHistHigh: e.fromHistHigh,
      histLow: e.histLow,
      fromHistLow: e.fromHistLow,
      y10High: null,
      fromY10High: null,
    }));

  let holdings: Holding[] = [];
  try {
    const prev = await getMarketSnapshot();
    holdings = prev.data.lows.holdings.filter((h) => h.weight > 0);
  } catch {
    holdings = [];
  }
  if (!holdings.length) {
    // Minimal valid placeholder until Excel/ETF composition is provided
    holdings = [
      { name: "台積電", sharesK: 1, weight: 50, change: null },
      { name: "鴻海", sharesK: 1, weight: 5, change: null },
    ];
    warnings.push(
      "0050 完整持股權重請用 Excel 覆蓋一次；之後自動更新會沿用權重表",
    );
  }

  let series: MarketData["highs"]["series"] = [];
  try {
    const prev = await getMarketSnapshot();
    series = [...prev.data.highs.series];
  } catch {
    series = [];
  }
  const count = highStocks.length;
  const excel = isoToExcelSerial(asOf);
  const sIdx = series.findIndex((s) => s.date === asOf);
  if (sIdx >= 0) series[sIdx] = { date: asOf, excel, count };
  else series.push({ date: asOf, excel, count });
  series.sort((a, b) => a.date.localeCompare(b.date));
  if (series.length > 400) series = series.slice(-400);
  if (!series.length) series = [{ date: asOf, excel, count }];

  const data: MarketData = {
    asOf,
    asOfLabel: formatAsOfLabel(asOf),
    foreign: {
      foreignBuy: toFlow(inst, "foreign", "buy"),
      foreignSell: toFlow(inst, "foreign", "sell"),
      trustBuy: toFlow(inst, "trust", "buy"),
      trustSell: toFlow(inst, "trust", "sell"),
      contStocks: contBuyNames(inst),
      lastDate: excel,
    },
    highs: { stocks: highStocks, series },
    lows: { holdings, lows: lowStocks },
  };

  const normalized = normalizeMarketData(data);
  const checked = parseMarketData(normalized);
  if (!checked.ok) {
    throw new Error(`live market validation failed: ${checked.error}`);
  }

  return {
    data: checked.data,
    dateTried: asOf,
    sources,
    warnings,
    highCount: highStocks.length,
    lowCount: lowStocks.length,
    historyDepth,
  };
}

export async function buildLatestLiveMarket(options?: {
  asOf?: string;
  /** Skip multi-day quote backfill (faster) */
  skipBackfill?: boolean;
}): Promise<LiveBuildResult> {
  if (options?.asOf) {
    const [y, m, d] = options.asOf.split("-").map(Number);
    const day = new Date(Date.UTC(y!, m! - 1, d!));
    return tryBuildForDate(day);
  }

  const candidates = recentWeekdays(10);
  let lastErr: Error | null = null;
  for (const day of candidates) {
    try {
      return await tryBuildForDate(day);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error("no trading day data available");
}
