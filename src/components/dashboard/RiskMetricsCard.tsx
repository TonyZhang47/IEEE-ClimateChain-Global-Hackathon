"use client";

import { useEffect, useState } from "react";
import type { BlueCarbonRating, FloodRiskScore } from "@/types/hydro";
import { formatNumber } from "@/lib/utils";

interface RiskMetricsCardProps {
  risk: FloodRiskScore;
  blueCarbon: BlueCarbonRating;
}

export function RiskMetricsCard({ risk, blueCarbon }: RiskMetricsCardProps) {
  const tone = risk.score >= 75 ? "text-coral" : risk.score >= 45 ? "text-amber" : "text-aqua";

  return (
    <section className="glass rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-mist">Flood vulnerability</p>
          <p className={`mt-1 font-mono text-5xl leading-none ${tone}`}><Count value={risk.score} /></p>
          <p className="mt-2 text-xs text-mist">Confidence {risk.confidence} · screening index, not a flood map</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mist">Blue carbon</p>
          <p className="mt-1 font-mono text-3xl text-aqua"><Count value={blueCarbon.score} /></p>
          <p className="mt-2 text-xs text-mist">{formatNumber(blueCarbon.annualSequestrationTco2e, 2)} tCO₂e/yr</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Bar label="Proximity" value={risk.proximityComponent} max={40} />
        <Bar label="Slope" value={risk.slopeComponent} max={30} />
        <Bar label="Discharge" value={risk.dischargeComponent} max={30} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <Fact label="Elevation" value={risk.elevationM === null ? "—" : `${formatNumber(risk.elevationM, 1)} m`} />
        <Fact label="Slope" value={risk.slopePercent === null ? "—" : `${formatNumber(risk.slopePercent, 2)}%`} />
        <Fact
          label="Nearest stream"
          value={risk.nearestStreamMeters === null ? "—" : `${formatNumber(risk.nearestStreamMeters, 0)} m`}
        />
      </dl>
      <ul className="mt-4 space-y-2 text-sm text-mist">
        {risk.rationale.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {blueCarbon.rationale.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

function Count({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(value);
      return;
    }
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 700);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown}</>;
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] uppercase tracking-[0.14em] text-mist">
        <span>{label}</span>
        <span className="font-mono text-foam">
          {value.toFixed(1)}/{max}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-aqua" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-black/20 px-2 py-2">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-mist">{label}</dt>
      <dd className="mt-1 font-mono text-foam">{value}</dd>
    </div>
  );
}
