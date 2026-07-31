import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Link2,
  Radar,
  Rocket,
} from "lucide-react";

type Health = {
  ok?: boolean;
  asOf?: string;
  source?: string;
  storage?: string;
};

const GH = "https://github.com/Kevin-Power/tw-market-dashboard";
const RENDER_BLUEPRINT = "https://dashboard.render.com/select-repo?type=blueprint";

function gasScript(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "") || "https://你的服務.onrender.com";
  return `/**
 * 台股籌碼看板 · 每日 16:00 自動抓取（台北時間）
 * 1. 擴充功能 → Apps Script → 貼上本檔
 * 2. 專案設定 → 指令碼屬性：
 *      DASHBOARD_URL = ${base}
 *      MARKET_TOKEN  = （Render 環境變數 MARKET_UPDATE_TOKEN）
 * 3. 執行 setupDailyTrigger() 一次，授權即可
 */

function triggerLiveFetch() {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty('DASHBOARD_URL') || '').replace(/\\/$/, '');
  if (!base) {
    throw new Error('請先設定指令碼屬性 DASHBOARD_URL');
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
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
  return res.getContentText();
}

function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'triggerLiveFetch' || fn === 'buildAndPush') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('triggerLiveFetch')
    .timeBased()
    .everyDays(1)
    .atHour(16)
    .nearMinute(0)
    .inTimezone('Asia/Taipei')
    .create();
  Logger.log('已設定：每日 16:00 Asia/Taipei → triggerLiveFetch');
}
`;
}

export function SetupWizard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("tw-setup-done") || "{}") as Record<
        string,
        boolean
      >;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const j = (await r.json()) as Health;
        if (!c) setHealth(j);
      } catch {
        if (!c) setHealth({ ok: false });
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("tw-setup-done", JSON.stringify(done));
  }, [done]);

  const cleanUrl = useMemo(() => {
    let u = url.trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    return u.replace(/\/$/, "");
  }, [url]);

  const cronUrl = cleanUrl
    ? `${cleanUrl}/api/cron/daily?force=1`
    : "https://你的服務.onrender.com/api/cron/daily?force=1";
  const healthUrl = cleanUrl
    ? `${cleanUrl}/api/health`
    : "https://你的服務.onrender.com/api/health";
  const exportUrl = cleanUrl
    ? `${cleanUrl}/api/export?format=xlsx`
    : "https://你的服務.onrender.com/api/export?format=xlsx";

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  }

  function toggle(id: string) {
    setDone((d) => ({ ...d, [id]: !d[id] }));
  }

  const steps = [
    {
      id: "github",
      title: "確認 GitHub 程式",
      body: "完整程式已在公開 repo，Render 會直接讀取。",
      action: (
        <a
          href={GH}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost h-9 rounded-xl px-3 text-xs"
        >
          <ExternalLink className="size-3.5" />
          開啟 GitHub
        </a>
      ),
    },
    {
      id: "render",
      title: "部署到 Render（約 5–8 分鐘）",
      body: "New → Blueprint → 選 tw-market-dashboard → Apply。等 Build 變綠。",
      action: (
        <a
          href={RENDER_BLUEPRINT}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary h-9 rounded-xl px-3 text-xs"
        >
          <Rocket className="size-3.5" />
          開啟 Render Blueprint
        </a>
      ),
    },
    {
      id: "url",
      title: "貼上你的 Render 網址",
      body: "部署完成後長得像 https://tw-market-dashboard-xxxx.onrender.com",
      action: null,
    },
    {
      id: "verify",
      title: "驗收三個網址",
      body: "health 要 ok:true；首頁有看板；xlsx 可下載。",
      action: null,
    },
    {
      id: "auto",
      title: "設定每天自動抓籌碼",
      body: "用 GAS 或 cron-job.org 每天 16:00 打 /api/cron/daily。也可先在看板按「立即抓取」。",
      action: null,
    },
  ];

  const progress =
    steps.filter((s) => done[s.id]).length / steps.length;

  return (
    <div className="space-y-4">
      <div className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-label">Guided setup</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-fg text-display">
              完整上線導引
            </h2>
            <p className="mt-1 text-sm text-muted">
              照步驟勾選即可。程式與自動抓取都已備好，你只需部署與排程。
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular text-primary text-display">
              {Math.round(progress * 100)}%
            </div>
            <div className="text-[11px] text-subtle">完成度</div>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.max(4, progress * 100)}%` }}
          />
        </div>
        {health?.ok && (
          <p className="mt-3 text-xs text-subtle">
            目前預覽／實例：資料日{" "}
            <span className="font-mono text-muted">{health.asOf}</span>
            {" · "}
            {health.source}
            {" · "}
            {health.storage}
          </p>
        )}
      </div>

      <ol className="space-y-3">
        {steps.map((s, i) => {
          const isDone = !!done[s.id];
          return (
            <li key={s.id} className="panel p-4 sm:p-5">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  className="mt-0.5 shrink-0 text-primary"
                  title="標記完成"
                >
                  {isDone ? (
                    <CheckCircle2 className="size-6" />
                  ) : (
                    <Circle className="size-6 text-subtle" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-subtle">
                      步驟 {i + 1}
                    </span>
                    <h3
                      className={`text-sm font-semibold ${isDone ? "text-muted line-through" : "text-fg"}`}
                    >
                      {s.title}
                    </h3>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {s.body}
                  </p>
                  {s.action && <div className="mt-3">{s.action}</div>}

                  {s.id === "url" && (
                    <div className="mt-3 space-y-2">
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://tw-market-dashboard-xxxx.onrender.com"
                        className="h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none ring-primary/30 placeholder:text-subtle focus:ring-2"
                      />
                      <p className="text-[11px] text-subtle">
                        貼上後下方會產生你專用的健康檢查、下載、排程連結與
                        GAS 程式。
                      </p>
                    </div>
                  )}

                  {s.id === "verify" && (
                    <div className="mt-3 space-y-2">
                      {[
                        ["health", "健康檢查", healthUrl],
                        ["xlsx", "客戶 Excel", exportUrl],
                        ["cron", "每日排程 API", cronUrl],
                      ].map(([key, label, href]) => (
                        <div
                          key={key}
                          className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2/50 p-3 sm:flex-row sm:items-center"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-fg">
                              {label}
                            </div>
                            <code className="mt-0.5 block truncate font-mono text-[11px] text-subtle">
                              {href}
                            </code>
                          </div>
                          <div className="flex gap-2">
                            <a
                              href={href.startsWith("http") ? href : undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-ghost h-9 rounded-lg px-3 text-xs"
                            >
                              <Link2 className="size-3.5" />
                              開啟
                            </a>
                            <button
                              type="button"
                              className="btn-ghost h-9 rounded-lg px-3 text-xs"
                              onClick={() => void copy(key, href)}
                            >
                              {copied === key ? (
                                <Check className="size-3.5 text-down" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                              複製
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {s.id === "auto" && (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted">
                        <div className="mb-1 flex items-center gap-1.5 font-medium text-primary">
                          <Radar className="size-3.5" />
                          推薦：Google 試算表 + Apps Script（免費）
                        </div>
                        新建空白試算表 → 擴充功能 → Apps Script →
                        貼上下方程式 → 設指令碼屬性 → 執行{" "}
                        <code className="text-primary">setupDailyTrigger</code>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="btn-ghost h-9 rounded-xl px-3 text-xs"
                          onClick={() =>
                            void copy("gas", gasScript(cleanUrl))
                          }
                        >
                          {copied === "gas" ? (
                            <>
                              <Check className="size-3.5 text-down" />
                              已複製 GAS
                            </>
                          ) : (
                            <>
                              <Copy className="size-3.5" />
                              複製 GAS 程式
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="max-h-56 overflow-auto rounded-xl border border-border bg-bg/40 p-3 font-mono text-[10px] leading-relaxed text-subtle scrollbar-thin sm:text-[11px]">
                        {gasScript(cleanUrl)}
                      </pre>
                      <p className="text-[11px] text-subtle">
                        替代方案：到 cron-job.org 新增每日 16:00 請求{" "}
                        <code className="text-primary">{cronUrl}</code>
                        ，Header 加{" "}
                        <code className="text-primary">X-Market-Token</code>
                        。
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
