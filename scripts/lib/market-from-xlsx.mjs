/**
 * Pure-JS Excel → MarketData (CLI). Mirrors src/lib/parse-market-xlsx.ts rules.
 * Net 買賣超 uses Excel net column, not buy−sell.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

function cellStr(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v))
    return Number.isInteger(v) ? String(v) : String(v);
  if (v instanceof Date) return "";
  return String(v).trim();
}
function cellCode(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v))
    return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}
function cellNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.replace(/,/g, "").trim();
    if (!t || t === "-" || t === "N/A") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function excelSerialToIso(serial) {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function toIsoDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  if (typeof v === "number" && v > 20000 && v < 80000) return excelSerialToIso(v);
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return null;
}
function toExcelSerial(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000 + 25569);
}

function loadSheets(buf) {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  return wb.SheetNames.map((name) => ({
    name,
    data: XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      defval: null,
      raw: true,
      blankrows: true,
    }),
  }));
}
function pickDay(sheets) {
  return sheets.find((s) => /^\d{3,4}$/.test(s.name.trim())) || sheets[0];
}
function findRow(rows, pred) {
  for (let i = 0; i < rows.length; i++) if (pred(rows[i] || [], i)) return i;
  return -1;
}

function parseFlow(rows, start, col, limit = 200) {
  const out = [];
  for (let i = start; i < rows.length && out.length < limit; i++) {
    const row = rows[i] || [];
    const label = cellStr(row[col]);
    if (label.includes("買超") || label.includes("賣超") || label === "排") {
      if (out.length) break;
      continue;
    }
    const rank = cellNum(row[col]);
    const code = cellCode(row[col + 1]);
    const name = cellStr(row[col + 2]);
    if (rank == null || !code || !name) continue;
    if (!Number.isInteger(rank) || rank <= 0) continue;
    const buy = cellNum(row[col + 3]) ?? 0;
    const sell = cellNum(row[col + 4]) ?? 0;
    const netRaw = cellNum(row[col + 5]);
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

export function parseMarketFromBuffers({ foreignBuf, highsBuf, lowsBuf }) {
  // --- foreign ---
  const fSheets = loadSheets(foreignBuf);
  const fDay = pickDay(fSheets);
  const buyT = findRow(fDay.data, (r) => cellStr(r[0]).includes("外資買超"));
  const sellT = findRow(fDay.data, (r) => cellStr(r[0]).includes("外資賣超"));
  const buyStart = (buyT >= 0 ? buyT : 3) + 2;
  const sellStart = (sellT >= 0 ? sellT : 37) + 2;
  const foreignBuy = parseFlow(fDay.data, buyStart, 0).slice(0, 30);
  const trustBuy = parseFlow(fDay.data, buyStart, 7).slice(0, 30);
  const foreignSell = parseFlow(fDay.data, sellStart, 0).slice(0, 30);
  const trustSell = parseFlow(fDay.data, sellStart, 7).slice(0, 30);
  if (!foreignBuy.length || !trustBuy.length || !foreignSell.length || !trustSell.length) {
    throw new Error("外資投信清單不完整");
  }

  const cont = fSheets.find((s) => /連續|同時/.test(s.name));
  const contByDate = {};
  if (cont) {
    const header = cont.data[0] || [];
    for (let c = 1; c < header.length; c++) {
      const iso = toIsoDate(header[c]);
      if (!iso) continue;
      const names = [];
      for (let r = 1; r < cont.data.length; r++) {
        const n = cellStr(cont.data[r]?.[c]);
        if (n) names.push(n);
      }
      if (names.length) contByDate[iso] = names;
    }
  }

  // --- highs ---
  const hSheets = loadSheets(highsBuf);
  const hDay = pickDay(hSheets);
  const stocks = [];
  let asOfFromStocks = null;
  for (const row of hDay.data) {
    const code = cellCode(row[0]);
    const name = cellStr(row[1]);
    const price = cellNum(row[2]);
    if (!code || !name || price == null || code === "代號") continue;
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
  if (!stocks.length) throw new Error("一年新高清單為空");

  const seriesSheet =
    hSheets.find((s) => /家數|大盤/.test(s.name)) || hSheets[1];
  let series = [];
  if (seriesSheet) {
    for (const row of seriesSheet.data) {
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

  // --- lows ---
  const lSheets = loadSheets(lowsBuf);
  const lDay = pickDay(lSheets);
  const holdings = [];
  const lows = [];
  let asOfFromLows = null;
  const seen = new Set();
  for (const row of lDay.data) {
    const hName = cellStr(row[1]);
    const sharesK = cellNum(row[2]);
    const weight = cellNum(row[3]);
    if (
      hName &&
      sharesK != null &&
      weight != null &&
      hName !== "股票名稱" &&
      !hName.includes("持股明細") &&
      !hName.includes("資料日期")
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
    if (!code || !name || price == null || code === "代號") continue;
    if (seen.has(code)) continue;
    seen.add(code);
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
  if (!lows.length) throw new Error("一年新低清單為空");

  const seriesLast = series.length ? series[series.length - 1].date : null;
  const asOf = asOfFromStocks || asOfFromLows || seriesLast;
  if (!asOf) throw new Error("無法推斷 asOf");

  let contStocks = [];
  let lastDate = 0;
  if (contByDate[asOf]?.length) {
    contStocks = contByDate[asOf];
    lastDate = toExcelSerial(asOf);
  } else {
    const dates = Object.keys(contByDate).sort();
    const prev = [...dates].reverse().find((d) => d <= asOf);
    if (prev) {
      contStocks = contByDate[prev];
      lastDate = toExcelSerial(prev);
    }
  }
  if (!lastDate) lastDate = toExcelSerial(asOf);

  // align series end with asOf + stock list length
  if (!series.length || series[series.length - 1].date < asOf) {
    series.push({ date: asOf, excel: toExcelSerial(asOf), count: stocks.length });
  } else if (series[series.length - 1].date === asOf) {
    series[series.length - 1] = {
      ...series[series.length - 1],
      count: stocks.length,
    };
  } else {
    series = series.filter((s) => s.date <= asOf);
    const end = series[series.length - 1];
    if (!end || end.date !== asOf) {
      series.push({ date: asOf, excel: toExcelSerial(asOf), count: stocks.length });
    } else {
      series[series.length - 1] = { ...end, count: stocks.length };
    }
  }
  if (series.length > 120) series = series.slice(-120);

  return {
    asOf,
    asOfLabel: asOf.replace(/-/g, "/"),
    foreign: {
      foreignBuy,
      foreignSell,
      trustBuy,
      trustSell,
      contStocks,
      lastDate,
    },
    highs: { stocks, series },
    lows: { holdings: holdings.slice(0, 50), lows },
  };
}
