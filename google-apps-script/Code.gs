/**
 * 台股籌碼看板 · 每日自動觸發
 *
 * 推薦（自動產生籌碼，不必貼 Excel）：
 *   1. 指令碼屬性 DASHBOARD_URL、MARKET_TOKEN
 *   2. 執行 setupDailyTrigger() → 每個交易日 16:00 呼叫 /api/cron/daily
 *
 * 舊流程（從試算表推送）：buildAndPush()
 */

function triggerLiveFetch() {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty('DASHBOARD_URL') || '').replace(/\/$/, '');
  if (!base) {
    Logger.log('Set DASHBOARD_URL first');
    return { error: 'no_url' };
  }
  const headers = { 'Content-Type': 'application/json' };
  const token = props.getProperty('MARKET_TOKEN');
  if (token) {
    headers['X-Market-Token'] = token;
    headers['X-Cron-Secret'] = token;
  }
  const res = UrlFetchApp.fetch(base + '/api/cron/daily?force=1', {
    method: 'post',
    headers: headers,
    muteHttpExceptions: true,
  });
  const body = res.getContentText();
  Logger.log(res.getResponseCode() + ' ' + body);
  return { code: res.getResponseCode(), body: body };
}

/** 相容：優先走證交所自動抓取 */
function buildAndPush() {
  return triggerLiveFetch();
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'buildAndPush' || fn === 'triggerLiveFetch') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // 台北 16:00 — 盤後資料多半已齊
  ScriptApp.newTrigger('triggerLiveFetch')
    .timeBased()
    .everyDays(1)
    .atHour(16)
    .nearMinute(0)
    .inTimezone('Asia/Taipei')
    .create();
  Logger.log('Daily triggerLiveFetch @ 16:00 Asia/Taipei');
}
