import type { GaugeSeriesPoint, HydroSnapshot } from "@/types/hydro";
import { clamp } from "@/lib/api/http";

export interface ScoreParts {
  proximity: number;
  slope: number;
  discharge: number;
  total: number;
}

export function coreScore(distanceM: number, slopePercent: number, dischargeCfs: number): ScoreParts {
  const proximity = clamp(40 * Math.exp(-Math.max(0, distanceM) / 350), 0, 40);
  const slope = clamp(30 * (1 - clamp(slopePercent / 12, 0, 1)), 0, 30);
  const discharge = clamp((30 * Math.log10(Math.max(0, dischargeCfs) + 1)) / Math.log10(50000), 0, 30);
  return {
    proximity: round1(proximity),
    slope: round1(slope),
    discharge: round1(discharge),
    total: Math.round(clamp(proximity + slope + discharge, 0, 100)),
  };
}

export function stormScenario(snapshot: HydroSnapshot, multiplier: number): ScoreParts {
  const distance = snapshot.risk.nearestStreamMeters ?? 800;
  const slope = snapshot.risk.slopePercent ?? 3;
  const gauge = snapshot.gauges.find((item) => item.dischargeCfs !== null);
  const baseFlow = gauge?.dischargeCfs ?? 0;
  return coreScore(distance, slope, baseFlow * multiplier);
}

export function seriesAnomaly(series: GaugeSeriesPoint[]): { z: number | null; note: string } {
  const values = series.map((point) => point.dischargeCfs).filter((value): value is number => value !== null);
  if (values.length < 8) {
    return { z: null, note: "Fewer than eight discharge readings, so a z-score is not computed." };
  }
  const last = values[values.length - 1] ?? 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const deviation = Math.sqrt(variance);
  if (deviation < 1) return { z: 0, note: "The series is nearly flat. No discharge outlier stands out." };
  const z = (last - mean) / deviation;
  const note = Math.abs(z) >= 2.5
    ? `The latest discharge is ${z.toFixed(1)} standard deviations from the 7-day mean. Confirm the gauge before treating it as a flood wave.`
    : `The latest discharge is ${z.toFixed(1)} standard deviations from the 7-day mean, inside a routine band.`;
  return { z: round1(z), note };
}

export function insuranceBand(score: number): { band: string; note: string } {
  if (score >= 75) return { band: "High screening band", note: "A score at or above 75 would pause dREC minting. This is not an insurance quote or an NFIP determination." };
  if (score >= 45) return { band: "Elevated screening band", note: "Elevated river exposure. A lender or insurer would still need an elevation certificate and a regulatory map." };
  if (score >= 25) return { band: "Moderate screening band", note: "Moderate screen. Keep the gauge id with the file and revisit after the next high-flow week." };
  return { band: "Lower screening band", note: "Lower river screen inside this window. Coastal surge and local drainage are not included." };
}

export function restorationRoi(areaHa: number, sequestration: number): { cost: number; benefit: number; ratio: number; note: string } {
  const cost = areaHa * 2000;
  const benefit = sequestration * 50 * 20;
  const ratio = cost > 0 ? benefit / cost : 0;
  return {
    cost: Math.round(cost),
    benefit: Math.round(benefit),
    ratio: round1(ratio),
    note: "Illustrative only: $2,000 per hectare restoration cost, $50 per tCO₂e, 20 years, no discount rate. Not an appraisal.",
  };
}

export function exposureIndex(score: number, distanceM: number | null): number {
  const near = distanceM === null ? 0.5 : 1 - clamp(distanceM / 2000, 0, 1);
  return Math.round(clamp(score * (0.45 + 0.55 * near), 0, 100));
}

export function interventions(snapshot: HydroSnapshot): string[] {
  const items = [
    snapshot.risk.nearestStreamMeters !== null && snapshot.risk.nearestStreamMeters < 400
      ? "Keep a vegetated bank buffer along the nearest channel before adding fill or a wall."
      : "The channel is not at the doorstep. Spend the first dollar on drainage maintenance and gauge watching.",
    snapshot.blueCarbon.wetlandAreaHa > 1
      ? "Restore the mapped emergent wetland edge instead of replacing it with a hard structure."
      : "No sizable wetland was mapped. A small offline storage swale is the proportionate first intervention.",
    snapshot.risk.score >= 60
      ? "Where structures already sit in the low ground, raise utilities and confirm the access road before a new barrier."
      : "A new seawall is not the first move at this score. Confirm the local drainage path and the gauge trend.",
  ];
  return items;
}

export function propertyScenario(score: number): { percent: number; note: string } {
  const percent = round1(clamp((score - 25) * 0.15, 0, 12));
  return {
    percent,
    note: "Illustrative sensitivity, not a 30-year forecast or an appraisal. It scales only with this screening score.",
  };
}

export const EQUATIONS = [
  "Proximity = 40 × exp(−distanceMeters / 350), capped at 40.",
  "Slope = 30 × (1 − min(slopePercent / 12, 1)). A center more than 2 m below the 250 m cross adds up to 8 points, still inside the 30-point cap.",
  "Discharge = 30 × log10(cfs + 1) / log10(50000). Stage/20 × 30 is the fallback. Stream count × 2.2 (cap 18) is the last resort.",
  "Flood index = round(proximity + slope + discharge), clamped to 0–100.",
  "Sequestration = Σ areaHectares × classRate. Marsh 7.2, salt marsh 8, mangrove 8.5, swamp 4.5, lake 0.35, pond 0.4 tCO₂e/ha/year.",
  "Carbon rating = round(100 × (1 − exp(−annualTonnes / 25))).",
  "dREC amount = min(floor(annualTonnes × 10), (100 − floodIndex) × 10), and only if the flood index is 75 or below.",
];

export type ReportLanguage = "en" | "es" | "fr" | "zh" | "tr";

const LABELS: Record<ReportLanguage, { community: string; policy: string; proof: string }> = {
  en: { community: "Community", policy: "Policy", proof: "Equations" },
  es: { community: "Comunidad", policy: "Política", proof: "Ecuaciones" },
  fr: { community: "Collectivité", policy: "Politique", proof: "Équations" },
  zh: { community: "社区", policy: "政策", proof: "公式" },
  tr: { community: "Topluluk", policy: "Politika", proof: "Denklemler" },
};

export function languageLabels(language: ReportLanguage): { community: string; policy: string; proof: string } {
  return LABELS[language];
}

export function answerWatershed(question: string, snapshot: HydroSnapshot): string {
  const q = question.toLowerCase();
  const gauge = snapshot.gauges.find((item) => item.siteId === snapshot.primarySiteId) ?? snapshot.gauges[0];
  if (q.includes("carbon") || q.includes("wetland")) {
    return `${snapshot.blueCarbon.wetlandAreaHa.toFixed(2)} ha are mapped, about ${snapshot.blueCarbon.annualSequestrationTco2e.toFixed(2)} tCO₂e/yr, led by ${snapshot.blueCarbon.dominantType}. Rating ${snapshot.blueCarbon.score}/100.`;
  }
  if (q.includes("gauge") || q.includes("discharge") || q.includes("river") || q.includes("flow")) {
    if (!gauge) return "No USGS gauge was returned inside this window.";
    const flow = gauge.dischargeCfs === null ? "no discharge value" : `${Math.round(gauge.dischargeCfs).toLocaleString("en-US")} ft³/s`;
    return `${gauge.siteName} (${gauge.siteId}) is ${Math.round(gauge.distanceMeters).toLocaleString("en-US")} m away at ${flow}.`;
  }
  if (q.includes("safe") || q.includes("risk") || q.includes("flood")) {
    return `The screening index is ${snapshot.risk.score}/100 with ${snapshot.risk.confidence} confidence. ${snapshot.risk.rationale[0] ?? ""}`;
  }
  if (q.includes("equation") || q.includes("math") || q.includes("how")) {
    return EQUATIONS[0] + " " + EQUATIONS[3];
  }
  return `This desk only answers from the active snapshot for ${snapshot.place.label}. Ask about flood risk, the gauge, wetlands, or the equations.`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
