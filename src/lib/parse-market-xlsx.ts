/**
 * Authoritative parser for the three daily TW market Excel workbooks.
 *
 * Workbook contracts (column layout from vendor export):
 * - 外資投信.xlsx
 *   sheet MMDD: 外資買超/賣超 left cols A–F, 投信 right H–M
 *   sheet 連續買進: row1 dates, rows below stock names per day
 * - 創一年新高.xlsx
 *   sheet MMDD: stock rows (代號…), F1 often = count
 *   sheet 新高家數VS大盤: date + count series
 * - 創一年新低.xlsx
 *   sheet MMDD: B–E 0050 holdings; H–AA new-low stocks
 *
 * Net 買賣超 MUST use the Excel net column (not buy−sell) — vendor nets can
 * differ by 1 張 from buy−sell due to rounding.
 */
import * as XLSX from "xlsx";
import type {
  FlowRow,
  HighStock,
  Holding,
  LowStock,
  MarketData,
} from "@/data/types";
import { normalizeMarketData, parseMarketData } from "@/lib/market-schema";

type SheetLike = { name: string; data: unknown[][] };

export type ParsedWorkbooks = {
  foreign: ArrayBuffer | Uint8Array;
  highs: ArrayBuffer | Uint8Array;
  lows: ArrayBuffer | Uint8Array;
};

export class MarketParseError extends Error {
  details: string[];
  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = "MarketParseError";
    this.details = details;
  }
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  if (v instanceof Date) return "";
  return String(v).trim();
}

/** Stock / ETF code: keep lettered codes as-is; numeric stay unpadded (matches export). */
function cellCode(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v)) return String(v);
    return String(v);
  }
  return String(v).trim();
}

function cellNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return null;
  if (typeof v === "string") {
    const t = v.replace(/,/g, "").trim();
    if (!t || t === "-" || t === "N/A" || t === "na") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function excelSerialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toIsoDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 80000) {
    return excelSerialToIso(v);
  }
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) {
      return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
    }
  }
  return null;
}

function toExcelSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / 86400000 + 25569);
}

function loadSheets(buf: ArrayBuffer | Uint8Array): SheetLike[] {
  const wb = XLSX.read(buf, {
    type: "array",
    cellDates: true,
    cellNF: false,
    cellText: false,
  });
  return wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name]!;
    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: true,
    }) as unknown[][];
    return { name, data };
  });
}

function pickDaySheet(sheets: SheetLike[]): SheetLike {
  const day = sheets.find((s) => /^\d{3,4}$/.test(s.name.trim()));
  if (day) return day;
  return sheets[0]!;
}

function findRow(
  rows: unknown[][],
  pred: (row: unknown[], i: number) => boolean,
): number {
  for (let i = 0; i < rows.length; i++) {
    if (pred(rows[i] ?? [], i)) return i;
  }
  return -1;
}

/**
 * Parse a flow block starting at first data row after header.
 * rankCol is 0 for 外資 (A–F) or 7 for 投信 (H–M).
 * Uses Excel net column (rankCol+5); only falls back to buy−sell if missing.
 */
function parseFlowBlock(
  rows: unknown[][],
  startRow: number,
  rankCol: number,
  limit = 200,
): FlowRow[] {
  const out: FlowRow[] = [];
  for (let i = startRow; i < rows.length && out.length < limit; i++) {
    const row = rows[i] ?? [];
    const label = cellStr(row[rankCol]);
    if (
      label.includes("買超") ||
      label.includes("賣超") ||
      label === "排" ||
      label === "排名"
    ) {
      if (out.length) break;
      continue;
    }

    const rank = cellNum(row[rankCol]);
    const code = cellCode(row[rankCol + 1]);
    const name = cellStr(row[rankCol + 2]);

    if (rank == null || !code || !name) {
      if (!label && !code && !name) continue;
      continue;
    }
    if (!Number.isInteger(rank) || rank <= 0) continue;

    const buy = cellNum(row[rankCol + 3]) ?? 0;
    const sell = cellNum(row[rankCol + 4]) ?? 0;
    // CRITICAL: prefer vendor net column
    const netRaw = cellNum(row[rankCol + 5]);
    const net = netRaw != null ? netRaw : buy - sell;

    out.push({
      rank: Math.trunc(rank),
      code,
      name,
      buy: Math.round(buy),
      sell: Math.round(sell),
      net: Math.round(net),
    });
  }
  return out;
}

type ForeignParse = {
  foreign: MarketData["foreign"];
  contByDate: Record<string, string[]>;
  warnings: string[];
};

function parseForeign(buf: ArrayBuffer | Uint8Array): ForeignParse {
  const warnings: string[] = [];
  const sheets = loadSheets(buf);
  if (!sheets.length) throw new MarketParseError("外資投信：找不到工作表");

  const day = pickDaySheet(sheets);
  const rows = day.data;

  const buyTitle = findRow(rows, (r) => cellStr(r[0]).includes("外資買超"));
  const sellTitle = findRow(rows, (r) => cellStr(r[0]).includes("外資賣超"));
  if (buyTitle < 0) warnings.push("外資投信：未找到「外資買超」標題，使用預設列");
  if (sellTitle < 0)
    warnings.push("外資投信：未找到「外資賣超」標題，使用預設列");

  const buyDataStart = (buyTitle >= 0 ? buyTitle : 3) + 2;
  const sellDataStart = (sellTitle >= 0 ? sellTitle : 37) + 2;

  const foreignBuy = parseFlowBlock(rows, buyDataStart, 0, 200);
  const trustBuy = parseFlowBlock(rows, buyDataStart, 7, 200);
  const foreignSell = parseFlowBlock(rows, sellDataStart, 0, 200);
  const trustSell = parseFlowBlock(rows, sellDataStart, 7, 200);

  if (!foreignBuy.length) throw new MarketParseError("外資買超清單為空");
  if (!trustBuy.length) throw new MarketParseError("投信買超清單為空");
  if (!foreignSell.length) throw new MarketParseError("外資賣超清單為空");
  if (!trustSell.length) throw new MarketParseError("投信賣超清單為空");

  const cont = sheets.find(
    (s) => s.name.includes("連續") || s.name.includes("同時"),
  );

  const contByDate: Record<string, string[]> = {};
  let lastDate = 0;
  let contStocks: string[] = [];

  if (cont) {
    const header = cont.data[0] ?? [];
    for (let c = 1; c < header.length; c++) {
      const iso = toIsoDate(header[c]);
      if (!iso) continue;
      const names: string[] = [];
      for (let r = 1; r < cont.data.length; r++) {
        const name = cellStr(cont.data[r]?.[c]);
        if (name) names.push(name);
      }
      if (names.length) contByDate[iso] = names;
    }
    const dates = Object.keys(contByDate).sort();
    if (dates.length) {
      const last = dates[dates.length - 1]!;
      contStocks = contByDate[last]!;
      lastDate = toExcelSerial(last);
    }
  } else {
    warnings.push("外資投信：找不到連續買進工作表");
  }

  return {
    foreign: {
      foreignBuy: foreignBuy.slice(0, 30),
      foreignSell: foreignSell.slice(0, 30),
      trustBuy: trustBuy.slice(0, 30),
      trustSell: trustSell.slice(0, 30),
      contStocks,
      lastDate,
    },
    contByDate,
    warnings,
  };
}

function parseHighs(buf: ArrayBuffer | Uint8Array): {
  highs: MarketData["highs"];
  asOfFromStocks: string | null;
  sheetCount: number | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const sheets = loadSheets(buf);
  const day = pickDaySheet(sheets);
  const rows = day.data;

  let sheetCount: number | null = null;
  if (rows[0]) {
    const f1 = cellNum(rows[0][5]);
    if (f1 != null) sheetCount = Math.trunc(f1);
  }

  const stocks: HighStock[] = [];
  let asOfFromStocks: string | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const code = cellCode(row[0]);
    const name = cellStr(row[1]);
    const price = cellNum(row[2]);
    if (!code || !name || price == null) continue;
    if (code === "代號" || name === "名稱") continue;
    if (!Number.isFinite(price)) continue;

    const upd = toIsoDate(row[5]);
    if (upd && !asOfFromStocks) asOfFromStocks = upd;

    stocks.push({
      code,
      name,
      price,
      change: cellNum(row[3]) ?? 0,
      changePct: cellNum(row[4]) ?? 0,
      volRank: cellNum(row[6]),
      volHighDays: cellNum(row[7]),
      vol: cellNum(row[8]),
      volChange: cellNum(row[9]),
      amountM: cellNum(row[11]),
      amountRank: cellNum(row[12]),
      amountHighDays: cellNum(row[13]),
    });
  }

  if (!stocks.length) throw new MarketParseError("一年新高：個股清單為空");

  if (sheetCount != null && sheetCount !== stocks.length) {
    warnings.push(
      `一年新高：F1 家數 ${sheetCount} 與清單 ${stocks.length} 不一致，以清單為準`,
    );
  }

  const seriesSheet =
    sheets.find((s) => s.name.includes("家數") || s.name.includes("大盤")) ??
    sheets[1];
  const series: MarketData["highs"]["series"] = [];
  if (seriesSheet) {
    for (let i = 0; i < seriesSheet.data.length; i++) {
      const row = seriesSheet.data[i] ?? [];
      const iso = toIsoDate(row[0]);
      const count = cellNum(row[1]);
      if (!iso || count == null) continue;
      series.push({
        date: iso,
        excel: toExcelSerial(iso),
        count: Math.max(0, Math.round(count)),
      });
    }
  }
  if (!series.length) {
    warnings.push("一年新高：走勢序列為空，將以當日家數補一點");
    if (asOfFromStocks) {
      series.push({
        date: asOfFromStocks,
        excel: toExcelSerial(asOfFromStocks),
        count: stocks.length,
      });
    }
  }

  const trimmed = series.length > 120 ? series.slice(-120) : series;

  return {
    highs: { stocks, series: trimmed },
    asOfFromStocks,
    sheetCount,
    warnings,
  };
}

function parseLows(buf: ArrayBuffer | Uint8Array): {
  lows: MarketData["lows"];
  asOfFromLows: string | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  const sheets = loadSheets(buf);
  const day = pickDaySheet(sheets);
  const rows = day.data;

  const holdings: Holding[] = [];
  const lows: LowStock[] = [];
  let asOfFromLows: string | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];

    const hName = cellStr(row[1]);
    const sharesK = cellNum(row[2]);
    const weight = cellNum(row[3]);
    if (
      hName &&
      sharesK != null &&
      weight != null &&
      hName !== "股票名稱" &&
      !hName.includes("持股明細") &&
      !hName.includes("資料日期") &&
      !hName.includes("設定")
    ) {
      holdings.push({
        name: hName,
        sharesK: Math.round(sharesK),
        weight,
        change: cellNum(row[4]),
      });
    }

    const code = cellCode(row[7]);
    const name = cellStr(row[8]);
    const price = cellNum(row[9]);
    if (!code || !name || price == null) continue;
    if (code === "代號" || name === "名稱") continue;

    const upd = toIsoDate(row[14]);
    if (upd && !asOfFromLows) asOfFromLows = upd;

    lows.push({
      code,
      name,
      price,
      high: cellNum(row[10]),
      low: cellNum(row[11]),
      change: cellNum(row[12]),
      changePct: cellNum(row[13]),
      y10High: cellNum(row[15]),
      fromY10High: cellNum(row[16]),
      y10Low: cellNum(row[17]),
      fromY10Low: cellNum(row[18]),
      y20High: cellNum(row[19]),
      fromY20High: cellNum(row[20]),
      y20Low: cellNum(row[21]),
      fromY20Low: cellNum(row[22]),
      histHigh: cellNum(row[23]),
      fromHistHigh: cellNum(row[24]),
      histLow: cellNum(row[25]),
      fromHistLow: cellNum(row[26]),
    });
  }

  if (!lows.length) throw new MarketParseError("一年新低：個股清單為空");
  if (!holdings.length) warnings.push("一年新低：0050 持股明細為空");

  const seen = new Set<string>();
  const uniqueLows: LowStock[] = [];
  for (const s of lows) {
    if (seen.has(s.code)) {
      warnings.push(`一年新低：重複代號 ${s.code}，已略過後者`);
      continue;
    }
    seen.add(s.code);
    uniqueLows.push(s);
  }

  return {
    lows: {
      holdings: holdings.slice(0, 50),
      lows: uniqueLows,
    },
    asOfFromLows,
    warnings,
  };
}

function resolveAsOf(parts: {
  fromHighs: string | null;
  fromLows: string | null;
  seriesLast: string | null;
}): string {
  if (parts.fromHighs) return parts.fromHighs;
  if (parts.fromLows) return parts.fromLows;
  if (parts.seriesLast) return parts.seriesLast;
  throw new MarketParseError("無法推斷資料日 asOf（Excel 內無更新日期）");
}

export function parseMarketFromWorkbooks(files: ParsedWorkbooks): MarketData {
  const warnings: string[] = [];

  const { foreign: foreignRaw, contByDate, warnings: w1 } = parseForeign(
    files.foreign,
  );
  warnings.push(...w1);

  const { highs, asOfFromStocks, warnings: w2 } = parseHighs(files.highs);
  warnings.push(...w2);

  const { lows, asOfFromLows, warnings: w3 } = parseLows(files.lows);
  warnings.push(...w3);

  const seriesLast = highs.series.length
    ? highs.series[highs.series.length - 1]!.date
    : null;

  const asOf = resolveAsOf({
    fromHighs: asOfFromStocks,
    fromLows: asOfFromLows,
    seriesLast,
  });

  let contStocks = foreignRaw.contStocks;
  let lastDate = foreignRaw.lastDate;
  if (Object.keys(contByDate).length) {
    if (contByDate[asOf]?.length) {
      contStocks = contByDate[asOf]!;
      lastDate = toExcelSerial(asOf);
    } else {
      const dates = Object.keys(contByDate).sort();
      const prev = [...dates].reverse().find((d) => d <= asOf);
      if (prev) {
        contStocks = contByDate[prev]!;
        lastDate = toExcelSerial(prev);
        if (prev !== asOf) {
          warnings.push(`連續買進：asOf ${asOf} 無資料，使用 ${prev}`);
        }
      }
    }
  }
  if (!lastDate) lastDate = toExcelSerial(asOf);

  let series = [...highs.series];
  const last = series[series.length - 1];
  if (!last || last.date < asOf) {
    series.push({
      date: asOf,
      excel: toExcelSerial(asOf),
      count: highs.stocks.length,
    });
  } else if (last.date === asOf) {
    series[series.length - 1] = {
      ...last,
      count: highs.stocks.length,
    };
  } else if (last.date > asOf) {
    series = series.filter((s) => s.date <= asOf);
    const end = series[series.length - 1];
    if (!end || end.date !== asOf) {
      series.push({
        date: asOf,
        excel: toExcelSerial(asOf),
        count: highs.stocks.length,
      });
    } else {
      series[series.length - 1] = { ...end, count: highs.stocks.length };
    }
  }
  if (series.length > 120) series = series.slice(-120);

  const raw: MarketData = {
    asOf,
    asOfLabel: asOf.replace(/-/g, "/"),
    foreign: {
      foreignBuy: foreignRaw.foreignBuy,
      foreignSell: foreignRaw.foreignSell,
      trustBuy: foreignRaw.trustBuy,
      trustSell: foreignRaw.trustSell,
      contStocks,
      lastDate,
    },
    highs: { stocks: highs.stocks, series },
    lows,
  };

  const normalized = normalizeMarketData(raw);
  const checked = parseMarketData(normalized);
  if (!checked.ok) {
    throw new MarketParseError(
      `解析結果未通過校驗：${checked.error}`,
      checked.issues,
    );
  }

  if (typeof console !== "undefined" && warnings.length) {
    console.info("[parse-market-xlsx]", warnings.join(" | "));
  }

  return checked.data;
}

export async function parseMarketFromFiles(input: {
  foreign: File | Blob;
  highs: File | Blob;
  lows: File | Blob;
}): Promise<MarketData> {
  const [foreign, highs, lows] = await Promise.all([
    input.foreign.arrayBuffer(),
    input.highs.arrayBuffer(),
    input.lows.arrayBuffer(),
  ]);
  return parseMarketFromWorkbooks({ foreign, highs, lows });
}
