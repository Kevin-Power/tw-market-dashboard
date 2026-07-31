import { z } from "zod";
import type { MarketData } from "@/data/types";

const flowRow = z.object({
  rank: z.number().int().positive(),
  code: z.string().min(1),
  name: z.string().min(1),
  buy: z.number().finite(),
  sell: z.number().finite(),
  net: z.number().finite(),
});

const highStock = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  price: z.number().finite(),
  change: z.number().finite(),
  changePct: z.number().finite(),
  volRank: z.number().finite().nullable(),
  volHighDays: z.number().finite().nullable(),
  vol: z.number().finite().nullable(),
  volChange: z.number().finite().nullable(),
  amountM: z.number().finite().nullable(),
  amountRank: z.number().finite().nullable(),
  amountHighDays: z.number().finite().nullable(),
});

const lowStock = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  price: z.number().finite(),
  high: z.number().finite().nullable(),
  low: z.number().finite().nullable(),
  change: z.number().finite().nullable(),
  changePct: z.number().finite().nullable(),
  histHigh: z.number().finite().nullable(),
  fromHistHigh: z.number().finite().nullable(),
  histLow: z.number().finite().nullable(),
  fromHistLow: z.number().finite().nullable(),
  y10High: z.number().finite().nullable(),
  fromY10High: z.number().finite().nullable(),
  y10Low: z.number().finite().nullable().optional(),
  fromY10Low: z.number().finite().nullable().optional(),
  y20High: z.number().finite().nullable().optional(),
  fromY20High: z.number().finite().nullable().optional(),
  y20Low: z.number().finite().nullable().optional(),
  fromY20Low: z.number().finite().nullable().optional(),
});

const holding = z.object({
  name: z.string().min(1),
  sharesK: z.number().finite(),
  weight: z.number().finite(),
  change: z.union([z.number().finite(), z.string(), z.null()]),
});

export const marketDataSchema = z
  .object({
    asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    asOfLabel: z.string().min(8),
    foreign: z.object({
      foreignBuy: z.array(flowRow).min(1).max(200),
      foreignSell: z.array(flowRow).min(1).max(200),
      trustBuy: z.array(flowRow).min(1).max(200),
      trustSell: z.array(flowRow).min(1).max(200),
      contStocks: z.array(z.string()),
      lastDate: z.number().finite(),
    }),
    highs: z.object({
      stocks: z.array(highStock).max(500),
      series: z
        .array(
          z.object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            excel: z.number().finite(),
            count: z.number().int().nonnegative(),
          }),
        )
        .min(1)
        .max(5000),
    }),
    lows: z.object({
      holdings: z.array(holding).max(100),
      lows: z.array(lowStock).max(2000),
    }),
  })
  .superRefine((data, ctx) => {
    if (data.asOfLabel.replace(/\//g, "-") !== data.asOf) {
      ctx.addIssue({
        code: "custom",
        message: `asOfLabel ${data.asOfLabel} 與 asOf ${data.asOf} 不一致`,
        path: ["asOfLabel"],
      });
    }

    const flowKeys = [
      "foreignBuy",
      "foreignSell",
      "trustBuy",
      "trustSell",
    ] as const;
    for (const key of flowKeys) {
      const list = data.foreign[key];
      const ranks = list.map((r) => r.rank);
      if (new Set(ranks).size !== ranks.length) {
        ctx.addIssue({
          code: "custom",
          message: `${key} 排名重複`,
          path: ["foreign", key],
        });
      }
      if (key.endsWith("Buy")) {
        const neg = list.filter((r) => r.net < 0).length;
        if (neg > list.length * 0.2) {
          ctx.addIssue({
            code: "custom",
            message: `${key} 買超清單出現過多負值 (${neg}/${list.length})`,
            path: ["foreign", key],
          });
        }
      }
      if (key.endsWith("Sell")) {
        const pos = list.filter((r) => r.net > 0).length;
        if (pos > list.length * 0.2) {
          ctx.addIssue({
            code: "custom",
            message: `${key} 賣超清單出現過多正值 (${pos}/${list.length})`,
            path: ["foreign", key],
          });
        }
      }
    }

    for (let i = 1; i < data.highs.series.length; i++) {
      if (data.highs.series[i]!.date < data.highs.series[i - 1]!.date) {
        ctx.addIssue({
          code: "custom",
          message: "創新高家數序列日期未遞增",
          path: ["highs", "series", i],
        });
        break;
      }
    }

    const last = data.highs.series[data.highs.series.length - 1];
    if (last && last.date !== data.asOf) {
      ctx.addIssue({
        code: "custom",
        message: `asOf ${data.asOf} 與序列末日 ${last.date} 不一致`,
        path: ["asOf"],
      });
    }

    if (
      last &&
      last.date === data.asOf &&
      last.count !== data.highs.stocks.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: `創新高清單 ${data.highs.stocks.length} 檔 ≠ 序列家數 ${last.count}`,
        path: ["highs", "stocks"],
      });
    }

    const highCodes = data.highs.stocks.map((s) => s.code);
    if (new Set(highCodes).size !== highCodes.length) {
      ctx.addIssue({
        code: "custom",
        message: "創新高清單有重複代號",
        path: ["highs", "stocks"],
      });
    }
    const lowCodes = data.lows.lows.map((s) => s.code);
    if (new Set(lowCodes).size !== lowCodes.length) {
      ctx.addIssue({
        code: "custom",
        message: "創新低清單有重複代號",
        path: ["lows", "lows"],
      });
    }
  });

export function parseMarketData(input: unknown):
  | { ok: true; data: MarketData }
  | { ok: false; error: string; issues: string[] } {
  const result = marketDataSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    return {
      ok: false,
      error: issues[0] || "invalid market payload",
      issues,
    };
  }
  return { ok: true, data: result.data as MarketData };
}

/** Numeric hygiene after Excel parse / before save */
export function normalizeMarketData(data: MarketData): MarketData {
  const n = (v: number | null | undefined, digits = 6): number | null => {
    if (v == null || Number.isNaN(v) || !Number.isFinite(v)) return null;
    const f = Number(v.toFixed(digits));
    return Object.is(f, -0) ? 0 : f;
  };
  const ni = (v: number | null | undefined): number | null => {
    if (v == null || !Number.isFinite(v)) return null;
    return Math.trunc(v);
  };

  const mapFlow = (rows: MarketData["foreign"]["foreignBuy"]) =>
    rows.map((r) => ({
      rank: Math.trunc(r.rank),
      code: String(r.code).trim(),
      name: String(r.name).trim(),
      buy: Math.round(r.buy),
      sell: Math.round(r.sell),
      net: Math.round(r.net),
    }));

  return {
    asOf: data.asOf,
    asOfLabel: data.asOf.replace(/-/g, "/"),
    foreign: {
      foreignBuy: mapFlow(data.foreign.foreignBuy),
      foreignSell: mapFlow(data.foreign.foreignSell),
      trustBuy: mapFlow(data.foreign.trustBuy),
      trustSell: mapFlow(data.foreign.trustSell),
      contStocks: data.foreign.contStocks.map((s) => s.trim()).filter(Boolean),
      lastDate: Math.round(data.foreign.lastDate) || 0,
    },
    highs: {
      stocks: data.highs.stocks.map((s) => ({
        code: String(s.code).trim(),
        name: String(s.name).trim(),
        price: n(s.price, 4)!,
        change: n(s.change, 4)!,
        changePct: n(s.changePct, 4)!,
        volRank: ni(s.volRank),
        volHighDays: ni(s.volHighDays),
        vol: ni(s.vol),
        volChange: ni(s.volChange),
        amountM: n(s.amountM, 4),
        amountRank: ni(s.amountRank),
        amountHighDays: ni(s.amountHighDays),
      })),
      series: data.highs.series.map((s) => ({
        date: s.date,
        excel: Math.round(s.excel),
        count: Math.max(0, Math.trunc(s.count)),
      })),
    },
    lows: {
      holdings: data.lows.holdings.map((h) => ({
        name: String(h.name).trim(),
        sharesK: Math.round(h.sharesK),
        weight: n(h.weight, 4)!,
        change:
          typeof h.change === "number" ? n(h.change, 6) : (h.change ?? null),
      })),
      lows: data.lows.lows.map((s) => ({
        code: String(s.code).trim(),
        name: String(s.name).trim(),
        price: n(s.price, 4)!,
        high: n(s.high, 4),
        low: n(s.low, 4),
        change: n(s.change, 4),
        changePct: n(s.changePct, 4),
        histHigh: n(s.histHigh, 4),
        fromHistHigh: n(s.fromHistHigh, 4),
        histLow: n(s.histLow, 4),
        fromHistLow: n(s.fromHistLow, 4),
        y10High: n(s.y10High, 4),
        fromY10High: n(s.fromY10High, 4),
        y10Low: n(s.y10Low ?? null, 4),
        fromY10Low: n(s.fromY10Low ?? null, 4),
        y20High: n(s.y20High ?? null, 4),
        fromY20High: n(s.fromY20High ?? null, 4),
        y20Low: n(s.y20Low ?? null, 4),
        fromY20Low: n(s.fromY20Low ?? null, 4),
      })),
    },
  };
}
