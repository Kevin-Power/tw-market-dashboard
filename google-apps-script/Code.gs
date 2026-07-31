/**
 * 台股籌碼看板 · Google Apps Script 每日更新
 *
 * 1. 試算表工作表：外資投信、一年新高、一年新低、儀表板
 * 2. 指令碼屬性：
 *      DASHBOARD_URL = https://你的服務.onrender.com
 *      MARKET_TOKEN  = Render 環境變數 MARKET_UPDATE_TOKEN
 * 3. 執行 setupDailyTrigger() 一次
 * 4. 手動：buildAndPush()
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
  const result = pushToDashboard_(payload);
  Logger.log(JSON.stringify(result));
  return result;
}

function buildDashboard() {
  return buildAndPush();
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
    if (String(row[col] || row[0] || '').indexOf(hint) >= 0) {
      inSection = true;
      continue;
    }
    if (inSection && typeof row[col] === 'number' && row[col + 1]) {
      var buy = Number(row[col + 3]) || 0;
      var sell = Number(row[col + 4]) || 0;
      var net = Number(row[col + 5]);
      if (isNaN(net)) net = buy - sell;
      rows.push({
        rank: row[col],
        code: String(row[col + 1]),
        name: String(row[col + 2]),
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
    var r = values[i];
    if (!r[0] || !r[1] || typeof r[2] !== 'number') continue;
    if (String(r[0]) === '代號') continue;
    out.push({
      code: String(r[0]),
      name: String(r[1]),
      price: r[2],
      change: Number(r[3]) || 0,
      changePct: Number(r[4]) || 0,
      volRank: null,
      volHighDays: null,
      vol: null,
      volChange: null,
      amountM: null,
      amountRank: null,
      amountHighDays: null,
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
    var r = values[i];
    if (r[1] && typeof r[2] === 'number' && typeof r[3] === 'number' && String(r[1]) !== '股票名稱') {
      holdings.push({ name: String(r[1]), sharesK: r[2], weight: r[3], change: r[4] });
    }
    if (r[7] && r[8] && typeof r[9] === 'number' && String(r[7]) !== '代號') {
      lows.push({
        code: String(r[7]),
        name: String(r[8]),
        price: r[9],
        high: r[10],
        low: r[11],
        change: r[12],
        changePct: r[13],
        histHigh: r[23],
        fromHistHigh: r[24],
        histLow: r[25],
        fromHistLow: r[26],
        y10High: r[15],
        fromY10High: r[16],
      });
    }
  }
  return { holdings: holdings.slice(0, 50), lows: lows };
}

function writeDashSummary_(payload) {
  const dash =
    SpreadsheetApp.getActive().getSheetByName(SHEETS.dash) ||
    SpreadsheetApp.getActive().insertSheet(SHEETS.dash);
  dash.clear();
  dash.getRange(1, 1, 1, 4).setValues([['日期', '創新高', '創新低', '更新']]);
  dash.getRange(2, 1, 1, 4).setValues([
    [
      payload.asOfLabel,
      payload.highs.stocks.length,
      payload.lows.lows.length,
      Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy/MM/dd HH:mm'),
    ],
  ]);
}

function pushToDashboard_(payload) {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty('DASHBOARD_URL') || '').replace(/\/$/, '');
  if (!base) {
    Logger.log('Set DASHBOARD_URL first');
    return { error: 'no_url' };
  }
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
  ScriptApp.newTrigger('buildAndPush')
    .timeBased()
    .everyDays(1)
    .atHour(15)
    .nearMinute(30)
    .inTimezone('Asia/Taipei')
    .create();
}
