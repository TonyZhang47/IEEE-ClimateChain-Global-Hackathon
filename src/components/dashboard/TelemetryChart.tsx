"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GaugeSeriesPoint } from "@/types/hydro";
import { formatNumber, trendPercent } from "@/lib/utils";

interface TelemetryChartProps {
  series: GaugeSeriesPoint[];
  siteLabel: string | null;
}

export function TelemetryChart({ series, siteLabel }: TelemetryChartProps) {
  const discharge = series.filter((point) => point.dischargeCfs !== null);
  const stage = series.filter((point) => point.gageHeightFt !== null);
  const mode: "discharge" | "stage" | "empty" = discharge.length >= 2 ? "discharge" : stage.length >= 2 ? "stage" : "empty";
  const rows =
    mode === "discharge"
      ? discharge.map((point) => ({ time: labelTime(point.timestamp), value: point.dischargeCfs ?? 0 }))
      : mode === "stage"
        ? stage.map((point) => ({ time: labelTime(point.timestamp), value: point.gageHeightFt ?? 0 }))
        : [];
  const first = rows[0]?.value ?? null;
  const last = rows[rows.length - 1]?.value ?? null;
  const change = trendPercent(first, last);

  return (
    <section className="glass rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-mist">Seven-day gauge trace</p>
          <h3 className="mt-1 text-base text-foam">{siteLabel ?? "No primary gauge"}</h3>
        </div>
        {change !== null ? (
          <p className={`font-mono text-sm ${change >= 0 ? "text-amber" : "text-aqua"}`}>
            {change >= 0 ? "+" : ""}
            {change.toFixed(1)}%
          </p>
        ) : null}
      </div>
      {mode === "empty" ? (
        <p className="mt-6 text-sm text-mist">
          A continuous discharge or stage series was not returned for this window. Instantaneous readings, when present, stay in the gauge list.
        </p>
      ) : (
        <div className="mt-3 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="hydroFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3ddec0" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#3ddec0" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(168,230,214,0.08)" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "#9db4b0", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis
                tick={{ fill: "#9db4b0", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(value: number) => formatNumber(value, mode === "stage" ? 1 : 0)}
              />
              <Tooltip
                contentStyle={{
                  background: "#0c1c24",
                  border: "1px solid rgba(168,230,214,0.2)",
                  borderRadius: 12,
                  color: "#e7f4f1",
                }}
                formatter={(value) => [
                  mode === "discharge" ? `${formatNumber(Number(value), 0)} ft³/s` : `${formatNumber(Number(value), 2)} ft`,
                  mode === "discharge" ? "Discharge" : "Stage",
                ]}
              />
              <Area type="monotone" dataKey="value" stroke="#3ddec0" fill="url(#hydroFill)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function labelTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp.slice(5, 16);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric" }).format(date);
}
