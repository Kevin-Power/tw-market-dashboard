import { useEffect, useState } from "react";
import {
  Activity,
  Check,
  Copy,
  CloudUpload,
  ExternalLink,
  FileSpreadsheet,
  HeartPulse,
  Webhook,
} from "lucide-react";

const CODE_GS = `/**
 * 台股籌碼看板 · GAS 每日推送
 * 1. 試算表工作表：外資投信、一年新高、一年新低、儀表板
 * 2. 指令碼屬性：DASHBOARD_URL（Render 網址）、MARKET_TOKEN（= 伺服器 MARKET_UPDATE_TOKEN）
 * 3. 執行 setupDailyTrigger() → 每個交易日約 15:30 自動 buildAndPush()
 */

const SHEETS = {
  foreign: '外資投信',
  highs: '一年新高',
  lows: '一年新低',
  dash: '儀表板',
};

function buildAndPush() {
  const payload = buildMarketPayload_();
  writeDashSummary_(payload);
  const res = pushToDashboard_(payload);
  Logger.log(JSON.stringify(res));
  return res;
}

function buildMarketPayload_() {
  const asOf = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  const asOfLabel = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd');
  const ss = SpreadsheetApp.getActive();
  return {
    asOf: asOf,
    asOfLabel: asOfLabel,
    foreign: {
      foreignBuy: readFlow_(ss, '外資買超', false),
      foreignSell: readFlow_(ss, '外資賣超', true),
      trustBuy: readFlow_(ss, '投信買超', false, true),
      trustSell: readFlow_(ss, '投信賣超', true, true),
      contStocks: [],
      lastDate: 0,
    },
    highs: { stocks: readHighs_(ss), series: [] },
    lows: readLows_(ss),
  };
}

function readFlow_(ss, hint, isSell, right) {
  const sh = ss.getSheetByName(SHEETS.foreign);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  const rows = [];
  var inSection = false;
  var col = right ? 7 : 0;
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (String(row[col] || row[0] || '').indexOf(hint) >= 0) { inSection = true; continue; }
    if (inSection && typeof row[col] === 'number' && row[col + 1]) {
      var buy = Number(row[col + 3]) || 0, sell = Number(row[col + 4]) || 0;
      var net = Number(row[col + 5]); if (isNaN(net)) net = buy - sell;
      rows.push({ rank: row[col], code: String(row[col + 1]), name: String(row[col + 2]), buy: buy, sell: sell, net: net });
    }
    if (rows.length >= 30) break;
  }
  return rows;
}

function readHighs_(ss) {
  const sh = ss.getSheetByName(SHEETS.highs);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  const out = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    if (!r[0] || !r[1] || typeof r[2] !== 'number') continue;
    if (String(r[0]) === '代號') continue;
    out.push({ code: String(r[0]), name: String(r[1]), price: r[2], change: Number(r[3])||0, changePct: Number(r[4])||0,
      volRank: null, volHighDays: null, vol: null, volChange: null, amountM: null, amountRank: null, amountHighDays: null });
  }
  return out;
}

function readLows_(ss) {
  const sh = ss.getSheetByName(SHEETS.lows);
  if (!sh) return { holdings: [], lows: [] };
  const values = sh.getDataRange().getValues();
  const holdings = [], lows = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    if (r[1] && typeof r[2] === 'number' && typeof r[3] === 'number' && String(r[1]) !== '股票名稱')
      holdings.push({ name: String(r[1]), sharesK: r[2], weight: r[3], change: r[4] });
    if (r[7] && r[8] && typeof r[9] === 'number' && String(r[7]) !== '代號')
      lows.push({ code: String(r[7]), name: String(r[8]), price: r[9], high: r[10], low: r[11],
        change: r[12], changePct: r[13], histHigh: r[23], fromHistHigh: r[24], histLow: r[25], fromHistLow: r[26], y10High: r[15], fromY10High: r[16] });
  }
  return { holdings: holdings.slice(0, 50), lows: lows };
}

function writeDashSummary_(payload) {
  const dash = SpreadsheetApp.getActive().getSheetByName(SHEETS.dash)
    || SpreadsheetApp.getActive().insertSheet(SHEETS.dash);
  dash.clear();
  dash.getRange(1, 1, 1, 4).setValues([['日期', '創新高', '創新低', '更新']]);
  dash.getRange(2, 1, 1, 4).setValues([[payload.asOfLabel, payload.highs.stocks.length, payload.lows.lows.length,
    Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm')]]);
}

function pushToDashboard_(payload) {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty('DASHBOARD_URL') || '').replace(/\\/$/, '');
  if (!base) { Logger.log('Set DASHBOARD_URL first'); return { error: 'no_url' }; }
  const headers = { 'Content-Type': 'application/json' };
  const token = props.getProperty('MARKET_TOKEN');
  if (token) headers['X-Market-Token'] = token;
  const res = UrlFetchApp.fetch(base + '/api/market', {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify({ data: payload, source: 'gas' }),
    muteHttpExceptions: true,
  });
  return { code: res.getResponseCode(), body: res.getContentText() };
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'buildAndPush') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('buildAndPush').timeBased().everyDays(1).atHour(15).nearMinute(30)
    .inTimezone('Asia/Taipei').create();
}
`;

type Health = {
  ok: boolean;
  asOf?: string;
  source?: string;
  storage?: string;
  counts?: { highs: number; lows: number; holdings: number };
  ms?: number;
};

const RENDER_STEPS = [
  {
    title: "GitHub 已就緒",
    body: "程式在 Kevin-Power/tw-market-dashboard（含 render.yaml）",
  },
  {
    title: "Render → New → Blueprint",
    body: "連接該 repo，確認 Build = build:render、Start = start:render",
  },
  {
    title: "部署完成後驗收",
    body: "開 /api/health → ok:true，再測 /api/export?format=xlsx",
  },
  {
    title: "（建議）接 Neon",
    body: "環境變數 DATABASE_URL，避免 Free 休眠後資料重置",
  },
  {
    title: "每日更新",
    body: "看板上傳三份 Excel，或 GAS 設 DASHBOARD_URL + MARKET_TOKEN",
  },
];

export function GasGuide() {
  const [copied, setCopied] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const j = (await res.json()) as Health;
        if (!cancelled) setHealth(j);
      } catch {
        if (!cancelled) setHealth({ ok: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(CODE_GS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
              <HeartPulse className="size-5" strokeWidth={1.75} />
            </div>
            <div>
              <p className="section-label">Live status</p>
              <h3 className="mt-1 text-base font-semibold text-fg text-display">
                系統狀態
              </h3>
              <p className="mt-1 text-sm text-muted">
                健康檢查與目前儲存後端（file = 本機／Free，postgres = Neon）
              </p>
            </div>
          </div>
          {health && (
            <div className="flex flex-wrap gap-2">
              <span
                className={
                  health.ok
                    ? "chip chip-live"
                    : "chip border-up/30 bg-up/10 text-up"
                }
              >
                <Activity className="size-3.5" />
                {health.ok ? "健康" : "異常"}
              </span>
              {health.asOf && (
                <span className="chip">
                  資料日
                  <span className="font-mono text-fg">{health.asOf}</span>
                </span>
              )}
              {health.storage && (
                <span className="chip">
                  儲存
                  <span className="font-mono text-fg">{health.storage}</span>
                </span>
              )}
              {health.counts && (
                <span className="chip">
                  高{health.counts.highs}/低{health.counts.lows}/0050{" "}
                  {health.counts.holdings}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:gap-4 sm:p-6">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-2 text-primary">
            <CloudUpload className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="section-label">Deploy</p>
            <h3 className="mt-1 text-sm font-semibold text-fg">
              部署到 Render（Blueprint）
            </h3>
            <ol className="mt-3 space-y-2.5 text-sm text-muted">
              {RENDER_STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 font-mono text-[11px] text-primary">
                    {i + 1}
                  </span>
                  <span>
                    <span className="font-medium text-fg">{s.title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-subtle">
                      {s.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <a
              href="https://github.com/Kevin-Power/tw-market-dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost mt-4 h-10 rounded-xl px-3.5 text-xs"
            >
              <ExternalLink className="size-3.5" />
              開啟 GitHub repo
            </a>
          </div>
        </div>
        <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:gap-4 sm:p-6">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-2 text-primary">
            <Webhook className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="section-label">API</p>
            <h3 className="mt-1 text-sm font-semibold text-fg">對外介面</h3>
            <ul className="mt-3 space-y-2 font-mono text-[11px] text-muted sm:text-xs">
              <li>
                <span className="text-primary">GET</span> /api/health
              </li>
              <li>
                <span className="text-primary">GET</span> /api/market
              </li>
              <li>
                <span className="text-primary">POST</span> /api/market
              </li>
              <li>
                <span className="text-primary">GET</span>{" "}
                /api/export?format=xlsx|html|summary
              </li>
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-subtle">
              客戶下載中心可複製永久連結。看板每 5 分鐘自動重抓。
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="table-shell lg:col-span-3">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div>
              <p className="section-label">Script</p>
              <h3 className="mt-0.5 text-sm font-semibold text-fg">Code.gs</h3>
            </div>
            <button
              type="button"
              onClick={() => void copy()}
              className="btn-ghost h-10 px-3.5"
            >
              {copied ? (
                <>
                  <Check className="size-4 text-down" />
                  已複製
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  複製程式碼
                </>
              )}
            </button>
          </div>
          <pre className="max-h-[560px] overflow-auto p-5 font-mono text-[11px] leading-relaxed text-muted scrollbar-thin sm:text-xs">
            {CODE_GS}
          </pre>
        </div>
        <div className="panel space-y-5 p-5 sm:p-6 lg:col-span-2">
          <div>
            <p className="section-label">Workflow</p>
            <h3 className="mt-1 text-sm font-semibold text-fg">每日更新流程</h3>
            <ol className="mt-4 space-y-3.5 text-sm text-muted">
              {[
                "收盤後匯出三份 Excel（外資投信／新高／新低）",
                "看板「每日更新」直接上傳（同源免 token）",
                "或貼入試算表 → GAS buildAndPush",
                "客戶從「下載中心」取 Excel／HTML 報告",
              ].map((text, i) => (
                <li key={text} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 font-mono text-xs font-semibold text-primary">
                    {i + 1}
                  </span>
                  <span className="pt-1 leading-relaxed">{text}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-2xl border border-dashed border-border-strong/80 bg-bg/30 p-3.5 text-xs leading-relaxed text-subtle">
            <div className="mb-1.5 flex items-center gap-1.5 font-medium text-muted">
              <FileSpreadsheet className="size-3.5" />
              指令碼屬性
            </div>
            DASHBOARD_URL = https://你的服務.onrender.com
            <br />
            MARKET_TOKEN = Render 環境變數 MARKET_UPDATE_TOKEN
          </div>
        </div>
      </div>
    </div>
  );
}
