import { synthesizeAdvisory } from "@/lib/ai/grokClient";
import { asNumber, asString, isRecord } from "@/lib/api/http";
import type { BlueCarbonRating, FloodRiskScore, GaugeReading, HydroSnapshot, PlaceSuggestion, WetlandFeature } from "@/types/hydro";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const snapshot = readSnapshot(body);
  if (!snapshot) {
    return Response.json({ error: "The analysis payload is missing place, risk, or carbon fields." }, { status: 400 });
  }

  const advisory = await synthesizeAdvisory(snapshot);
  return Response.json(advisory);
}

function readSnapshot(body: unknown): HydroSnapshot | null {
  if (!isRecord(body) || !isRecord(body.place) || !isRecord(body.risk) || !isRecord(body.blueCarbon)) return null;
  const latitude = asNumber(body.place.latitude);
  const longitude = asNumber(body.place.longitude);
  const label = asString(body.place.label);
  const score = asNumber(body.risk.score);
  const carbonScore = asNumber(body.blueCarbon.score);
  if (latitude === null || longitude === null || !label || score === null || carbonScore === null) return null;

  const place: PlaceSuggestion = {
    id: asString(body.place.id) ?? `${latitude},${longitude}`,
    label,
    latitude,
    longitude,
    country: asString(body.place.country) ?? undefined,
    kind: asString(body.place.kind) ?? undefined,
  };

  const risk: FloodRiskScore = {
    score,
    slopeComponent: asNumber(body.risk.slopeComponent) ?? 0,
    proximityComponent: asNumber(body.risk.proximityComponent) ?? 0,
    dischargeComponent: asNumber(body.risk.dischargeComponent) ?? 0,
    elevationM: asNumber(body.risk.elevationM),
    slopePercent: asNumber(body.risk.slopePercent),
    nearestStreamMeters: asNumber(body.risk.nearestStreamMeters),
    depressionMeters: asNumber(body.risk.depressionMeters),
    confidence: body.risk.confidence === "high" || body.risk.confidence === "medium" || body.risk.confidence === "low" ? body.risk.confidence : "low",
    rationale: stringList(body.risk.rationale),
  };

  const blueCarbon: BlueCarbonRating = {
    score: carbonScore,
    wetlandAreaHa: asNumber(body.blueCarbon.wetlandAreaHa) ?? 0,
    annualSequestrationTco2e: asNumber(body.blueCarbon.annualSequestrationTco2e) ?? 0,
    dominantType: asString(body.blueCarbon.dominantType) ?? "unknown",
    rationale: stringList(body.blueCarbon.rationale),
  };

  const streamSource =
    body.streamSource === "nhd" || body.streamSource === "overpass" || body.streamSource === "deterministic-flow-model"
      ? body.streamSource
      : "overpass";

  return {
    place,
    gauges: readGauges(body.gauges),
    primarySiteId: asString(body.primarySiteId),
    series: [],
    streams: { type: "FeatureCollection", features: [] },
    streamSource,
    wetlands: readWetlands(body.wetlands),
    wetlandGeometry: { type: "FeatureCollection", features: [] },
    risk,
    blueCarbon,
    wayback: null,
    sources: stringList(body.sources),
    notices: stringList(body.notices),
    fetchedAt: asString(body.fetchedAt) ?? new Date().toISOString(),
  };
}

function readGauges(value: unknown): GaugeReading[] {
  if (!Array.isArray(value)) return [];
  const gauges: GaugeReading[] = [];
  for (const row of value) {
    if (!isRecord(row)) continue;
    const siteId = asString(row.siteId);
    const siteName = asString(row.siteName);
    const latitude = asNumber(row.latitude);
    const longitude = asNumber(row.longitude);
    if (!siteId || !siteName || latitude === null || longitude === null) continue;
    gauges.push({
      siteId,
      siteName,
      latitude,
      longitude,
      dischargeCfs: asNumber(row.dischargeCfs),
      gageHeightFt: asNumber(row.gageHeightFt),
      timestamp: asString(row.timestamp),
      distanceMeters: asNumber(row.distanceMeters) ?? 0,
    });
  }
  return gauges;
}

function readWetlands(value: unknown): WetlandFeature[] {
  if (!Array.isArray(value)) return [];
  const wetlands: WetlandFeature[] = [];
  for (const row of value) {
    if (!isRecord(row)) continue;
    const id = asString(row.id);
    const name = asString(row.name);
    if (!id || !name) continue;
    wetlands.push({
      id,
      name,
      wetlandType: asString(row.wetlandType) ?? "wetland",
      areaHa: asNumber(row.areaHa) ?? 0,
      sequestrationTco2ePerYear: asNumber(row.sequestrationTco2ePerYear) ?? 0,
      latitude: asNumber(row.latitude) ?? 0,
      longitude: asNumber(row.longitude) ?? 0,
    });
  }
  return wetlands;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
