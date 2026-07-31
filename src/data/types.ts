export type FlowRow = {
  rank: number;
  code: string;
  name: string;
  buy: number;
  sell: number;
  net: number;
};

export type HighStock = {
  code: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volRank: number | null;
  volHighDays: number | null;
  vol: number | null;
  volChange: number | null;
  amountM: number | null;
  amountRank: number | null;
  amountHighDays: number | null;
};

export type LowStock = {
  code: string;
  name: string;
  price: number;
  high: number | null;
  low: number | null;
  change: number | null;
  changePct: number | null;
  histHigh: number | null;
  fromHistHigh: number | null;
  histLow: number | null;
  fromHistLow: number | null;
  y10High: number | null;
  fromY10High: number | null;
  y10Low?: number | null;
  fromY10Low?: number | null;
  y20High?: number | null;
  fromY20High?: number | null;
  y20Low?: number | null;
  fromY20Low?: number | null;
};

export type Holding = {
  name: string;
  sharesK: number;
  weight: number;
  change: number | string | null;
};

export type MarketData = {
  asOf: string;
  asOfLabel: string;
  foreign: {
    foreignBuy: FlowRow[];
    foreignSell: FlowRow[];
    trustBuy: FlowRow[];
    trustSell: FlowRow[];
    contStocks: string[];
    lastDate: number;
  };
  highs: {
    stocks: HighStock[];
    series: { date: string; excel: number; count: number }[];
  };
  lows: {
    holdings: Holding[];
    lows: LowStock[];
  };
};

/** API envelope extras (stripped before rendering tables) */
export type MarketApiResponse = MarketData & {
  _meta?: {
    source: string;
    updatedAt: string;
    daily: boolean;
    highCount?: number;
    lowCount?: number;
    storage?: "postgres" | "file" | string;
  };
};
