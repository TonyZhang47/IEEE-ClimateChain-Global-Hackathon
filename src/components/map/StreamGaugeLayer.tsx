"use client";

import { useEffect, useRef, useState } from "react";
import type { GaugeReading, GaugeSeriesPoint } from "@/types/hydro";
import { formatNumber } from "@/lib/utils";

interface StreamGaugeLayerProps {
  map: import("maplibre-gl").Map | null;
  gauges: GaugeReading[];
  onSelect: (gauge: GaugeReading) => void;
}

export function StreamGaugeLayer({ map, gauges, onSelect }: StreamGaugeLayerProps) {
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!map) return;
    let markers: import("maplibre-gl").Marker[] = [];
    let cancelled = false;

    const mount = async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled) return;
      try {
      markers = gauges.map((gauge) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gauge-pin";
        button.dataset.flow = pulseBand(gauge.dischargeCfs);
        button.dataset.live = gauge.dischargeCfs !== null || gauge.gageHeightFt !== null ? "yes" : "no";
        button.title = gauge.siteName;
        const value = document.createElement("strong");
        value.textContent =
          gauge.dischargeCfs !== null
            ? formatNumber(gauge.dischargeCfs, 0)
            : gauge.gageHeightFt !== null
              ? `${formatNumber(gauge.gageHeightFt, 1)} ft`
              : "Gage";
        const unit = document.createElement("span");
        unit.textContent = gauge.dischargeCfs !== null ? "cfs" : gauge.siteId;
        button.append(value, unit);
        button.addEventListener("click", () => onSelectRef.current(gauge));
        return new maplibre.Marker({ element: button, anchor: "bottom" })
          .setLngLat([gauge.longitude, gauge.latitude])
          .addTo(map);
      });
      } catch (error) {
        map.getContainer().dataset.gaugeError = error instanceof Error ? error.message : "gauge layer failed";
      }
    };

    void mount();
    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.remove());
    };
  }, [map, gauges]);

  return null;
}

const PERIODS = [
  { id: "P1D", label: "24h" },
  { id: "P7D", label: "7d" },
  { id: "P30D", label: "30d" },
  { id: "P365D", label: "1y" },
] as const;

export function GaugeDetail({
  gauge,
  riskScore = null,
  onAnchor,
}: {
  gauge: GaugeReading;
  riskScore?: number | null;
  onAnchor?: () => void;
}) {
  const [series, setSeries] = useState<GaugeSeriesPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("P7D");

  useEffect(() => {
    const controller = new AbortController();
    setSeries(null);
    setError(null);
    void fetch(`/api/hydro?site=${encodeURIComponent(gauge.siteId)}&period=${period}`, { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error("Gauge history was not available.");
        if (!isSeriesPayload(body)) throw new Error("Gauge history was empty.");
        setSeries(body.series);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Gauge history failed.");
      });
    return () => controller.abort();
  }, [gauge.siteId, period]);

  return (
    <div className="space-y-3 text-sm">
      <p className="text-mist">{gauge.siteName}</p>
      <p className="text-xs text-mist">
        {riskScore === null
          ? "The screening index belongs to the searched point, not to this gauge by itself."
          : `Watershed screen ${riskScore}/100. The instantaneous feed does not include an NWS flood category, so this pin is not colored as flood stage.`}
      </p>
      {series && series.some((point) => point.dischargeCfs !== null) ? <Sparkline series={series} /> : null}
      <dl className="grid grid-cols-2 gap-3">
        <Metric label="Discharge" value={gauge.dischargeCfs === null ? "—" : `${formatNumber(gauge.dischargeCfs, 0)} ft³/s`} />
        <Metric label="Stage" value={gauge.gageHeightFt === null ? "—" : `${formatNumber(gauge.gageHeightFt, 2)} ft`} />
        <Metric label="Distance" value={`${formatNumber(gauge.distanceMeters, 0)} m`} />
        <Metric label="Updated" value={gauge.timestamp ? gauge.timestamp.replace("T", " ").slice(0, 16) : "—"} />
      </dl>
      <div className="flex flex-wrap gap-1">
        {PERIODS.map((item) => (
          <button key={item.id} type="button" className={period === item.id ? "btn-primary" : "btn-ghost"} onClick={() => setPeriod(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <p className="text-mist">
        {series === null && !error ? "Loading gauge history…" : null}
        {error}
        {series ? `${series.length} readings for ${PERIODS.find((item) => item.id === period)?.label ?? period}. Daily values are used past seven days.` : null}
      </p>
      <a
        className="inline-flex text-aqua underline-offset-4 hover:underline"
        href={`https://waterdata.usgs.gov/monitoring-location/${gauge.siteId}/`}
        target="_blank"
        rel="noreferrer"
      >
        Open USGS monitoring location
      </a>
      {onAnchor ? (
        <button type="button" className="btn-primary" onClick={onAnchor}>
          Anchor hash to chain
        </button>
      ) : null}
      <p className="text-xs text-mist">
        Anchoring writes the watershed snapshot hash from the chain desk. It does not send a second transaction from this drawer.
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-black/20 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-[0.14em] text-mist">{label}</dt>
      <dd className="mt-1 font-mono text-foam">{value}</dd>
    </div>
  );
}

function Sparkline({ series }: { series: GaugeSeriesPoint[] }) {
  const values = series.map((point) => point.dischargeCfs).filter((value): value is number => value !== null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 280;
      const y = 48 - ((value - min) / span) * 40;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 280 56" className="w-full" role="img" aria-label="Discharge trend for the selected period">
      <polyline fill="none" stroke="#3ddec0" strokeWidth="2" points={points} />
    </svg>
  );
}

function pulseBand(dischargeCfs: number | null): "high" | "mid" | "low" | "idle" {
  if (dischargeCfs === null) return "idle";
  if (dischargeCfs >= 5000) return "high";
  if (dischargeCfs >= 500) return "mid";
  return "low";
}

function isSeriesPayload(value: unknown): value is { series: GaugeSeriesPoint[] } {
  return typeof value === "object" && value !== null && Array.isArray((value as { series?: unknown }).series);
}
