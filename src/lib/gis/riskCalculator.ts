import { area, length, lineString, nearestPointOnLine, point } from "@turf/turf";
import type { Feature, FeatureCollection, LineString, Polygon, Position } from "geojson";
import type {
  BlueCarbonRating,
  ElevationSample,
  FloodRiskScore,
  GaugeReading,
  WetlandFeature,
} from "@/types/hydro";
import { clamp, roundTo } from "@/lib/api/http";
import { flattenLinePositions, haversineMeters, lineLengthMeters } from "@/lib/gis/flowDirection";

const SEQUESTRATION_RATES: Record<string, number> = {
  mangrove: 8.5,
  "salt marsh": 8,
  "tidal marsh": 8,
  marsh: 7.2,
  shrub: 4,
  swamp: 4.5,
  bog: 2.4,
  fen: 2.6,
  peat: 2.2,
  lake: 0.35,
  pond: 0.4,
  wetland: 3.5,
};

export function sequestrationRate(wetlandType: string): number {
  const normalized = wetlandType.toLowerCase();
  for (const [key, rate] of Object.entries(SEQUESTRATION_RATES)) {
    if (normalized.includes(key)) return rate;
  }
  return SEQUESTRATION_RATES.wetland ?? 3.5;
}

export function nearestStreamMeters(
  latitude: number,
  longitude: number,
  streams: FeatureCollection<LineString>,
): number | null {
  const origin = point([longitude, latitude]);
  let best: number | null = null;

  for (const feature of streams.features) {
    const coords = feature.geometry.coordinates
      .map((position) => flattenLinePositions(position))
      .filter((pair): pair is [number, number] => pair !== null);
    if (coords.length < 2) continue;
    if (lineLengthMeters(coords) < 30) continue;
    try {
      const snapped = nearestPointOnLine(lineString(coords), origin, { units: "kilometers" });
      const distKm = snapped.properties.dist;
      if (typeof distKm !== "number" || !Number.isFinite(distKm)) {
        const fallback = distanceToCoords(latitude, longitude, coords);
        best = best === null ? fallback : Math.min(best, fallback);
        continue;
      }
      const meters = distKm * 1000;
      best = best === null ? meters : Math.min(best, meters);
    } catch {
      const fallback = distanceToCoords(latitude, longitude, coords);
      best = best === null ? fallback : Math.min(best, fallback);
    }
  }

  return best === null ? null : roundTo(best, 1);
}

function distanceToCoords(latitude: number, longitude: number, coords: [number, number][]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const [lon, lat] of coords) {
    best = Math.min(best, haversineMeters(latitude, longitude, lat, lon));
  }
  return best;
}

export function slopeFromSamples(samples: ElevationSample[]): {
  elevationM: number | null;
  slopePercent: number | null;
  depressionMeters: number | null;
} {
  if (samples.length === 0) {
    return { elevationM: null, slopePercent: null, depressionMeters: null };
  }
  const center = samples[0];
  if (!center) {
    return { elevationM: null, slopePercent: null, depressionMeters: null };
  }
  const neighbors = samples.slice(1);
  if (neighbors.length === 0) {
    return { elevationM: roundTo(center.elevationM, 1), slopePercent: null, depressionMeters: null };
  }
  let maxDiff = 0;
  let neighborSum = 0;
  for (const neighbor of neighbors) {
    const horizontal = Math.max(1, haversineMeters(center.latitude, center.longitude, neighbor.latitude, neighbor.longitude));
    const diff = Math.abs(neighbor.elevationM - center.elevationM);
    maxDiff = Math.max(maxDiff, (diff / horizontal) * 100);
    neighborSum += neighbor.elevationM;
  }
  const meanNeighbor = neighborSum / neighbors.length;
  const depression = meanNeighbor - center.elevationM;
  return {
    elevationM: roundTo(center.elevationM, 1),
    slopePercent: roundTo(maxDiff, 2),
    depressionMeters: roundTo(Math.max(0, depression), 2),
  };
}

export function calculateFloodRisk(input: {
  nearestStreamMeters: number | null;
  elevationM: number | null;
  slopePercent: number | null;
  depressionMeters: number | null;
  gauges: GaugeReading[];
  streamCount: number;
  usedFallbackStreams: boolean;
  elevationAvailable: boolean;
}): FloodRiskScore {
  const rationale: string[] = [];
  let proximity = 8;
  if (input.nearestStreamMeters === null) {
    rationale.push("No stream geometry was available, so proximity uses a low prior of 8/40.");
  } else {
    proximity = clamp(40 * Math.exp(-input.nearestStreamMeters / 350), 0, 40);
    const sourceLabel = input.usedFallbackStreams ? "modeled tributary" : "mapped stream";
    rationale.push(
      `Nearest ${sourceLabel} is ${Math.round(input.nearestStreamMeters).toLocaleString("en-US")} m from the point (proximity ${proximity.toFixed(1)}/40).`,
    );
  }

  let slopeComponent = 12;
  if (input.slopePercent === null) {
    rationale.push("Elevation samples were unavailable, so the slope term uses a mid prior of 12/30.");
  } else {
    slopeComponent = clamp(30 * (1 - clamp(input.slopePercent / 12, 0, 1)), 0, 30);
    const depression = input.depressionMeters ?? 0;
    if (depression >= 2) {
      slopeComponent = clamp(slopeComponent + Math.min(8, depression), 0, 30);
      rationale.push(
        `The point sits ${depression.toFixed(1)} m below the surrounding 250 m samples, which adds ponding potential.`,
      );
    }
    rationale.push(
      `Cross-slope is ${input.slopePercent.toFixed(2)}%${input.elevationM !== null ? ` at ${input.elevationM.toFixed(1)} m elevation` : ""} (slope ${slopeComponent.toFixed(1)}/30).`,
    );
  }

  let discharge = 0;
  const withFlow = input.gauges
    .filter((gauge) => gauge.dischargeCfs !== null)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
  const nearestFlow = withFlow[0];
  const nearestStage = [...input.gauges]
    .filter((gauge) => gauge.gageHeightFt !== null)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
  if (nearestFlow && nearestFlow.dischargeCfs !== null) {
    discharge = clamp((30 * Math.log10(nearestFlow.dischargeCfs + 1)) / Math.log10(50000), 0, 30);
    rationale.push(
      `Nearest discharge reading is ${Math.round(nearestFlow.dischargeCfs).toLocaleString("en-US")} ft³/s at ${nearestFlow.siteName} (${nearestFlow.siteId}), ${Math.round(nearestFlow.distanceMeters).toLocaleString("en-US")} m away (flow ${discharge.toFixed(1)}/30).`,
    );
  } else if (nearestStage && nearestStage.gageHeightFt !== null) {
    const stage = nearestStage.gageHeightFt;
    discharge = clamp((stage / 20) * 30, 0, 30);
    rationale.push(
      `No discharge value was published. Gage height ${stage.toFixed(2)} ft at ${nearestStage.siteId} is used as a stage proxy (flow ${discharge.toFixed(1)}/30).`,
    );
  } else {
    discharge = clamp(input.streamCount * 2.2, 0, 18);
    rationale.push(
      input.gauges.length === 0
        ? `No USGS gauge falls inside the search window. Stream density (${input.streamCount} reaches) supplies a capped proxy of ${discharge.toFixed(1)}/30.`
        : `Gauges were found but instantaneous discharge was empty. Stream density supplies ${discharge.toFixed(1)}/30.`,
    );
  }

  const score = Math.round(clamp(proximity + slopeComponent + discharge, 0, 100));
  let confidence: FloodRiskScore["confidence"] = "low";
  if (!input.usedFallbackStreams && input.elevationAvailable && nearestFlow) confidence = "high";
  else if (!input.usedFallbackStreams && (input.elevationAvailable || nearestFlow)) confidence = "medium";

  rationale.push(
    `Flood vulnerability index is ${score}/100. This is a screening score, not a regulatory floodplain determination.`,
  );

  return {
    score,
    slopeComponent: roundTo(slopeComponent, 1),
    proximityComponent: roundTo(proximity, 1),
    dischargeComponent: roundTo(discharge, 1),
    elevationM: input.elevationM,
    slopePercent: input.slopePercent,
    nearestStreamMeters: input.nearestStreamMeters,
    depressionMeters: input.depressionMeters,
    confidence,
    rationale,
  };
}

export function calculateBlueCarbon(wetlands: WetlandFeature[]): BlueCarbonRating {
  if (wetlands.length === 0) {
    return {
      score: 0,
      wetlandAreaHa: 0,
      annualSequestrationTco2e: 0,
      dominantType: "none mapped",
      rationale: [
        "No wetland polygons were returned inside the analysis window, so blue-carbon sequestration is 0 tCO₂e/yr.",
      ],
    };
  }

  const areaHa = wetlands.reduce((sum, wetland) => sum + wetland.areaHa, 0);
  const annual = wetlands.reduce((sum, wetland) => sum + wetland.sequestrationTco2ePerYear, 0);
  const dominant = wetlands.reduce((best, wetland) =>
    wetland.sequestrationTco2ePerYear > best.sequestrationTco2ePerYear ? wetland : best,
  );
  const score = Math.round(clamp(100 * (1 - Math.exp(-annual / 25)), 0, 100));

  return {
    score,
    wetlandAreaHa: roundTo(areaHa, 2),
    annualSequestrationTco2e: roundTo(annual, 2),
    dominantType: dominant.wetlandType,
    rationale: [
      `${wetlands.length} wetland polygon${wetlands.length === 1 ? "" : "s"} cover ${areaHa.toFixed(2)} ha.`,
      `Dominant class is ${dominant.wetlandType} at ${sequestrationRate(dominant.wetlandType).toFixed(1)} tCO₂e/ha/yr.`,
      `Estimated sequestration is ${annual.toFixed(2)} tCO₂e/yr, which rates ${score}/100 on a saturating local scale.`,
    ],
  };
}

export function wetlandFromPolygon(
  id: string,
  name: string,
  wetlandType: string,
  geometry: Polygon,
): WetlandFeature | null {
  const feature: Feature<Polygon> = {
    type: "Feature",
    properties: {},
    geometry,
  };
  let squareMeters = 0;
  try {
    squareMeters = area(feature);
  } catch {
    return null;
  }
  if (!Number.isFinite(squareMeters) || squareMeters < 500) return null;
  const areaHa = squareMeters / 10000;
  const rate = sequestrationRate(wetlandType);
  const ring = geometry.coordinates[0];
  if (!ring || ring.length === 0) return null;
  const centroid = ringCentroid(ring);
  return {
    id,
    name,
    wetlandType,
    areaHa: roundTo(areaHa, 3),
    sequestrationTco2ePerYear: roundTo(areaHa * rate, 3),
    latitude: centroid.latitude,
    longitude: centroid.longitude,
  };
}

function ringCentroid(ring: Position[]): { latitude: number; longitude: number } {
  let lonSum = 0;
  let latSum = 0;
  let count = 0;
  for (const position of ring) {
    const pair = flattenLinePositions(position);
    if (!pair) continue;
    lonSum += pair[0];
    latSum += pair[1];
    count += 1;
  }
  if (count === 0) return { latitude: 0, longitude: 0 };
  return { latitude: latSum / count, longitude: lonSum / count };
}

export function streamLengthKm(feature: Feature<LineString>): number {
  try {
    return length(lineString(feature.geometry.coordinates), { units: "kilometers" });
  } catch {
    const coords = feature.geometry.coordinates
      .map((position) => flattenLinePositions(position))
      .filter((pair): pair is [number, number] => pair !== null);
    return lineLengthMeters(coords) / 1000;
  }
}
