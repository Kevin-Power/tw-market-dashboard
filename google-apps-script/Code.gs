/**
 * 台股籌碼看板 · Google Apps Script 每日更新
 *
 * 使用方式：
 * 1. 建立 Google 試算表，工作表：外資投信、一年新高、一年新低、儀表板
 * 2. 擴充功能 → Apps Script，貼上本檔
 * 3. 腳本屬性設定（檔案 → 專案設定 → 指令碼屬性）：
 *      DASHBOARD_URL = https://你的看板網域  （不要結尾斜線）
 *      MARKET_TOKEN  = 與伺服器 MARKET_UPDATE_TOKEN 相同（可選）
 * 4. 每日收盤後把 Excel 貼入對應工作表
 * 5. 執行 setupDailyTrigger() 一次 → 每個交易日 15:30 自動 buildAndPush()
 * 6. 手動測試：執行 buildAndPush()
 */

const SHEETS = {
  foreign: '外資投信',
  highs: '一年新高',
  lows: '一年新低',
  dash: '儀表板',
};

/** 主流程：彙整 → 試算表摘要 → 推送到看板 API */
function buildAndPush() {
  const payload = buildMarketPayload_();
  writeDashSummary_(payload);
  appendHistory_(payload.asOfLabel, payload.highs.stocks.length, payload.lows.lows.length);
  const result = pushToDashboard_(payload);
  Logger.log('Pushed ' + payload.asOf + ' → ' + JSON.stringify(result));
  return result;
}

/** 相容舊名稱 */
function buildDashboard() {
  return buildAndPush();
}

function buildMarketPayload_() {
  const ss = SpreadsheetApp.getActive();
  const asOf = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  const asOfLabel = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd');

  const foreignBuy = readFlowTable_(ss, SHEETS.foreign, '外資買超', false);
  const foreignSell = readFlowTable_(ss, SHEETS.foreign, '外資賣超', true);
  const trustBuy = readFlowTable_(ss, SHEETS.foreign, '投信買超', false, true);
  const trustSell = readFlowTable_(ss, SHEETS.foreign, '投信賣超', true, true);

  const highStocks = readHighs_(ss);
  const lowPack = readLows_(ss);
  const series = readSeries_(ss);
  const excelSerial = Math.round((new Date(asOf + 'T00:00:00+08:00').getTime() / 86400000) + 25569);

  return {
    asOf: asOf,
    asOfLabel: asOfLabel,
    foreign: {
      foreignBuy: foreignBuy,
      foreignSell: foreignSell,
      trustBuy: trustBuy,
      trustSell: trustSell,
      contStocks: [],
      lastDate: excelSerial,
    },
    highs: {
      stocks: highStocks,
      series: series,
    },
    lows: {
      holdings: lowPack.holdings,
      lows: lowPack.lows,
    },
  };
}

function readFlowTable_(ss, sheetName, sectionHint, isSell, useRightBlock) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  const rows = [];
  let inSection = false;
  const rankCol = useRightBlock ? 7 : 0;
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var cell = String(row[rankCol] || row[0] || '');
    if (cell.indexOf(sectionHint) >= 0) {
      inSection = true;
      continue;
    }
    if (inSection && (String(row[0]).indexOf('買超') >= 0 || String(row[0]).indexOf('賣超') >= 0) && cell.indexOf(sectionHint) < 0) {
      if (String(row[0]).indexOf(sectionHint) < 0 && rows.length) break;
    }
    if (inSection && typeof row[rankCol] === 'number' && row[rankCol + 1]) {
      var buy = Number(row[rankCol + 3]) || 0;
      var sell = Number(row[rankCol + 4]) || 0;
      var net = Number(row[rankCol + 5]);
      if (isNaN(net)) net = buy - sell;
      rows.push({
        rank: row[rankCol],
        code: String(row[rankCol + 1]),
        name: String(row[rankCol + 2]),
        buy: buy,
        sell: sell,
        net: net,
      });
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
    var row = values[i];
    if (!row[0] || !row[1] || typeof row[2] !== 'number') continue;
    if (String(row[0]) === '代號') continue;
    out.push({
      code: String(row[0]),
      name: String(row[1]),
      price: row[2],
      change: Number(row[3]) || 0,
      changePct: Number(row[4]) || 0,
      volRank: numOrNull_(row[6]),
      volHighDays: numOrNull_(row[7]),
      vol: numOrNull_(row[8]),
      volChange: numOrNull_(row[9]),
      amountM: numOrNull_(row[11]),
      amountRank: numOrNull_(row[12]),
      amountHighDays: numOrNull_(row[13]),
    });
  }
  return out;
}

function readLows_(ss) {
  const sh = ss.getSheetByName(SHEETS.lows);
  if (!sh) return { holdings: [], lows: [] };
  const values = sh.getDataRange().getValues();
  const holdings = [];
  const lows = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (row[1] && typeof row[2] === 'number' && typeof row[3] === 'number' && String(row[1]) !== '股票名稱') {
      holdings.push({
        name: String(row[1]),
        sharesK: row[2],
        weight: row[3],
        change: row[4],
      });
    }
    if (row[7] && row[8] && typeof row[9] === 'number' && String(row[7]) !== '代號') {
      lows.push({
        code: String(row[7]),
        name: String(row[8]),
        price: row[9],
        high: numOrNull_(row[10]),
        low: numOrNull_(row[11]),
        change: numOrNull_(row[12]),
        changePct: numOrNull_(row[13]),
        histHigh: numOrNull_(row[23]),
        fromHistHigh: numOrNull_(row[24]),
        histLow: numOrNull_(row[25]),
        fromHistLow: numOrNull_(row[26]),
        y10High: numOrNull_(row[15]),
        fromY10High: numOrNull_(row[16]),
      });
    }
  }
  return { holdings: holdings.slice(0, 50), lows: lows };
}

function readSeries_(ss) {
  // Optional sheet「歷史家數」
  const sh = ss.getSheetByName('歷史家數');
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  const out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[0] || row[1] === '' || row[1] == null) continue;
    var d = row[0];
    var iso = d instanceof Date
      ? Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd')
      : String(d).replace(/\//g, '-');
    var excel = Math.round((new Date(iso + 'T00:00:00+08:00').getTime() / 86400000) + 25569);
    out.push({ date: iso, excel: excel, count: Number(row[1]) || 0 });
  }
  return out.slice(-120);
}

function numOrNull_(v) {
  if (v === '' || v == null) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function writeDashSummary_(payload) {
  const ss = SpreadsheetApp.getActive();
  const dash = ss.getSheetByName(SHEETS.dash) || ss.insertSheet(SHEETS.dash);
  dash.clear();
  dash.getRange(1, 1, 1, 4).setValues([['日期', '創新高家數', '創新低家數', '更新時間']]);
  dash.getRange(2, 1, 1, 4).setValues([[
    payload.asOfLabel,
    payload.highs.stocks.length,
    payload.lows.lows.length,
    Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm'),
  ]]);
  writeTop_(dash, 4, '外資買超 Top10', payload.foreign.foreignBuy.slice(0, 10));
  writeTop_(dash, 17, '投信買超 Top10', payload.foreign.trustBuy.slice(0, 10));
}

function writeTop_(sheet, startRow, title, list) {
  sheet.getRange(startRow, 1).setValue(title).setFontWeight('bold');
  sheet.getRange(startRow + 1, 1, 1, 4).setValues([['排名', '代號', '名稱', '買賣超(張)']]);
  if (!list.length) return;
  const body = list.map(function (r) {
    return [r.rank, r.code, r.name, r.net];
  });
  sheet.getRange(startRow + 2, 1, body.length, 4).setValues(body);
}

function appendHistory_(asOfLabel, highCount, lowCount) {
  const ss = SpreadsheetApp.getActive();
  const name = '歷史家數';
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(['日期', '創新高', '創新低']);
  }
  sh.appendRow([asOfLabel, highCount, lowCount]);
}

function pushToDashboard_(payload) {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty('DASHBOARD_URL') || '').replace(/\/$/, '');
  if (!base) {
    Logger.log('DASHBOARD_URL not set — skip push (dashboard summary still written)');
    return { skipped: true };
  }
  const token = props.getProperty('MARKET_TOKEN') || '';
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Market-Token'] = token;

  const res = UrlFetchApp.fetch(base + '/api/market', {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify({ data: payload, source: 'gas' }),
    muteHttpExceptions: true,
  });
  return { status: res.getResponseCode(), body: res.getContentText() };
}

/** 網頁應用：?format=json 回傳看板 JSON，否則簡易 HTML */
function doGet(e) {
  const payload = buildMarketPayload_();
  if (e && e.parameter && e.parameter.format === 'json') {
    return ContentService
      .createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const html = '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"/>'
    + '<meta name="viewport" content="width=device-width, initial-scale=1"/>'
    + '<title>台股籌碼看板</title>'
    + '<style>body{font-family:system-ui,sans-serif;background:#0a0b0d;color:#e8eaef;margin:0;padding:24px}'
    + '.card{background:#12141a;border:1px solid #2a2f3d;border-radius:16px;padding:20px;margin-bottom:16px}'
    + 'h1{font-size:1.25rem;margin:0 0 4px}.muted{color:#8b92a5;font-size:.85rem}'
    + '.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}'
    + '.kpi{font-size:2rem;font-weight:600}.up{color:#e85d5d}.down{color:#3db88a}</style></head><body>'
    + '<div class="card"><h1>台股籌碼看板</h1><div class="muted">資料日 ' + payload.asOfLabel
    + ' · 每日更新</div></div>'
    + '<div class="grid"><div class="card"><div class="muted">創新高家數</div><div class="kpi up">'
    + payload.highs.stocks.length + '</div></div><div class="card"><div class="muted">創新低家數</div><div class="kpi down">'
    + payload.lows.lows.length + '</div></div></div>'
    + '<div class="card muted">完整看板請使用 Web App；本頁為 GAS 摘要。</div></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle('台股籌碼看板')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'buildDashboard' || fn === 'buildAndPush') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('buildAndPush')
    .timeBased()
    .everyDays(1)
    .atHour(15)
    .nearMinute(30)
    .inTimezone('Asia/Taipei')
    .create();
  Logger.log('Daily trigger set for buildAndPush @ 15:30 Asia/Taipei');
}
