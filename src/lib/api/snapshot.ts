import type { FeatureCollection, LineString, Polygon } from "geojson";
import type { HydroSnapshot, PlaceSuggestion } from "@/types/hydro";
import { fetchWaybackImagery } from "@/lib/api/esri";
import { fetchOverpassHydrography } from "@/lib/api/overpass";
import {
  emptyPolygons,
  fetchElevationProfile,
  fetchGaugeSeries,
  fetchGaugesInBBox,
  fetchNhdFlowlines,
  fetchNwiWetlands,
} from "@/lib/api/usgs";
import {
  bboxAround,
  buildFallbackStreams,
  isLikelyUsgsCoverage,
  lineLengthMeters,
} from "@/lib/gis/flowDirection";
import {
  calculateBlueCarbon,
  calculateFloodRisk,
  nearestStreamMeters,
  slopeFromSamples,
  streamLengthKm,
} from "@/lib/gis/riskCalculator";

export async function buildHydroSnapshot(place: PlaceSuggestion): Promise<HydroSnapshot> {
  const sources: string[] = [];
  const notices: string[] = [];
  const [west, south, east, north] = bboxAround(place.latitude, place.longitude, 12);
  const inUsgs = isLikelyUsgsCoverage(place.latitude, place.longitude);

  const nwiBox = bboxAround(place.latitude, place.longitude, 8);
  const [gaugeResult, nhdResult, overpassResult, elevationResult, waybackResult, nwiResult] = await Promise.all([
    inUsgs
      ? fetchGaugesInBBox(west, south, east, north, place.latitude, place.longitude)
          .then((gauges) => ({ gauges, ok: true as const }))
          .catch((error: unknown) => ({ gauges: [], ok: false as const, error }))
      : Promise.resolve({ gauges: [], ok: true as const }),
    inUsgs
      ? fetchNhdFlowlines(west, south, east, north)
          .then((streams) => ({ streams, ok: true as const }))
          .catch((error: unknown) => ({
            streams: emptyLineCollection(),
            ok: false as const,
            error,
          }))
      : Promise.resolve({ streams: emptyLineCollection(), ok: true as const }),
    fetchOverpassHydrography(west, south, east, north)
      .then((hydro) => ({ hydro, ok: true as const }))
      .catch((error: unknown) => ({ hydro: null, ok: false as const, error })),
    fetchElevationProfile(place.latitude, place.longitude)
      .then((samples) => ({ samples, ok: true as const }))
      .catch(() => ({ samples: [], ok: false as const })),
    fetchWaybackImagery().catch(() => null),
    inUsgs
      ? fetchNwiWetlands(nwiBox[0], nwiBox[1], nwiBox[2], nwiBox[3])
          .then((inventory) => ({ inventory, ok: true as const }))
          .catch((error: unknown) => ({ inventory: null, ok: false as const, error }))
      : Promise.resolve({ inventory: null, ok: true as const }),
  ]);

  let streams = emptyLineCollection();
  let streamSource: HydroSnapshot["streamSource"] = "overpass";
  const osmWetlands = overpassResult.ok && overpassResult.hydro ? overpassResult.hydro.wetlands : [];
  const osmWetlandGeometry: FeatureCollection<Polygon> =
    overpassResult.ok && overpassResult.hydro ? overpassResult.hydro.wetlandGeometry : emptyPolygons();
  const nwiWetlands = nwiResult.ok && nwiResult.inventory ? nwiResult.inventory.wetlands : [];
  const nwiGeometry = nwiResult.ok && nwiResult.inventory ? nwiResult.inventory.wetlandGeometry : emptyPolygons();
  const wetlands = nwiWetlands.length > 0 ? nwiWetlands : osmWetlands;
  const wetlandGeometry = nwiWetlands.length > 0 ? nwiGeometry : osmWetlandGeometry;
  if (nwiWetlands.length > 0) sources.push("USFWS National Wetlands Inventory");
  if (inUsgs && !nwiResult.ok && "error" in nwiResult) {
    notices.push(`National Wetlands Inventory did not respond (${errorText(nwiResult.error)}).`);
  }

  const nhdCount = nhdResult.streams.features.length;
  const osmStreams = overpassResult.ok && overpassResult.hydro ? overpassResult.hydro.streams : emptyLineCollection();

  if (nhdCount >= 3) {
    streams = trimStreams(nhdResult.streams);
    streamSource = "nhd";
    sources.push("USGS National Hydrography Dataset");
  }
  if (streams.features.length < 3 && osmStreams.features.length > 0) {
    streams = trimStreams(osmStreams);
    streamSource = "overpass";
    sources.push("OpenStreetMap Overpass");
  } else if (osmStreams.features.length > 0 && streamSource === "nhd") {
    sources.push("OpenStreetMap Overpass");
    if (wetlands.length === 0) {
      notices.push("NHD supplied flowlines. Wetland polygons still come from OpenStreetMap.");
    }
  }

  if (!overpassResult.ok) {
    notices.push(`OpenStreetMap hydrography did not respond (${errorText(overpassResult.error)}).`);
  }
  if (inUsgs && !nhdResult.ok && "error" in nhdResult) {
    notices.push(`National Hydrography Dataset did not respond (${errorText(nhdResult.error)}).`);
  }
  if (!inUsgs) {
    notices.push("Outside USGS gauge coverage. Discharge uses stream density unless a gauge is added later.");
  }

  if (streams.features.length === 0) {
    streams = buildFallbackStreams(place.latitude, place.longitude);
    streamSource = "deterministic-flow-model";
    sources.push("Deterministic downhill flow model");
    notices.push("Live stream geometry was empty, so the map shows a reproducible downhill model rather than surveyed rivers.");
  }

  const gauges = gaugeResult.gauges;
  if (gaugeResult.ok && inUsgs) sources.push("USGS Instantaneous Values");
  if (inUsgs && !gaugeResult.ok && "error" in gaugeResult) {
    notices.push(`USGS gauges did not respond (${errorText(gaugeResult.error)}).`);
  }
  if (gauges.length === 0 && inUsgs && gaugeResult.ok) {
    notices.push("USGS returned no active stream gauges inside a 12 km window.");
  }

  if (elevationResult.ok && elevationResult.samples.length > 0) {
    sources.push("USGS Elevation Point Query Service");
  } else {
    notices.push("Elevation service was unavailable, so slope uses a documented prior.");
  }

  if (waybackResult) sources.push("Esri imagery catalog");

  const primary = gauges.find((gauge) => gauge.dischargeCfs !== null) ?? gauges[0] ?? null;
  let series: HydroSnapshot["series"] = [];
  if (primary) {
    try {
      series = await fetchGaugeSeries(primary.siteId);
    } catch (error) {
      notices.push(`Seven-day gauge history failed (${errorText(error)}). Instantaneous values are still shown.`);
    }
  }

  const terrain = slopeFromSamples(elevationResult.samples);
  const distance = nearestStreamMeters(place.latitude, place.longitude, streams);
  const risk = calculateFloodRisk({
    nearestStreamMeters: distance,
    elevationM: terrain.elevationM,
    slopePercent: terrain.slopePercent,
    depressionMeters: terrain.depressionMeters,
    gauges,
    streamCount: streams.features.length,
    usedFallbackStreams: streamSource === "deterministic-flow-model",
    elevationAvailable: elevationResult.samples.length >= 2,
  });
  const blueCarbon = calculateBlueCarbon(wetlands);

  return {
    place,
    gauges,
    primarySiteId: primary?.siteId ?? null,
    series,
    streams,
    streamSource,
    wetlands,
    wetlandGeometry,
    risk,
    blueCarbon,
    wayback: waybackResult,
    sources,
    notices,
    fetchedAt: new Date().toISOString(),
  };
}

function trimStreams(collection: FeatureCollection<LineString>): FeatureCollection<LineString> {
  const features = [...collection.features]
    .filter((feature) => {
      const coords = feature.geometry.coordinates.filter(
        (position): position is [number, number] =>
          Array.isArray(position) && position.length >= 2 && typeof position[0] === "number" && typeof position[1] === "number",
      );
      return lineLengthMeters(coords) >= 60;
    })
    .sort((a, b) => streamLengthKm(b) - streamLengthKm(a))
    .slice(0, 180);
  return { type: "FeatureCollection", features };
}

function emptyLineCollection(): FeatureCollection<LineString> {
  return { type: "FeatureCollection", features: [] };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
