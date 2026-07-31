import { useState } from "react";
import { Check, Copy, CloudUpload, Webhook } from "lucide-react";

const CODE_GS = `/**
 * 台股籌碼看板 · GAS 每日推送
 * 1. 試算表工作表：外資投信、一年新高、一年新低、儀表板
 * 2. 指令碼屬性：DASHBOARD_URL、MARKET_TOKEN（可選）
 * 3. 執行 setupDailyTrigger() → 每日 15:30 自動 buildAndPush()
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
  pushToDashboard_(payload);
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
    if (r[1] && typeof r[2] === 'number' && typeof r[3] === 'number')
      holdings.push({ name: String(r[1]), sharesK: r[2], weight: r[3], change: r[4] });
    if (r[7] && r[8] && typeof r[9] === 'number')
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
  if (!base) { Logger.log('Set DASHBOARD_URL first'); return; }
  const headers = { 'Content-Type': 'application/json' };
  const token = props.getProperty('MARKET_TOKEN');
  if (token) headers['X-Market-Token'] = token;
  UrlFetchApp.fetch(base + '/api/market', {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify({ data: payload, source: 'gas' }),
    muteHttpExceptions: true,
  });
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'buildAndPush') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('buildAndPush').timeBased().everyDays(1).atHour(15).nearMinute(30)
    .inTimezone('Asia/Taipei').create();
}
`;

export function GasGuide() {
  const [copied, setCopied] = useState(false);

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
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:gap-4 sm:p-6">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-2 text-primary">
            <CloudUpload className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="section-label">Deploy</p>
            <h3 className="mt-1 text-sm font-semibold text-fg">部署到 Render</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              專案已附{" "}
              <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-primary">
                render.yaml
              </code>
              。推到 GitHub 後用 Blueprint 一鍵部署。建議設{" "}
              <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-primary">
                MARKET_UPDATE_TOKEN
              </code>{" "}
              保護每日推送。
            </p>
          </div>
        </div>
        <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:gap-4 sm:p-6">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-2 text-primary">
            <Webhook className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="section-label">API</p>
            <h3 className="mt-1 text-sm font-semibold text-fg">每日介面</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-primary">
                GET /api/market
              </code>{" "}
              讀取 ·{" "}
              <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-primary">
                POST /api/market
              </code>{" "}
              寫入。看板每 5 分鐘自動重抓。
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
            <button type="button" onClick={copy} className="btn-ghost h-10 px-3.5">
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
        <div className="panel p-5 sm:p-6 lg:col-span-2">
          <p className="section-label">Workflow</p>
          <h3 className="mt-1 text-sm font-semibold text-fg">每日更新流程</h3>
          <ol className="mt-5 space-y-4 text-sm text-muted">
            {[
              "收盤後匯出三份 Excel（外資投信／新高／新低）",
              "看板「每日更新」直接上傳，或貼入 Google 試算表",
              "GAS 觸發器執行 buildAndPush → POST /api/market",
              "看板資料日與表格自動換成最新交易日",
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
      </div>
    </div>
  );
}
