import { useEffect, useState } from "react";
import {
  Activity,
  Check,
  Copy,
  CloudUpload,
  ExternalLink,
  FileSpreadsheet,
  HeartPulse,
  Radar,
  Webhook,
} from "lucide-react";

const CODE_GS = `/**
 * 台股籌碼看板 · 每日自動抓取（不必貼 Excel）
 * 指令碼屬性：
 *   DASHBOARD_URL = https://你的服務.onrender.com
 *   MARKET_TOKEN  = Render MARKET_UPDATE_TOKEN
 * 執行 setupDailyTrigger() 一次 → 每日 16:00 台北時間
 */

function triggerLiveFetch() {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty('DASHBOARD_URL') || '').replace(/\\/$/, '');
  if (!base) { Logger.log('Set DASHBOARD_URL'); return; }
  const headers = { 'Content-Type': 'application/json' };
  const token = props.getProperty('MARKET_TOKEN');
  if (token) {
    headers['X-Market-Token'] = token;
    headers['X-Cron-Secret'] = token;
  }
  const res = UrlFetchApp.fetch(base + '/api/cron/daily?force=1', {
    method: 'post', headers: headers, muteHttpExceptions: true,
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'triggerLiveFetch' || t.getHandlerFunction() === 'buildAndPush')
      ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('triggerLiveFetch').timeBased().everyDays(1)
    .atHour(16).nearMinute(0).inTimezone('Asia/Taipei').create();
}
`;

type Health = {
  ok: boolean;
  asOf?: string;
  source?: string;
  storage?: string;
  counts?: { highs: number; lows: number; holdings: number };
};

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
      <div className="panel border-primary/20 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
            <Radar className="size-5" strokeWidth={1.75} />
          </div>
          <div>
            <p className="section-label">Daily auto</p>
            <h3 className="mt-1 text-base font-semibold text-fg text-display">
              每天自動產生新交易日籌碼
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              伺服器呼叫證交所 T86、櫃買三大法人與收盤行情，寫入看板。
              也可在「每日更新」按「立即抓取」。外部排程請打{" "}
              <code className="rounded bg-surface-2 px-1 font-mono text-[11px] text-primary">
                POST /api/cron/daily?force=1
              </code>
              （帶 token）。
            </p>
          </div>
        </div>
      </div>

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
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <CloudUpload className="mt-0.5 size-5 text-primary" />
            <div>
              <p className="section-label">Render</p>
              <h3 className="mt-1 text-sm font-semibold text-fg">
                Blueprint 一鍵部署
              </h3>
              <p className="mt-1.5 text-sm text-muted">
                連接 GitHub{" "}
                <code className="text-xs text-primary">
                  Kevin-Power/tw-market-dashboard
                </code>
                ，健康檢查{" "}
                <code className="text-xs text-primary">/api/health</code>。
              </p>
              <a
                href="https://github.com/Kevin-Power/tw-market-dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost mt-3 h-9 rounded-xl px-3 text-xs"
              >
                <ExternalLink className="size-3.5" />
                開啟 repo
              </a>
            </div>
          </div>
        </div>
        <div className="panel p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <Webhook className="mt-0.5 size-5 text-primary" />
            <div>
              <p className="section-label">API</p>
              <ul className="mt-2 space-y-1.5 font-mono text-[11px] text-muted">
                <li>
                  <span className="text-primary">POST</span> /api/cron/daily
                </li>
                <li>
                  <span className="text-primary">GET</span> /api/market
                </li>
                <li>
                  <span className="text-primary">GET</span> /api/export?format=xlsx
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="table-shell lg:col-span-3">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div>
              <p className="section-label">Script</p>
              <h3 className="mt-0.5 text-sm font-semibold text-fg">
                GAS 每日 16:00 觸發
              </h3>
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
                  複製
                </>
              )}
            </button>
          </div>
          <pre className="max-h-[420px] overflow-auto p-5 font-mono text-[11px] leading-relaxed text-muted scrollbar-thin sm:text-xs">
            {CODE_GS}
          </pre>
        </div>
        <div className="panel space-y-4 p-5 sm:p-6 lg:col-span-2">
          <div>
            <p className="section-label">Checklist</p>
            <ol className="mt-3 space-y-3 text-sm text-muted">
              {[
                "Render 部署完成，拿到網址",
                "GAS 設 DASHBOARD_URL + MARKET_TOKEN",
                "執行 setupDailyTrigger()",
                "或看板「每日更新 → 立即抓取」",
              ].map((t, i) => (
                <li key={t} className="flex gap-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 font-mono text-[11px] text-primary">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 leading-relaxed">{t}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-2xl border border-dashed border-border-strong/80 bg-bg/30 p-3.5 text-xs leading-relaxed text-subtle">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-muted">
              <FileSpreadsheet className="size-3.5" />
              說明
            </div>
            外資／投信為官方當日完整資料。一年新高／新低會隨日線歷史累積越來越準；0050
            權重可先用 Excel 覆蓋一次後沿用。
          </div>
        </div>
      </div>
    </div>
  );
}
