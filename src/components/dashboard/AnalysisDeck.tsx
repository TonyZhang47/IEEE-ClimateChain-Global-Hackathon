"use client";

import { useEffect, useMemo, useState } from "react";
import type { HydroSnapshot, PlaceSuggestion } from "@/types/hydro";
import {
  EQUATIONS,
  answerWatershed,
  coreScore,
  exposureIndex,
  insuranceBand,
  interventions,
  languageLabels,
  propertyScenario,
  restorationRoi,
  seriesAnomaly,
  stormScenario,
  type ReportLanguage,
} from "@/lib/experience/analysis";
import { CASE_STUDIES, historicalNote } from "@/lib/experience/catalog";
import { formatNumber } from "@/lib/utils";

interface AnalysisDeckProps {
  snapshot: HydroSnapshot;
}

export function AnalysisDeck({ snapshot }: AnalysisDeckProps) {
  const [storm, setStorm] = useState(1);
  const [language, setLanguage] = useState<ReportLanguage>("en");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [compare, setCompare] = useState<HydroSnapshot | null>(null);
  const [compareStatus, setCompareStatus] = useState<string | null>(null);
  const [distance, setDistance] = useState(Math.round(snapshot.risk.nearestStreamMeters ?? 800));
  const [slope, setSlope] = useState(snapshot.risk.slopePercent ?? 2);
  const [flow, setFlow] = useState(snapshot.gauges.find((gauge) => gauge.dischargeCfs !== null)?.dischargeCfs ?? 0);

  const briefing = useMemo(() => {
    const gauge = snapshot.gauges.find((item) => item.siteId === snapshot.primarySiteId) ?? snapshot.gauges[0];
    const flowText = gauge?.dischargeCfs !== null && gauge?.dischargeCfs !== undefined
      ? `${Math.round(gauge.dischargeCfs).toLocaleString("en-US")} ft³/s at ${gauge.siteId}`
      : "no live discharge in this window";
    return `${snapshot.place.label} screens at ${snapshot.risk.score}/100 with ${snapshot.risk.confidence} confidence. Nearest reading: ${flowText}. Wetlands hold about ${snapshot.blueCarbon.annualSequestrationTco2e.toFixed(1)} tCO₂e/yr.`;
  }, [snapshot]);

  useEffect(() => {
    setTyped("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 3;
      setTyped(briefing.slice(0, index));
      if (index >= briefing.length) window.clearInterval(timer);
    }, 24);
    return () => window.clearInterval(timer);
  }, [briefing]);

  const stressed = stormScenario(snapshot, storm);
  const anomaly = seriesAnomaly(snapshot.series);
  const policy = insuranceBand(snapshot.risk.score);
  const roi = restorationRoi(snapshot.blueCarbon.wetlandAreaHa, snapshot.blueCarbon.annualSequestrationTco2e);
  const property = propertyScenario(snapshot.risk.score);
  const exposure = exposureIndex(snapshot.risk.score, snapshot.risk.nearestStreamMeters);
  const proof = coreScore(distance, slope, flow);
  const labels = languageLabels(language);
  const actions = interventions(snapshot);
  const confidenceWidth = snapshot.risk.confidence === "high" ? 88 : snapshot.risk.confidence === "medium" ? 58 : 28;

  const loadCompare = (place: PlaceSuggestion) => {
    setCompareStatus(`Loading ${place.label.split(",")[0]}…`);
    void fetch(`/api/hydro?lat=${place.latitude}&lon=${place.longitude}&label=${encodeURIComponent(place.label)}`)
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok || !isSnapshot(body)) throw new Error("Comparison snapshot failed.");
        setCompare(body);
        setCompareStatus(null);
      })
      .catch((reason: unknown) => {
        setCompare(null);
        setCompareStatus(reason instanceof Error ? reason.message : "Comparison snapshot failed.");
      });
  };

  return (
    <section className="glass space-y-4 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-mist">Ask the watershed</p>
          <p className="mt-2 min-h-16 text-sm leading-6 text-foam" aria-live="polite">{typed}</p>
        </div>
        <svg viewBox="0 0 120 120" className="h-24 w-24 shrink-0" role="img" aria-label="Score components">
          <polygon points={radarPoints(snapshot)} fill="rgba(61,222,192,0.25)" stroke="#3ddec0" strokeWidth="1.5" />
        </svg>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setAnswer(answerWatershed(question, snapshot));
        }}
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about risk, the gauge, wetlands, or the equations"
          className="w-full rounded-full border border-line bg-black/20 px-3 py-2 text-sm text-foam outline-none"
        />
        <button type="submit" className="btn-primary">Ask</button>
      </form>
      {answer ? <p className="text-sm text-mist">{answer}</p> : null}
      <div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-mist">100-year stress, labeled scenario</p>
        <input className="mt-2 w-full" type="range" min={1} max={8} step={0.5} value={storm} onChange={(event) => setStorm(Number(event.target.value))} />
        <p className="mt-1 text-sm text-foam">
          {storm.toFixed(1)}× discharge moves the core index from {snapshot.risk.score} to {stressed.total}. Depression bonuses are not reapplied.
        </p>
      </div>
      <p className="text-sm text-mist">{anomaly.note}</p>
      <div>
        <div className="mb-1 flex justify-between text-[11px] uppercase tracking-[0.14em] text-mist">
          <span>Confidence</span>
          <span>{snapshot.risk.confidence}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10">
          <div className="h-full rounded-full bg-aqua" style={{ width: `${confidenceWidth}%` }} />
        </div>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-mist">Three interventions</p>
        <ul className="mt-2 space-y-2 text-sm text-mist">
          {actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Fact title={labels.policy} body={`${policy.band}. ${policy.note}`} />
        <Fact title="Restoration worksheet" body={`${formatNumber(roi.cost, 0)} cost vs ${formatNumber(roi.benefit, 0)} undiscounted benefit (${roi.ratio}×). ${roi.note}`} />
        <Fact title="Property sensitivity" body={`${property.percent}% on this score. ${property.note}`} />
        <Fact title="Exposure index" body={`${exposure}/100 from the flood score and stream distance. Population and income are not in this number.`} />
      </div>
      <p className="text-sm text-mist">{historicalNote(snapshot.place.label)}</p>
      <p className="text-sm text-mist">
        Blue carbon in this window is {formatNumber(snapshot.blueCarbon.annualSequestrationTco2e, 2)} tCO₂e/yr from {snapshot.blueCarbon.dominantType}. Regulatory compliance is not determined here.
      </p>
      <div className="flex flex-wrap gap-1">
        {(["en", "es", "fr", "zh", "tr"] as ReportLanguage[]).map((code) => (
          <button key={code} type="button" className={language === code ? "btn-primary" : "btn-ghost"} onClick={() => setLanguage(code)}>
            {code}
          </button>
        ))}
      </div>
      <p className="text-xs text-mist">Language buttons rename the desk headings. The measured narrative stays in English so a translation cannot invent a number.</p>
      <div>
        <p className="text-[11px] uppercase tracking-[0.14em] text-mist">Compare</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {CASE_STUDIES.filter((place) => place.label !== snapshot.place.label).slice(0, 4).map((place) => (
            <button key={place.id} type="button" className="btn-ghost" onClick={() => loadCompare(place)}>
              {place.label.split(",")[0]}
            </button>
          ))}
        </div>
        {compareStatus ? <p className="mt-2 text-sm text-mist">{compareStatus}</p> : null}
        {compare ? (
          <p className="mt-2 text-sm text-foam">
            {snapshot.place.label.split(",")[0]} {snapshot.risk.score}/100 versus {compare.place.label.split(",")[0]} {compare.risk.score}/100.
            The higher screen is {snapshot.risk.score >= compare.risk.score ? snapshot.place.label.split(",")[0] : compare.place.label.split(",")[0]}.
          </p>
        ) : null}
      </div>
      <details className="rounded-xl border border-line px-3 py-2">
        <summary className="cursor-pointer text-sm text-foam">{labels.proof}</summary>
        <div className="mt-3 space-y-2 text-sm text-mist">
          {EQUATIONS.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <label className="block">Distance {distance} m
            <input className="w-full" type="range" min={0} max={2000} value={distance} onChange={(event) => setDistance(Number(event.target.value))} />
          </label>
          <label className="block">Slope {slope.toFixed(1)}%
            <input className="w-full" type="range" min={0} max={12} step={0.1} value={slope} onChange={(event) => setSlope(Number(event.target.value))} />
          </label>
          <label className="block">Discharge {Math.round(flow)} ft³/s
            <input className="w-full" type="range" min={0} max={20000} step={10} value={flow} onChange={(event) => setFlow(Number(event.target.value))} />
          </label>
          <p className="font-mono text-foam">
            {proof.proximity}/40 + {proof.slope}/30 + {proof.discharge}/30 = {proof.total}
          </p>
          <p>The same core terms are in notebooks/hydro_score.py. The live index can differ when the depression bonus or a fallback discharge term is used.</p>
        </div>
      </details>
    </section>
  );
}

function Fact({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-line bg-black/20 p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-aqua">{title}</p>
      <p className="mt-2 text-sm text-mist">{body}</p>
    </div>
  );
}

function radarPoints(snapshot: HydroSnapshot): string {
  const values = [
    snapshot.risk.proximityComponent / 40,
    snapshot.risk.slopeComponent / 30,
    snapshot.risk.dischargeComponent / 30,
    Math.min(1, snapshot.blueCarbon.score / 100),
  ];
  const center = 60;
  const radius = 46;
  return values
    .map((value, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 2;
      const x = center + Math.cos(angle) * radius * value;
      const y = center + Math.sin(angle) * radius * value;
      return `${x},${y}`;
    })
    .join(" ");
}

function isSnapshot(value: unknown): value is HydroSnapshot {
  return typeof value === "object" && value !== null && "risk" in value && "place" in value && "blueCarbon" in value;
}
