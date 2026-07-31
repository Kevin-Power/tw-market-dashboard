#!/usr/bin/env node
/**
 * Parse attachments/* Excel → src/data/market.json (+ market.min.json)
 * Usage: node scripts/parse-xlsx.mjs [dir]
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMarketFromBuffers } from "./lib/market-from-xlsx.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.argv[2] || join(root, "attachments");

function findFile(re) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".xlsx"));
  const hit = files.find((f) => re.test(f));
  if (!hit) throw new Error(`No file matching ${re} in ${dir}`);
  return join(dir, hit);
}

const foreignBuf = readFileSync(findFile(/外資|投信/));
const highsBuf = readFileSync(findFile(/新高/));
const lowsBuf = readFileSync(findFile(/新低/));

const market = parseMarketFromBuffers({ foreignBuf, highsBuf, lowsBuf });

// integrity anchors for this fixture set (skipped if different asOf)
if (market.asOf === "2026-07-29") {
  const tb0 = market.foreign.trustBuy[0];
  if (!tb0 || tb0.net !== 11834) {
    throw new Error(
      `trustBuy#1 net must be Excel 11834 (not buy-sell), got ${tb0?.net}`,
    );
  }
  if (market.highs.stocks.length !== 7) {
    throw new Error(`expected 7 highs, got ${market.highs.stocks.length}`);
  }
  if (market.lows.lows.length !== 123) {
    throw new Error(`expected 123 lows, got ${market.lows.lows.length}`);
  }
  const last = market.highs.series[market.highs.series.length - 1];
  if (last.count !== market.highs.stocks.length) {
    throw new Error(
      `series count ${last.count} ≠ stocks ${market.highs.stocks.length}`,
    );
  }
}

const out = join(root, "src/data/market.json");
const outMin = join(root, "src/data/market.min.json");
writeFileSync(out, JSON.stringify(market, null, 2) + "\n");
writeFileSync(outMin, JSON.stringify(market) + "\n");
console.log(
  `[parse-xlsx] asOf=${market.asOf} highs=${market.highs.stocks.length} lows=${market.lows.lows.length} holdings=${market.lows.holdings.length} cont=${market.foreign.contStocks.length} FB#1=${market.foreign.foreignBuy[0]?.net} TB#1=${market.foreign.trustBuy[0]?.net} → ${out}`,
);
