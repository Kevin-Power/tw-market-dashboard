/**
 * TWSE / TPEx public JSON clients (no API key).
 * Unit notes: T86 / 櫃買 三大法人 are 股; we convert to 張 (/1000) for the board.
 */

export type InstRow = {
  code: string;
  name: string;
  foreignBuy: number; // 股
  foreignSell: number;
  foreignNet: number;
  trustBuy: number;
  trustSell: number;
  trustNet: number;
};

export type QuoteRow = {
  code: string;
  name: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null; // 股
  amount: number | null; // 元
};

const UA =
  "Mozilla/5.0 (compatible; TWMarketDashboard/1.0; +https://github.com/Kevin-Power/tw-market-dashboard)";

function parseNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v)
    .replace(/,/g, "")
    .replace(/\+/g, "")
    .replace(/X/gi, "")
    .trim();
  if (!s || s === "-" || s === "—") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseNumNullable(v: unknown): number | null {
  if (v == null || v === "") return null;
  const s = String(v)
    .replace(/,/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\+/g, "")
    .trim();
  if (!s || s === "-" || s === "—" || s === "N/A") return null;
  // HTML color markers for change direction already stripped
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json,text/plain,*/*",
      "User-Agent": UA,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`non-json from ${url}: ${text.slice(0, 120)}`);
  }
}

/** 上市 三大法人 T86 — dateYmd = YYYYMMDD */
export async function fetchTwseT86(dateYmd: string): Promise<InstRow[]> {
  const url = `https://www.twse.com.tw/rwd/zh/fund/T86?date=${dateYmd}&selectType=ALLBUT0999&response=json`;
  const raw = (await fetchJson(url)) as {
    stat?: string;
    data?: unknown[][];
  };
  if (raw.stat !== "OK" || !Array.isArray(raw.data)) {
    throw new Error(`TWSE T86 unavailable: ${raw.stat ?? "no data"}`);
  }
  const out: InstRow[] = [];
  for (const r of raw.data) {
    if (!r?.[0] || !r[1]) continue;
    out.push({
      code: String(r[0]).trim(),
      name: String(r[1]).trim(),
      foreignBuy: parseNum(r[2]),
      foreignSell: parseNum(r[3]),
      foreignNet: parseNum(r[4]),
      trustBuy: parseNum(r[8]),
      trustSell: parseNum(r[9]),
      trustNet: parseNum(r[10]),
    });
  }
  return out;
}

/** 上櫃 三大法人 — rocDate = 115/07/29 */
export async function fetchTpexInst(rocDate: string): Promise<InstRow[]> {
  const url = `https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php?l=zh-tw&se=EW&t=D&d=${encodeURIComponent(rocDate)}`;
  const raw = (await fetchJson(url)) as {
    stat?: string;
    tables?: { data?: unknown[][] }[];
  };
  const data = raw.tables?.[0]?.data;
  if (!Array.isArray(data) || data.length === 0) {
    // non-trading / empty — not fatal
    return [];
  }
  const out: InstRow[] = [];
  for (const r of data) {
    if (!r?.[0] || !r[1]) continue;
    // fields: 代號 名稱 外資買 賣 超 | 外資自營... | 外資合計 | 投信買 賣 超 | ...
    // Common layout: 0 code, 1 name, 2-4 foreign(no dealer), 8-10 foreign total?, 11-13 trust
    // From sample: ['006201','元大富櫃50', fb,fs,fn, 0,0,0, fb2,fs2,fn2, tb,ts,tn, ...]
    const foreignBuy = parseNum(r[2]);
    const foreignSell = parseNum(r[3]);
    const foreignNet = parseNum(r[4]);
    // trust often at 11,12,13
    const trustBuy = parseNum(r[11] ?? r[8]);
    const trustSell = parseNum(r[12] ?? r[9]);
    const trustNet = parseNum(r[13] ?? r[10]);
    out.push({
      code: String(r[0]).trim(),
      name: String(r[1]).trim(),
      foreignBuy,
      foreignSell,
      foreignNet,
      trustBuy,
      trustSell,
      trustNet,
    });
  }
  return out;
}

/** 上市每日收盤行情 */
export async function fetchTwseQuotes(dateYmd: string): Promise<QuoteRow[]> {
  const url = `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${dateYmd}&type=ALLBUT0999&response=json`;
  const raw = (await fetchJson(url)) as {
    stat?: string;
    tables?: { title?: string; fields?: string[]; data?: unknown[][] }[];
  };
  if (raw.stat !== "OK") {
    throw new Error(`TWSE MI_INDEX unavailable: ${raw.stat ?? "no data"}`);
  }
  const table = (raw.tables ?? []).find((t) =>
    (t.fields ?? []).includes("證券代號") &&
    (t.fields ?? []).includes("收盤價"),
  );
  if (!table?.data) return [];
  const out: QuoteRow[] = [];
  for (const r of table.data) {
    const close = parseNumNullable(r[8]);
    if (close == null) continue;
    const change = parseNumNullable(r[10]);
    const prev = change != null ? close - change : null;
    const changePct =
      prev != null && prev !== 0 && change != null
        ? Math.round((change / prev) * 10000) / 100
        : null;
    out.push({
      code: String(r[0]).trim(),
      name: String(r[1]).trim(),
      open: parseNumNullable(r[5]),
      high: parseNumNullable(r[6]),
      low: parseNumNullable(r[7]),
      close,
      change,
      changePct,
      volume: parseNumNullable(r[2]),
      amount: parseNumNullable(r[4]),
    });
  }
  return out;
}

/** shares → 張 (round half away from 0 to match common board display) */
export function sharesToLots(shares: number): number {
  return Math.round(shares / 1000);
}
