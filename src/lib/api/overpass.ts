import type { Feature, FeatureCollection, LineString, Polygon, Position } from "geojson";
import type { WetlandFeature } from "@/types/hydro";
import { asNumber, asString, fetchJson, isRecord } from "@/lib/api/http";
import { lineLengthMeters } from "@/lib/gis/flowDirection";
import { streamLengthKm, wetlandFromPolygon } from "@/lib/gis/riskCalculator";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

export async function fetchOverpassHydrography(
  west: number,
  south: number,
  east: number,
  north: number,
): Promise<{
  streams: FeatureCollection<LineString>;
  wetlands: WetlandFeature[];
  wetlandGeometry: FeatureCollection<Polygon>;
}> {
  const query = `
    [out:json][timeout:25];
    (
      way["waterway"~"river|stream|canal|tidal_channel"](${south},${west},${north},${east});
      way["natural"="wetland"](${south},${west},${north},${east});
    );
    out geom 180;
  `;

  const attempts = await Promise.allSettled(
    OVERPASS_ENDPOINTS.map((endpoint) =>
      fetchJson(
        endpoint,
        {
          method: "POST",
          headers: {
            Accept: "*/*",
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "User-Agent": "ProofOfFlow/1.0 (IEEE ClimateChain; educational hydrology viewer)",
          },
          body: `data=${encodeURIComponent(query)}`,
        },
        12000,
      ),
    ),
  );
  const success = attempts.find((attempt) => attempt.status === "fulfilled");
  if (!success || success.status !== "fulfilled") {
    const failure = attempts.find((attempt) => attempt.status === "rejected");
    const reason = failure && failure.status === "rejected" ? failure.reason : null;
    throw reason instanceof Error ? reason : new Error("Overpass request failed");
  }

  return parseOverpass(success.value);
}

function parseOverpass(payload: unknown): {
  streams: FeatureCollection<LineString>;
  wetlands: WetlandFeature[];
  wetlandGeometry: FeatureCollection<Polygon>;
} {
  const elements = isRecord(payload) && Array.isArray(payload.elements) ? payload.elements : [];
  const streamFeatures: Feature<LineString>[] = [];
  const wetlandFeatures: Feature<Polygon>[] = [];
  const wetlands: WetlandFeature[] = [];

  for (const element of elements) {
    if (!isRecord(element) || element.type !== "way" || !Array.isArray(element.geometry)) continue;
    const tags = isRecord(element.tags) ? element.tags : {};
    const coords = element.geometry
      .map((node) => {
        if (!isRecord(node)) return null;
        const lat = asNumber(node.lat);
        const lon = asNumber(node.lon);
        if (lat === null || lon === null) return null;
        return [lon, lat] as [number, number];
      })
      .filter((pair): pair is [number, number] => pair !== null);
    if (coords.length < 2) continue;

    const id = String(asNumber(element.id) ?? streamFeatures.length + wetlandFeatures.length + 1);
    const name = asString(tags.name) ?? asString(tags.waterway) ?? asString(tags.wetland) ?? "Unnamed";

    if (asString(tags.waterway)) {
      if (lineLengthMeters(coords) < 80) continue;
      streamFeatures.push({
        type: "Feature",
        id: `osm-${id}`,
        properties: {
          id: `osm-${id}`,
          name,
          waterway: asString(tags.waterway),
          source: "overpass",
        },
        geometry: { type: "LineString", coordinates: coords },
      });
      continue;
    }

    if (asString(tags.natural) === "wetland" && isClosed(coords)) {
      const wetlandType = asString(tags.wetland) ?? "wetland";
      const geometry: Polygon = { type: "Polygon", coordinates: [closeRing(coords)] };
      const summary = wetlandFromPolygon(`wetland-${id}`, name, wetlandType, geometry);
      if (!summary) continue;
      wetlands.push(summary);
      wetlandFeatures.push({
        type: "Feature",
        id: `wetland-${id}`,
        properties: {
          id: `wetland-${id}`,
          name,
          wetland: wetlandType,
          areaHa: summary.areaHa,
        },
        geometry,
      });
    }
  }

  streamFeatures.sort((a, b) => streamLengthKm(b) - streamLengthKm(a));

  return {
    streams: { type: "FeatureCollection", features: streamFeatures.slice(0, 220) },
    wetlands: wetlands.slice(0, 80),
    wetlandGeometry: { type: "FeatureCollection", features: wetlandFeatures.slice(0, 80) },
  };
}

function isClosed(coords: [number, number][]): boolean {
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (!first || !last) return false;
  return first[0] === last[0] && first[1] === last[1];
}

function closeRing(coords: [number, number][]): Position[] {
  if (isClosed(coords)) return coords;
  const first = coords[0];
  if (!first) return coords;
  return [...coords, first];
}
