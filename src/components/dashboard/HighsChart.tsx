import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MarketData } from "@/data/types";

type Props = { data: MarketData };

export function HighsChart({ data }: Props) {
  const chartData = data.highs.series.map((d) => ({
    date: d.date.slice(5),
    full: d.date,
    count: d.count,
  }));

  const peak = Math.max(...chartData.map((d) => d.count), 1);

  return (
    <div className="panel fade-in stagger-2 p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-label">Trend</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-fg text-display">
            創新高家數走勢
          </h2>
          <p className="mt-1 text-xs text-muted">
            近 {chartData.length} 個有資料交易日 · 峰值 {peak} 家
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface-2/80 px-4 py-2.5 text-right">
          <div className="text-2xl font-semibold tabular text-primary text-display">
            {data.highs.stocks.length}
          </div>
          <div className="text-[11px] font-medium tracking-wide text-subtle">
            今日家數
          </div>
        </div>
      </div>
      <div className="h-56 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 4, left: -8, bottom: 0 }}
          >
            <defs>
              <linearGradient id="highFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8fd4c4" stopOpacity={0.28} />
                <stop offset="55%" stopColor="#8fd4c4" stopOpacity={0.06} />
                <stop offset="100%" stopColor="#8fd4c4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="rgba(238,240,244,0.06)"
              strokeDasharray="4 6"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: "#5a6276", fontSize: 11, fontFamily: "inherit" }}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              dy={6}
            />
            <YAxis
              tick={{ fill: "#5a6276", fontSize: 11, fontFamily: "inherit" }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              cursor={{
                stroke: "rgba(143,212,196,0.35)",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
              contentStyle={{
                background: "rgba(14,16,20,0.96)",
                border: "1px solid rgba(238,240,244,0.1)",
                borderRadius: 14,
                color: "#eef0f4",
                fontSize: 12,
                boxShadow: "0 12px 40px -12px rgba(0,0,0,0.55)",
                padding: "10px 12px",
              }}
              labelStyle={{ color: "#8b93a7", marginBottom: 4 }}
              itemStyle={{ color: "#8fd4c4", fontWeight: 600 }}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.full ?? ""
              }
              formatter={(value: number) => [`${value} 家`, "創新高"]}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#8fd4c4"
              strokeWidth={2}
              fill="url(#highFill)"
              dot={false}
              activeDot={{
                r: 5,
                fill: "#0e1014",
                stroke: "#8fd4c4",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
