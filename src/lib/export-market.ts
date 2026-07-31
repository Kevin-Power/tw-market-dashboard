/**
 * Client / server-safe export builders for market dashboard deliverables.
 * CSV uses UTF-8 BOM so Excel on Windows opens Chinese correctly.
 */
import * as XLSX from "xlsx";
import type { FlowRow, MarketData } from "@/data/types";
import { computeInsights } from "@/lib/market-insights";

export type ExportFormat =
  | "xlsx"
  | "json"
  | "csv-bundle"
  | "summary"
  | "html"
  | "html-email";

export type ExportArtifact = {
  filename: string;
  mime: string;
  /** utf-8 text, or base64 for binary xlsx */
  body: string;
  encoding?: "utf8" | "base64";
};

function dateStamp(asOf: string): string {
  return asOf.replace(/-/g, "");
}

function flowSheet(rows: FlowRow[], title: string) {
  return [
    ["報表", title],
    ["資料說明", "單位：張（1 張 = 1,000 股）；買賣超取自原始 Excel 淨額欄"],
    ["排名", "代號", "名稱", "買進(張)", "賣出(張)", "買賣超(張)"],
    ...rows.map((r) => [r.rank, r.code, r.name, r.buy, r.sell, r.net]),
  ];
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function producedAt(): string {
  return new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
}

/** Professional text briefing for clients */
export function buildSummaryText(data: MarketData): string {
  const ins = computeInsights(data);
  const lines = [
    "════════════════════════════════════════════════",
    "  台股籌碼日報 · Institutional Flow Briefing",
    "════════════════════════════════════════════════",
    "",
    `文件編號　　：TWFLOW-${dateStamp(data.asOf)}`,
    `資料日　　　：${data.asOfLabel}`,
    `產出時間　　：${producedAt()}（台北時間）`,
    `文件性質　　：機構研究用資訊彙整（非投資建議）`,
    `市場溫度　　：${ins.temperatureLabel} — ${ins.temperatureNote}`,
    "",
    "── 研究摘要 ──────────────────────────────────",
    ...ins.researchNotes.map((n, i) => `${i + 1}. ${n}`),
    "",
    "── 關鍵指標 ──────────────────────────────────",
    `創新高家數　：${ins.highCount} 檔` +
      (ins.seriesDelta == null
        ? ""
        : ins.seriesDelta === 0
          ? "（與前一交易日持平）"
          : ins.seriesDelta > 0
            ? `（較前一日 +${ins.seriesDelta}）`
            : `（較前一日 ${ins.seriesDelta}）`),
    `創新低家數　：${ins.lowCount} 檔`,
    `新高／新低比：${ins.highLowRatio ?? "—"}`,
    `近5日新高均：${ins.seriesAvg5 != null ? ins.seriesAvg5.toFixed(1) : "—"} 檔`,
    `0050 持股　：${ins.holdingsCount} 檔 · 前十大權重 ${ins.top10Weight}%`,
    `同時買進　　：${ins.contCount} 檔`,
    "",
    "── 籌碼合計（前 30 名） ──────────────────────",
    `外資買超合計：+${ins.foreignBuyTopSum.toLocaleString("zh-TW")} 張`,
    `外資賣超合計：${(-ins.foreignSellTopSum).toLocaleString("zh-TW")} 張`,
    `外資淨額估計：${ins.foreignNetTop >= 0 ? "+" : ""}${ins.foreignNetTop.toLocaleString("zh-TW")} 張`,
    `投信買超合計：+${ins.trustBuyTopSum.toLocaleString("zh-TW")} 張`,
    `投信賣超合計：${(-ins.trustSellTopSum).toLocaleString("zh-TW")} 張`,
    `投信淨額估計：${ins.trustNetTop >= 0 ? "+" : ""}${ins.trustNetTop.toLocaleString("zh-TW")} 張`,
    "",
    "── 外資籌碼 ──────────────────────────────────",
    ins.topForeignBuy
      ? `買超冠軍　　：${ins.topForeignBuy.name}（${ins.topForeignBuy.code}）+${ins.topForeignBuy.net.toLocaleString("zh-TW")} 張`
      : "買超冠軍　　：—",
    ins.topForeignSell
      ? `賣超冠軍　　：${ins.topForeignSell.name}（${ins.topForeignSell.code}）${ins.topForeignSell.net.toLocaleString("zh-TW")} 張`
      : "賣超冠軍　　：—",
    "",
    "── 投信籌碼 ──────────────────────────────────",
    ins.topTrustBuy
      ? `買超冠軍　　：${ins.topTrustBuy.name}（${ins.topTrustBuy.code}）+${ins.topTrustBuy.net.toLocaleString("zh-TW")} 張`
      : "買超冠軍　　：—",
    ins.topTrustSell
      ? `賣超冠軍　　：${ins.topTrustSell.name}（${ins.topTrustSell.code}）${ins.topTrustSell.net.toLocaleString("zh-TW")} 張`
      : "賣超冠軍　　：—",
    "",
    "── 外資投信同時買進 ──────────────────────────",
    data.foreign.contStocks.length
      ? data.foreign.contStocks.map((n, i) => `  ${i + 1}. ${n}`).join("\n")
      : "  （無）",
    "",
    "── 今日創新高 ────────────────────────────────",
    ...data.highs.stocks.map(
      (s, i) =>
        `  ${i + 1}. ${s.code} ${s.name}  成交 ${s.price}  漲跌 ${s.change >= 0 ? "+" : ""}${s.change}（${s.changePct >= 0 ? "+" : ""}${s.changePct}%）`,
    ),
    data.highs.stocks.length === 0 ? "  （無）" : "",
    "",
    "── 0050 前十大權重 ───────────────────────────",
    ...data.lows.holdings.slice(0, 10).map(
      (h, i) =>
        `  ${i + 1}. ${h.name}  ${h.weight.toFixed(2)}%  持股 ${h.sharesK.toLocaleString("zh-TW")} 千股`,
    ),
    "",
    "── 外資買超 Top10 ────────────────────────────",
    ...data.foreign.foreignBuy.slice(0, 10).map(
      (r) =>
        `  ${r.rank}. ${r.code} ${r.name}  +${r.net.toLocaleString("zh-TW")} 張`,
    ),
    "",
    "── 外資賣超 Top10 ────────────────────────────",
    ...data.foreign.foreignSell.slice(0, 10).map(
      (r) =>
        `  ${r.rank}. ${r.code} ${r.name}  ${r.net.toLocaleString("zh-TW")} 張`,
    ),
    "",
    "── 投信買超 Top10 ────────────────────────────",
    ...data.foreign.trustBuy.slice(0, 10).map(
      (r) =>
        `  ${r.rank}. ${r.code} ${r.name}  +${r.net.toLocaleString("zh-TW")} 張`,
    ),
    "",
    "── 投信賣超 Top10 ────────────────────────────",
    ...data.foreign.trustSell.slice(0, 10).map(
      (r) =>
        `  ${r.rank}. ${r.code} ${r.name}  ${r.net.toLocaleString("zh-TW")} 張`,
    ),
    "",
    "── 方法論與附註 ──────────────────────────────",
    "1. 買賣超單位為「張」（1 張 = 1,000 股）。",
    "2. 淨額採原始 Excel「買賣超」欄，非買進減賣出之四捨五入差。",
    "3. 台股習慣：漲紅跌綠。",
    "4. 前 30 名合計僅供結構觀察，非全市場總額。",
    "5. 本文件僅供資訊彙整與內部研究參考，不構成任何投資建議。",
    "6. 完整明細請下載 Excel 完整報告（含 10 個工作表）。",
    "",
    "— 台股籌碼看板 · Professional Research Pack —",
  ];
  return lines.filter((l) => l !== undefined).join("\n");
}

/** Standalone HTML client report (print → PDF) */
export function buildHtmlReport(data: MarketData): string {
  const ins = computeInsights(data);
  const stamp = dateStamp(data.asOf);
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const rowFlow = (rows: FlowRow[], n = 10) =>
    rows
      .slice(0, n)
      .map(
        (r) =>
          `<tr><td class="n">${r.rank}</td><td class="mono">${esc(r.code)}</td><td>${esc(r.name)}</td><td class="n">${r.buy.toLocaleString("zh-TW")}</td><td class="n">${r.sell.toLocaleString("zh-TW")}</td><td class="n net">${r.net >= 0 ? "+" : ""}${r.net.toLocaleString("zh-TW")}</td></tr>`,
      )
      .join("");

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>台股籌碼日報 ${esc(data.asOfLabel)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Noto Sans TC", "Segoe UI", system-ui, sans-serif; color: #1a1d24; background: #f4f5f7; line-height: 1.55; font-size: 14px; }
  .wrap { max-width: 920px; margin: 0 auto; padding: 32px 20px 64px; }
  .sheet { background: #fff; border: 1px solid #e2e5eb; border-radius: 16px; padding: 28px 28px 32px; box-shadow: 0 8px 30px -18px rgba(0,0,0,.18); }
  header { border-bottom: 2px solid #0f766e; padding-bottom: 18px; margin-bottom: 22px; }
  .kicker { font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #0f766e; }
  h1 { margin: 6px 0 0; font-size: 26px; letter-spacing: -0.02em; }
  .meta { margin-top: 10px; color: #5b6475; font-size: 13px; }
  .meta span { margin-right: 14px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #ecfdf5; color: #0f766e; border: 1px solid #a7f3d0; }
  .badge.cold { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
  .badge.hot { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 18px 0 22px; }
  .kpi { border: 1px solid #e8ebf0; border-radius: 12px; padding: 12px 14px; background: #fafbfc; }
  .kpi .l { font-size: 11px; color: #6b7280; font-weight: 600; letter-spacing: .04em; }
  .kpi .v { margin-top: 4px; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
  .kpi .h { margin-top: 2px; font-size: 11px; color: #8b93a7; }
  h2 { font-size: 15px; margin: 26px 0 10px; color: #111827; border-left: 3px solid #0f766e; padding-left: 10px; }
  ul.notes { margin: 0; padding-left: 1.15rem; color: #374151; }
  ul.notes li { margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
  th, td { border-bottom: 1px solid #eef0f4; padding: 7px 8px; text-align: left; }
  th { background: #f8fafc; color: #64748b; font-weight: 600; font-size: 11px; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  td.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  td.net { font-weight: 600; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; }
  .actions { margin: 0 0 16px; display: flex; gap: 8px; flex-wrap: wrap; }
  .actions button { border: 1px solid #d1d5db; background: #fff; border-radius: 10px; padding: 8px 14px; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
  .actions button.primary { background: #0f766e; color: #fff; border-color: #0f766e; }
  @media (max-width: 720px) {
    .grid { grid-template-columns: 1fr 1fr; }
    .cols { grid-template-columns: 1fr; }
  }
  @media print {
    body { background: #fff; }
    .wrap { padding: 0; max-width: none; }
    .sheet { box-shadow: none; border: none; border-radius: 0; padding: 0; }
    .actions { display: none !important; }
    @page { margin: 14mm; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="actions">
      <button class="primary" onclick="window.print()">列印 / 另存 PDF</button>
      <button onclick="window.close()">關閉</button>
    </div>
    <article class="sheet">
      <header>
        <div class="kicker">Taiwan Institutional Flow · Client Report</div>
        <h1>台股籌碼日報</h1>
        <div class="meta">
          <span>文件 TWFLOW-${stamp}</span>
          <span>資料日 ${esc(data.asOfLabel)}</span>
          <span>產出 ${esc(producedAt())}</span>
          <span class="badge ${ins.temperature}">市場${esc(ins.temperatureLabel)}</span>
        </div>
      </header>

      <div class="grid">
        <div class="kpi"><div class="l">創新高</div><div class="v">${ins.highCount}</div><div class="h">${ins.seriesDelta == null ? "家數" : ins.seriesDelta === 0 ? "與前日持平" : ins.seriesDelta > 0 ? `較前日 +${ins.seriesDelta}` : `較前日 ${ins.seriesDelta}`}</div></div>
        <div class="kpi"><div class="l">創新低</div><div class="v">${ins.lowCount}</div><div class="h">240 日／一年新低</div></div>
        <div class="kpi"><div class="l">同時買進</div><div class="v">${ins.contCount}</div><div class="h">外資＋投信</div></div>
        <div class="kpi"><div class="l">0050 前十大</div><div class="v">${ins.top10Weight}%</div><div class="h">${esc(ins.top1Name)}</div></div>
      </div>

      <h2>研究要點</h2>
      <ul class="notes">
        ${ins.researchNotes.map((n) => `<li>${esc(n)}</li>`).join("\n        ")}
      </ul>

      <h2>籌碼結構（前 30 名合計）</h2>
      <div class="grid" style="grid-template-columns:repeat(3,1fr)">
        <div class="kpi"><div class="l">外資淨額估計</div><div class="v" style="font-size:16px">${ins.foreignNetTop >= 0 ? "+" : ""}${ins.foreignNetTop.toLocaleString("zh-TW")}</div><div class="h">張</div></div>
        <div class="kpi"><div class="l">投信淨額估計</div><div class="v" style="font-size:16px">${ins.trustNetTop >= 0 ? "+" : ""}${ins.trustNetTop.toLocaleString("zh-TW")}</div><div class="h">張</div></div>
        <div class="kpi"><div class="l">新高／新低比</div><div class="v" style="font-size:16px">${ins.highLowRatio ?? "—"}</div><div class="h">結構指標</div></div>
      </div>

      <div class="cols">
        <div>
          <h2>外資買超 Top10</h2>
          <table><thead><tr><th class="n">#</th><th>代號</th><th>名稱</th><th class="n">買</th><th class="n">賣</th><th class="n">超</th></tr></thead><tbody>${rowFlow(data.foreign.foreignBuy)}</tbody></table>
        </div>
        <div>
          <h2>投信買超 Top10</h2>
          <table><thead><tr><th class="n">#</th><th>代號</th><th>名稱</th><th class="n">買</th><th class="n">賣</th><th class="n">超</th></tr></thead><tbody>${rowFlow(data.foreign.trustBuy)}</tbody></table>
        </div>
      </div>

      <div class="cols">
        <div>
          <h2>外資賣超 Top10</h2>
          <table><thead><tr><th class="n">#</th><th>代號</th><th>名稱</th><th class="n">買</th><th class="n">賣</th><th class="n">超</th></tr></thead><tbody>${rowFlow(data.foreign.foreignSell)}</tbody></table>
        </div>
        <div>
          <h2>投信賣超 Top10</h2>
          <table><thead><tr><th class="n">#</th><th>代號</th><th>名稱</th><th class="n">買</th><th class="n">賣</th><th class="n">超</th></tr></thead><tbody>${rowFlow(data.foreign.trustSell)}</tbody></table>
        </div>
      </div>

      <h2>今日創新高</h2>
      <table>
        <thead><tr><th class="n">#</th><th>代號</th><th>名稱</th><th class="n">成交</th><th class="n">漲跌</th><th class="n">%</th></tr></thead>
        <tbody>
          ${
            data.highs.stocks.length
              ? data.highs.stocks
                  .map(
                    (s, i) =>
                      `<tr><td class="n">${i + 1}</td><td class="mono">${esc(s.code)}</td><td>${esc(s.name)}</td><td class="n">${s.price}</td><td class="n">${s.change >= 0 ? "+" : ""}${s.change}</td><td class="n">${s.changePct >= 0 ? "+" : ""}${s.changePct}%</td></tr>`,
                  )
                  .join("")
              : `<tr><td colspan="6">今日無創新高</td></tr>`
          }
        </tbody>
      </table>

      <h2>外資／投信同時買進</h2>
      <p style="margin:0;color:#374151">${
        data.foreign.contStocks.length
          ? esc(data.foreign.contStocks.join("、"))
          : "今日無同時買進名單"
      }</p>

      <h2>0050 前十大權重</h2>
      <table>
        <thead><tr><th class="n">#</th><th>股票</th><th class="n">權重%</th><th class="n">持股(千股)</th></tr></thead>
        <tbody>
          ${data.lows.holdings
            .slice(0, 10)
            .map(
              (h, i) =>
                `<tr><td class="n">${i + 1}</td><td>${esc(h.name)}</td><td class="n">${h.weight.toFixed(2)}</td><td class="n">${h.sharesK.toLocaleString("zh-TW")}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>

      <footer>
        單位：張（1 張 = 1,000 股）。淨額採原始 Excel 買賣超欄。前 30 名合計僅供結構觀察，非全市場總額。
        本報告僅供資訊彙整與研究參考，不構成任何投資建議。— 台股籌碼看板
      </footer>
    </article>
  </div>
</body>
</html>`;
}

/** Compact HTML email body for client outreach */
export function buildHtmlEmail(data: MarketData): string {
  const ins = computeInsights(data);
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const li = (rows: FlowRow[], n = 5) =>
    rows
      .slice(0, n)
      .map(
        (r) =>
          `<li style="margin:4px 0;font-size:14px;color:#1f2937"><strong>${esc(r.name)}</strong>（${esc(r.code)}） <span style="color:${r.net >= 0 ? "#b91c1c" : "#047857"}">${r.net >= 0 ? "+" : ""}${r.net.toLocaleString("zh-TW")} 張</span></li>`,
      )
      .join("");

  return `<!DOCTYPE html>
<html lang="zh-Hant"><head><meta charset="utf-8"/><title>台股籌碼摘要 ${esc(data.asOfLabel)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Noto Sans TC',Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <tr><td style="background:#0f766e;color:#fff;padding:20px 24px">
    <div style="font-size:11px;letter-spacing:.1em;opacity:.9;text-transform:uppercase">Taiwan Flow Briefing</div>
    <div style="font-size:22px;font-weight:700;margin-top:4px">台股籌碼日報</div>
    <div style="font-size:13px;margin-top:8px;opacity:.95">資料日 ${esc(data.asOfLabel)} · 市場${esc(ins.temperatureLabel)}</div>
  </td></tr>
  <tr><td style="padding:20px 24px">
    <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6">${esc(ins.flowHeadline)}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 18px">
      <tr>
        <td width="25%" style="padding:10px;background:#f9fafb;border-radius:8px;text-align:center"><div style="font-size:11px;color:#6b7280">創新高</div><div style="font-size:20px;font-weight:700;color:#111">${ins.highCount}</div></td>
        <td width="8"></td>
        <td width="25%" style="padding:10px;background:#f9fafb;border-radius:8px;text-align:center"><div style="font-size:11px;color:#6b7280">創新低</div><div style="font-size:20px;font-weight:700;color:#111">${ins.lowCount}</div></td>
        <td width="8"></td>
        <td width="25%" style="padding:10px;background:#f9fafb;border-radius:8px;text-align:center"><div style="font-size:11px;color:#6b7280">同時買進</div><div style="font-size:20px;font-weight:700;color:#111">${ins.contCount}</div></td>
        <td width="8"></td>
        <td width="25%" style="padding:10px;background:#f9fafb;border-radius:8px;text-align:center"><div style="font-size:11px;color:#6b7280">0050前十</div><div style="font-size:20px;font-weight:700;color:#111">${ins.top10Weight}%</div></td>
      </tr>
    </table>
    <div style="font-size:13px;font-weight:700;color:#0f766e;margin:16px 0 6px">研究要點</div>
    <ol style="margin:0;padding-left:18px;color:#374151;font-size:13px;line-height:1.55">
      ${ins.researchNotes
        .slice(0, 5)
        .map((n) => `<li style="margin:5px 0">${esc(n)}</li>`)
        .join("")}
    </ol>
    <div style="font-size:13px;font-weight:700;color:#0f766e;margin:18px 0 6px">外資買超 Top5</div>
    <ul style="margin:0;padding-left:18px">${li(data.foreign.foreignBuy)}</ul>
    <div style="font-size:13px;font-weight:700;color:#0f766e;margin:18px 0 6px">投信買超 Top5</div>
    <ul style="margin:0;padding-left:18px">${li(data.foreign.trustBuy)}</ul>
    <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;line-height:1.5">單位：張。僅供資訊彙整，非投資建議。完整報表請下載 Excel／HTML 客戶報告。</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function buildWorkbook(data: MarketData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ins = computeInsights(data);

  const cover = [
    ["台股籌碼日報 · Institutional Research Pack"],
    [],
    ["文件編號", `TWFLOW-${dateStamp(data.asOf)}`],
    ["資料日", data.asOfLabel],
    ["產出時間", producedAt()],
    ["文件性質", "機構研究用資訊彙整（非投資建議）"],
    ["市場溫度", `${ins.temperatureLabel} — ${ins.temperatureNote}`],
    [],
    ["工作表目錄"],
    ["1", "封面", "本頁"],
    ["2", "研究摘要", "關鍵指標與研究要點"],
    ["3", "外資買超", "前 30 名（張）"],
    ["4", "外資賣超", "前 30 名（張）"],
    ["5", "投信買超", "前 30 名（張）"],
    ["6", "投信賣超", "前 30 名（張）"],
    ["7", "同時買進", "外資／投信同時買進名單"],
    ["8", "一年新高", "當日創新高標的"],
    ["9", "新高走勢", "創新高家數時間序列"],
    ["10", "一年新低", "240 日／一年新低"],
    ["11", "0050持股", "元大台灣50 成分權重"],
    [],
    ["資料方法"],
    ["單位", "張（1 張 = 1,000 股）"],
    ["淨額", "採原始 Excel 買賣超欄，非買−賣之四捨五入差"],
    ["顏色習慣", "台股：漲紅跌綠"],
    ["免責", "僅供資訊彙整與研究參考，不構成投資建議"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cover), "封面");

  const summary = [
    ["研究摘要"],
    ["資料日", data.asOfLabel],
    ["產出時間", producedAt()],
    [],
    ["指標", "數值", "備註"],
    ["創新高家數", ins.highCount, "一年新高清單／當日序列"],
    [
      "較前一日",
      ins.seriesDelta ?? "—",
      "創新高家數變動",
    ],
    ["近5日平均", ins.seriesAvg5 != null ? Number(ins.seriesAvg5.toFixed(1)) : "—", "創新高家數"],
    ["創新低家數", ins.lowCount, "240日／一年新低"],
    ["新高／新低比", ins.highLowRatio ?? "—", "結構指標"],
    ["市場溫度", ins.temperatureLabel, ins.temperatureNote],
    ["同時買進檔數", ins.contCount, "外資＋投信"],
    ["0050持股檔數", ins.holdingsCount, "元大台灣50"],
    ["0050前十大權重%", ins.top10Weight, ins.top1Name],
    [
      "外資前30淨額",
      ins.foreignNetTop,
      "買超+賣超淨額合計（張）",
    ],
    [
      "投信前30淨額",
      ins.trustNetTop,
      "買超+賣超淨額合計（張）",
    ],
    [
      "外資買超冠軍",
      ins.topForeignBuy?.name ?? "—",
      ins.topForeignBuy ? `+${ins.topForeignBuy.net} 張` : "",
    ],
    [
      "外資賣超冠軍",
      ins.topForeignSell?.name ?? "—",
      ins.topForeignSell ? `${ins.topForeignSell.net} 張` : "",
    ],
    [
      "投信買超冠軍",
      ins.topTrustBuy?.name ?? "—",
      ins.topTrustBuy ? `+${ins.topTrustBuy.net} 張` : "",
    ],
    [
      "投信賣超冠軍",
      ins.topTrustSell?.name ?? "—",
      ins.topTrustSell ? `${ins.topTrustSell.net} 張` : "",
    ],
    [],
    ["研究要點"],
    ...ins.researchNotes.map((n, i) => [i + 1, n]),
    [],
    ["免責", "僅供資訊彙整，非投資建議"],
  ];
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(summary),
    "研究摘要",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(
      flowSheet(data.foreign.foreignBuy, "外資買超前30名"),
    ),
    "外資買超",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(
      flowSheet(data.foreign.foreignSell, "外資賣超前30名"),
    ),
    "外資賣超",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(
      flowSheet(data.foreign.trustBuy, "投信買超前30名"),
    ),
    "投信買超",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(
      flowSheet(data.foreign.trustSell, "投信賣超前30名"),
    ),
    "投信賣超",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["外資／投信同時買進"],
      ["資料日", data.asOfLabel],
      ["檔數", data.foreign.contStocks.length],
      [],
      ["序", "名稱"],
      ...data.foreign.contStocks.map((n, i) => [i + 1, n]),
    ]),
    "同時買進",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [
        "代號",
        "名稱",
        "成交",
        "漲跌",
        "漲跌幅%",
        "成交張數",
        "金額(百萬)",
        "成交價排名",
        "創高日數",
      ],
      ...data.highs.stocks.map((s) => [
        s.code,
        s.name,
        s.price,
        s.change,
        s.changePct,
        s.vol,
        s.amountM,
        s.volRank,
        s.volHighDays,
      ]),
    ]),
    "一年新高",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["日期", "創新高家數", "Excel序"],
      ...data.highs.series.map((s) => [s.date, s.count, s.excel]),
    ]),
    "新高走勢",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [
        "代號",
        "名稱",
        "成交",
        "最高",
        "最低",
        "漲跌",
        "漲跌幅%",
        "歷史高點",
        "距高點%",
        "歷史低點",
        "距低點%",
        "10年高",
        "距10年高%",
      ],
      ...data.lows.lows.map((s) => [
        s.code,
        s.name,
        s.price,
        s.high,
        s.low,
        s.change,
        s.changePct,
        s.histHigh,
        s.fromHistHigh,
        s.histLow,
        s.fromHistLow,
        s.y10High ?? null,
        s.fromY10High ?? null,
      ]),
    ]),
    "一年新低",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["序", "股票", "持股(千股)", "權重%", "增減"],
      ...data.lows.holdings.map((h, i) => [
        i + 1,
        h.name,
        h.sharesK,
        h.weight,
        h.change,
      ]),
    ]),
    "0050持股",
  );

  return wb;
}

function aoaToCsv(aoa: unknown[][]): string {
  return aoa
    .map((row) =>
      row
        .map((cell) => {
          if (cell == null) return "";
          const s = String(cell);
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(","),
    )
    .join("\r\n");
}

export function withBom(csv: string): string {
  return `\uFEFF${csv}`;
}

export function buildCsvParts(data: MarketData): {
  name: string;
  csv: string;
}[] {
  return [
    {
      name: `外資買超_${dateStamp(data.asOf)}.csv`,
      csv: withBom(aoaToCsv(flowSheet(data.foreign.foreignBuy, "外資買超"))),
    },
    {
      name: `外資賣超_${dateStamp(data.asOf)}.csv`,
      csv: withBom(aoaToCsv(flowSheet(data.foreign.foreignSell, "外資賣超"))),
    },
    {
      name: `投信買超_${dateStamp(data.asOf)}.csv`,
      csv: withBom(aoaToCsv(flowSheet(data.foreign.trustBuy, "投信買超"))),
    },
    {
      name: `投信賣超_${dateStamp(data.asOf)}.csv`,
      csv: withBom(aoaToCsv(flowSheet(data.foreign.trustSell, "投信賣超"))),
    },
    {
      name: `一年新高_${dateStamp(data.asOf)}.csv`,
      csv: withBom(
        aoaToCsv([
          ["代號", "名稱", "成交", "漲跌", "漲跌幅%", "成交張數", "金額(百萬)"],
          ...data.highs.stocks.map((s) => [
            s.code,
            s.name,
            s.price,
            s.change,
            s.changePct,
            s.vol,
            s.amountM,
          ]),
        ]),
      ),
    },
    {
      name: `一年新低_${dateStamp(data.asOf)}.csv`,
      csv: withBom(
        aoaToCsv([
          [
            "代號",
            "名稱",
            "成交",
            "漲跌幅%",
            "歷史高點",
            "距高點%",
            "歷史低點",
            "距低點%",
          ],
          ...data.lows.lows.map((s) => [
            s.code,
            s.name,
            s.price,
            s.changePct,
            s.histHigh,
            s.fromHistHigh,
            s.histLow,
            s.fromHistLow,
          ]),
        ]),
      ),
    },
    {
      name: `0050持股_${dateStamp(data.asOf)}.csv`,
      csv: withBom(
        aoaToCsv([
          ["序", "股票", "持股(千股)", "權重%", "增減"],
          ...data.lows.holdings.map((h, i) => [
            i + 1,
            h.name,
            h.sharesK,
            h.weight,
            h.change,
          ]),
        ]),
      ),
    },
  ];
}

export function buildExportArtifact(
  data: MarketData,
  format: ExportFormat,
): ExportArtifact {
  const stamp = dateStamp(data.asOf);
  if (format === "xlsx") {
    const wb = buildWorkbook(data);
    const b64 = XLSX.write(wb, {
      bookType: "xlsx",
      type: "base64",
    }) as string;
    return {
      filename: `台股籌碼日報_${stamp}.xlsx`,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: b64,
      encoding: "base64",
    };
  }
  if (format === "json") {
    const ins = computeInsights(data);
    return {
      filename: `market_${stamp}.json`,
      mime: "application/json; charset=utf-8",
      body: JSON.stringify({ ...data, _insights: ins }, null, 2),
      encoding: "utf8",
    };
  }
  if (format === "summary") {
    return {
      filename: `市場摘要_${stamp}.txt`,
      mime: "text/plain; charset=utf-8",
      body: buildSummaryText(data),
      encoding: "utf8",
    };
  }
  if (format === "html") {
    return {
      filename: `台股籌碼日報_${stamp}.html`,
      mime: "text/html; charset=utf-8",
      body: buildHtmlReport(data),
      encoding: "utf8",
    };
  }
  if (format === "html-email") {
    return {
      filename: `籌碼郵件稿_${stamp}.html`,
      mime: "text/html; charset=utf-8",
      body: buildHtmlEmail(data),
      encoding: "utf8",
    };
  }
  const overview = withBom(
    aoaToCsv([
      ["報表", "台股籌碼日報"],
      ["資料日", data.asOfLabel],
      ["文件編號", `TWFLOW-${stamp}`],
      [],
      ["區塊", "排名", "代號", "名稱", "買賣超(張)"],
      ...data.foreign.foreignBuy
        .slice(0, 10)
        .map((r) => ["外資買超", r.rank, r.code, r.name, r.net]),
      ...data.foreign.foreignSell
        .slice(0, 10)
        .map((r) => ["外資賣超", r.rank, r.code, r.name, r.net]),
      ...data.foreign.trustBuy
        .slice(0, 10)
        .map((r) => ["投信買超", r.rank, r.code, r.name, r.net]),
      ...data.foreign.trustSell
        .slice(0, 10)
        .map((r) => ["投信賣超", r.rank, r.code, r.name, r.net]),
      [],
      ["創新高", "代號", "名稱", "成交", "漲跌幅%"],
      ...data.highs.stocks.map((s) => [
        "一年新高",
        s.code,
        s.name,
        s.price,
        s.changePct,
      ]),
      [],
      ["同時買進", "名稱"],
      ...data.foreign.contStocks.map((n) => ["同時買進", n]),
    ]),
  );
  return {
    filename: `籌碼精選_${stamp}.csv`,
    mime: "text/csv; charset=utf-8",
    body: overview,
    encoding: "utf8",
  };
}

export function artifactToBytes(artifact: ExportArtifact): Uint8Array {
  if (artifact.encoding === "base64") {
    return base64ToBytes(artifact.body);
  }
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(artifact.body);
  }
  return new Uint8Array(Buffer.from(artifact.body, "utf8"));
}

/** Trigger browser download */
export function downloadArtifact(artifact: ExportArtifact): void {
  const bytes = artifactToBytes(artifact);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: artifact.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = artifact.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadMarket(
  data: MarketData,
  format: ExportFormat,
): void {
  downloadArtifact(buildExportArtifact(data, format));
}

/** Open HTML report in new window for print / PDF */
export function openHtmlReport(data: MarketData): void {
  const html = buildHtmlReport(data);
  const w = window.open("", "_blank");
  if (!w) {
    downloadMarket(data, "html");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export async function downloadAllCsvs(data: MarketData): Promise<number> {
  const parts = buildCsvParts(data);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    downloadArtifact({
      filename: p.name,
      mime: "text/csv; charset=utf-8",
      body: p.csv,
      encoding: "utf8",
    });
    await new Promise((r) => setTimeout(r, 180));
  }
  return parts.length;
}

/** Client pack: xlsx + summary + html + csv-bundle */
export async function downloadClientPack(data: MarketData): Promise<number> {
  const formats: ExportFormat[] = ["xlsx", "summary", "html", "csv-bundle"];
  for (const f of formats) {
    downloadMarket(data, f);
    await new Promise((r) => setTimeout(r, 220));
  }
  return formats.length;
}
