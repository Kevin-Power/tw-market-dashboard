#!/usr/bin/env node
/**
 * Verify Excel → MarketData against attachments/ ground truth.
 * Exit 1 on any integrity failure.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMarketFromBuffers } from "./lib/market-from-xlsx.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "attachments");
const files = readdirSync(dir).filter((f) => f.endsWith(".xlsx"));
const foreignBuf = readFileSync(join(dir, files.find((f) => /外資|投信/.test(f))));
const highsBuf = readFileSync(join(dir, files.find((f) => /新高/.test(f))));
const lowsBuf = readFileSync(join(dir, files.find((f) => /新低/.test(f))));

const data = parseMarketFromBuffers({ foreignBuf, highsBuf, lowsBuf });
const seed = JSON.parse(readFileSync(join(root, "src/data/market.json"), "utf8"));

const errs = [];
const must = (cond, msg) => {
  if (!cond) errs.push(msg);
};

must(data.asOf === "2026-07-29", `asOf ${data.asOf}`);
must(data.asOfLabel === "2026/07/29", `asOfLabel ${data.asOfLabel}`);
must(data.foreign.foreignBuy.length === 30, `FB ${data.foreign.foreignBuy.length}`);
must(data.foreign.foreignSell.length === 30, `FS ${data.foreign.foreignSell.length}`);
must(data.foreign.trustBuy.length === 30, `TB ${data.foreign.trustBuy.length}`);
must(data.foreign.trustSell.length === 30, `TS ${data.foreign.trustSell.length}`);
must(data.highs.stocks.length === 7, `highs ${data.highs.stocks.length}`);
must(data.lows.lows.length === 123, `lows ${data.lows.lows.length}`);
must(data.lows.holdings.length === 50, `holdings ${data.lows.holdings.length}`);

const fb0 = data.foreign.foreignBuy[0];
must(fb0?.code === "00937B" && fb0.net === 42909, `FB#1 ${JSON.stringify(fb0)}`);
const tb0 = data.foreign.trustBuy[0];
must(
  tb0?.code === "2891" && tb0.net === 11834,
  `TB#1 net must be 11834 (Excel), got ${JSON.stringify(tb0)}`,
);
// prove we did NOT use buy-sell for net
must(tb0.buy - tb0.sell === 11833, `TB buy-sell sanity ${tb0.buy - tb0.sell}`);
must(tb0.net !== tb0.buy - tb0.sell, "TB net should differ from buy-sell by vendor rounding");

const fs0 = data.foreign.foreignSell[0];
must(fs0?.code === "00403A" && fs0.net === -144579, `FS#1 ${JSON.stringify(fs0)}`);
const h0 = data.highs.stocks[0];
must(h0?.code === "668" && h0.price === 62.45, `high#1 ${JSON.stringify(h0)}`);
const l0 = data.lows.lows[0];
must(l0?.code === "00402A" && l0.histHigh === 10.09, `low#1 ${JSON.stringify(l0)}`);
must(l0.fromHistHigh === -10.3, `low fromHistHigh ${l0.fromHistHigh}`);
const hold0 = data.lows.holdings[0];
must(hold0?.name === "台積電" && hold0.weight === 57.37, `hold#1 ${JSON.stringify(hold0)}`);

const last = data.highs.series[data.highs.series.length - 1];
must(last?.date === data.asOf, `series last ${last?.date}`);
must(last?.count === data.highs.stocks.length, `series count ${last?.count}`);

must(
  data.foreign.contStocks.includes("合庫金") &&
    data.foreign.contStocks.includes("英業達"),
  `cont ${data.foreign.contStocks.join(",")}`,
);

must(
  data.foreign.foreignBuy.every((r) => r.net >= 0),
  "foreignBuy negative net",
);
must(
  data.foreign.foreignSell.every((r) => r.net <= 0),
  "foreignSell positive net",
);

// seed file must match fresh parse for key fields
must(seed.asOf === data.asOf, "seed asOf drift");
must(seed.foreign.trustBuy[0].net === 11834, "seed TB net drift");
must(seed.highs.stocks.length === data.highs.stocks.length, "seed highs drift");
must(seed.lows.lows.length === data.lows.lows.length, "seed lows drift");

if (errs.length) {
  console.error("[verify-market] FAILED");
  for (const e of errs) console.error(" -", e);
  process.exit(1);
}
console.log("[verify-market] OK", {
  asOf: data.asOf,
  highs: data.highs.stocks.length,
  lows: data.lows.lows.length,
  cont: data.foreign.contStocks.length,
  series: data.highs.series.length,
  tb0net: tb0.net,
  fb0net: fb0.net,
});
