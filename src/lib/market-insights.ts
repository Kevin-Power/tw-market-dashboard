/**
 * Institutional-style market insights derived from MarketData.
 * Pure functions — safe on client and server.
 */
import type { FlowRow, MarketData } from "@/data/types";

export type MarketInsights = {
  asOf: string;
  asOfLabel: string;
  highCount: number;
  lowCount: number;
  highLowRatio: number | null;
  seriesDelta: number | null;
  seriesAvg5: number | null;
  seriesVsAvg5: number | null;
  foreignBuyTopSum: number;
  foreignSellTopSum: number;
  trustBuyTopSum: number;
  trustSellTopSum: number;
  foreignNetTop: number;
  trustNetTop: number;
  contCount: number;
  holdingsCount: number;
  top10Weight: number;
  top1Weight: number;
  top1Name: string;
  /** 市場溫度：偏熱 / 中性 / 偏冷 */
  temperature: "hot" | "neutral" | "cold";
  temperatureLabel: string;
  temperatureNote: string;
  /** 籌碼面一句話 */
  flowHeadline: string;
  /** 研究要點（客戶簡報用） */
  researchNotes: string[];
  topForeignBuy: FlowRow | null;
  topForeignSell: FlowRow | null;
  topTrustBuy: FlowRow | null;
  topTrustSell: FlowRow | null;
};

function sumNet(rows: FlowRow[]): number {
  return rows.reduce((a, r) => a + r.net, 0);
}

function sumAbsNet(rows: FlowRow[]): number {
  return rows.reduce((a, r) => a + Math.abs(r.net), 0);
}

export function computeInsights(data: MarketData): MarketInsights {
  const last = data.highs.series[data.highs.series.length - 1];
  const prev = data.highs.series[data.highs.series.length - 2];
  const highCount =
    last && last.date === data.asOf
      ? last.count
      : data.highs.stocks.length;
  const lowCount = data.lows.lows.length;
  const seriesDelta =
    last && prev ? last.count - prev.count : null;

  const tail = data.highs.series.slice(-5);
  const seriesAvg5 =
    tail.length > 0
      ? tail.reduce((a, s) => a + s.count, 0) / tail.length
      : null;
  const seriesVsAvg5 =
    seriesAvg5 != null && last
      ? Math.round((last.count - seriesAvg5) * 10) / 10
      : null;

  const foreignBuyTopSum = sumAbsNet(data.foreign.foreignBuy);
  const foreignSellTopSum = sumAbsNet(data.foreign.foreignSell);
  const trustBuyTopSum = sumAbsNet(data.foreign.trustBuy);
  const trustSellTopSum = sumAbsNet(data.foreign.trustSell);
  const foreignNetTop = sumNet(data.foreign.foreignBuy) + sumNet(data.foreign.foreignSell);
  const trustNetTop = sumNet(data.foreign.trustBuy) + sumNet(data.foreign.trustSell);

  const top10Weight = data.lows.holdings
    .slice(0, 10)
    .reduce((a, h) => a + h.weight, 0);
  const top1 = data.lows.holdings[0];

  const highLowRatio =
    lowCount > 0 ? Math.round((highCount / lowCount) * 1000) / 1000 : null;

  // Temperature heuristic: more highs vs lows + series trend
  let temperature: MarketInsights["temperature"] = "neutral";
  if (highCount >= 15 || (highLowRatio != null && highLowRatio >= 0.2)) {
    temperature = "hot";
  } else if (lowCount >= 80 && highCount <= 10) {
    temperature = "cold";
  } else if (seriesDelta != null && seriesDelta >= 5) {
    temperature = "hot";
  } else if (seriesDelta != null && seriesDelta <= -5) {
    temperature = "cold";
  }

  const temperatureLabel =
    temperature === "hot"
      ? "偏熱"
      : temperature === "cold"
        ? "偏冷"
        : "中性";

  const temperatureNote =
    temperature === "hot"
      ? "創新高家數相對活絡，短線風險偏好偏強。"
      : temperature === "cold"
        ? "創新低家數偏多，市場風險偏好偏保守。"
        : "新高新低結構相對均衡，宜觀察籌碼續航。";

  const fb = data.foreign.foreignBuy[0] ?? null;
  const fs = data.foreign.foreignSell[0] ?? null;
  const tb = data.foreign.trustBuy[0] ?? null;
  const ts = data.foreign.trustSell[0] ?? null;

  const flowHeadline = fb
    ? `外資買超聚焦「${fb.name}」；投信${tb ? `買超「${tb.name}」` : "無明顯冠軍"}。`
    : "今日機構買賣超資料尚不足。";

  const researchNotes: string[] = [];

  researchNotes.push(
    `資料日 ${data.asOfLabel}：創新高 ${highCount} 檔、創新低 ${lowCount} 檔` +
      (seriesDelta == null
        ? "。"
        : seriesDelta === 0
          ? "；新高家數與前一交易日持平。"
          : seriesDelta > 0
            ? `；新高家數較前一日增加 ${seriesDelta} 檔。`
            : `；新高家數較前一日減少 ${Math.abs(seriesDelta)} 檔。`),
  );

  if (seriesAvg5 != null && last) {
    researchNotes.push(
      `近 5 日創新高平均 ${seriesAvg5.toFixed(1)} 檔，今日 ${last.count} 檔` +
        (seriesVsAvg5 == null || seriesVsAvg5 === 0
          ? "，接近均線。"
          : seriesVsAvg5 > 0
            ? `，高於均線 ${seriesVsAvg5} 檔。`
            : `，低於均線 ${Math.abs(seriesVsAvg5)} 檔。`),
    );
  }

  researchNotes.push(
    `外資前 30 名買賣超合計淨額約 ${foreignNetTop.toLocaleString("zh-TW")} 張；投信前 30 名約 ${trustNetTop.toLocaleString("zh-TW")} 張。`,
  );

  if (data.foreign.contStocks.length > 0) {
    researchNotes.push(
      `外資與投信同時買進 ${data.foreign.contStocks.length} 檔：${data.foreign.contStocks.slice(0, 6).join("、")}${data.foreign.contStocks.length > 6 ? "…" : ""}。`,
    );
  } else {
    researchNotes.push("今日無「外資／投信同時買進」名單。");
  }

  if (top1) {
    researchNotes.push(
      `0050 最大權重為 ${top1.name}（${top1.weight.toFixed(2)}%），前十大合計約 ${top10Weight.toFixed(1)}%。`,
    );
  }

  if (data.highs.stocks.length > 0) {
    const names = data.highs.stocks
      .slice(0, 5)
      .map((s) => s.name)
      .join("、");
    researchNotes.push(
      `今日創新高標的（前 5）：${names}${data.highs.stocks.length > 5 ? " 等" : ""}。`,
    );
  }

  researchNotes.push(temperatureNote);

  return {
    asOf: data.asOf,
    asOfLabel: data.asOfLabel,
    highCount,
    lowCount,
    highLowRatio,
    seriesDelta,
    seriesAvg5,
    seriesVsAvg5,
    foreignBuyTopSum,
    foreignSellTopSum,
    trustBuyTopSum,
    trustSellTopSum,
    foreignNetTop,
    trustNetTop,
    contCount: data.foreign.contStocks.length,
    holdingsCount: data.lows.holdings.length,
    top10Weight: Math.round(top10Weight * 100) / 100,
    top1Weight: top1?.weight ?? 0,
    top1Name: top1?.name ?? "—",
    temperature,
    temperatureLabel,
    temperatureNote,
    flowHeadline,
    researchNotes,
    topForeignBuy: fb,
    topForeignSell: fs,
    topTrustBuy: tb,
    topTrustSell: ts,
  };
}
