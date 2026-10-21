import type { Feature, FeatureCollection, LineString, Polygon, Position } from "geojson";
import type { GaugeReading, GaugeSeriesPoint, WetlandFeature } from "@/types/hydro";
import { asNumber, asString, fetchJson, isRecord, roundTo } from "@/lib/api/http";
import { destination, haversineMeters } from "@/lib/gis/flowDirection";
import { wetlandFromPolygon } from "@/lib/gis/riskCalculator";

const USGS_IV = "https://waterservices.usgs.gov/nwis/iv/";
const USGS_DV = "https://waterservices.usgs.gov/nwis/dv/";
const NHD_FLOWLINES =
  "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/6/query";
const EPQS = "https://epqs.nationalmap.gov/v1/json";
const NWI_WETLANDS =
  "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query";

interface ParsedPoint {
  value: number | null;
  timestamp: string | null;
}

export async function fetchGaugesInBBox(
  west: number,
  south: number,
  east: number,
  north: number,
  originLat: number,
  originLon: number,
): Promise<GaugeReading[]> {
  const url = new URL(USGS_IV);
  url.searchParams.set("format", "json");
  url.searchParams.set("bBox", `${west.toFixed(5)},${south.toFixed(5)},${east.toFixed(5)},${north.toFixed(5)}`);
  url.searchParams.set("parameterCd", "00060,00065");
  url.searchParams.set("siteStatus", "active");
  url.searchParams.set("siteType", "ST");

  const payload = await fetchJson(url.toString(), {}, 15000);
  const readings = parseGaugeSeries(payload, originLat, originLon);
  return readings
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 40);
}

export async function fetchSitePlace(siteId: string): Promise<{ id: string; label: string; latitude: number; longitude: number; kind: string } | null> {
  const url = new URL(USGS_IV);
  url.searchParams.set("format", "json");
  url.searchParams.set("sites", siteId);
  url.searchParams.set("parameterCd", "00060,00065");
  const payload = await fetchJson(url.toString(), {}, 15000);
  const reading = parseGaugeSeries(payload, 0, 0)[0];
  if (!reading) return null;
  return {
    id: reading.siteId,
    label: `${reading.siteName} (USGS ${reading.siteId})`,
    latitude: reading.latitude,
    longitude: reading.longitude,
    kind: "gauge",
  };
}

export type GaugePeriod = "P1D" | "P7D" | "P30D" | "P365D";

export async function fetchGaugeSeries(siteId: string, period: GaugePeriod = "P7D"): Promise<GaugeSeriesPoint[]> {
  const instantaneous = period === "P1D" || period === "P7D";
  const url = new URL(instantaneous ? USGS_IV : USGS_DV);
  url.searchParams.set("format", "json");
  url.searchParams.set("sites", siteId);
  url.searchParams.set("period", period);
  url.searchParams.set("parameterCd", "00060,00065");

  const payload = await fetchJson(url.toString(), {}, 20000);
  return parseSeries(payload);
}

export async function fetchNhdFlowlines(
  west: number,
  south: number,
  east: number,
  north: number,
): Promise<FeatureCollection<LineString>> {
  const url = new URL(NHD_FLOWLINES);
  url.searchParams.set("f", "geojson");
  url.searchParams.set("geometry", `${west.toFixed(5)},${south.toFixed(5)},${east.toFixed(5)},${north.toFixed(5)}`);
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", "GNIS_NAME,FCODE,LENGTHKM,FLOWDIR");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("resultRecordCount", "250");

  const payload = await fetchJson(url.toString(), {}, 12000);
  return nhdToLineCollection(payload);
}

export async function fetchElevationMeters(latitude: number, longitude: number, attempts = 1): Promise<number | null> {
  const url = new URL(EPQS);
  url.searchParams.set("x", longitude.toFixed(6));
  url.searchParams.set("y", latitude.toFixed(6));
  url.searchParams.set("units", "Meters");
  url.searchParams.set("wkid", "4326");
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const payload = await fetchJson(url.toString(), {}, 25000);
      if (!isRecord(payload)) continue;
      const value = asNumber(payload.value);
      if (value !== null && value > -1000 && value <= 9000) return value;
    } catch {
      // EPQS occasionally drops a point. The next attempt covers that miss.
    }
  }
  return null;
}

export async function fetchElevationProfile(
  latitude: number,
  longitude: number,
): Promise<{ latitude: number; longitude: number; elevationM: number }[]> {
  const offsets = [
    { latitude, longitude },
    destination(latitude, longitude, 0, 250),
    destination(latitude, longitude, 90, 250),
    destination(latitude, longitude, 180, 250),
    destination(latitude, longitude, 270, 250),
  ];
  const samples = await Promise.all(
    offsets.map(async (offset) => {
      try {
        const elevationM = await fetchElevationMeters(offset.latitude, offset.longitude);
        if (elevationM === null) return null;
        return { latitude: offset.latitude, longitude: offset.longitude, elevationM };
      } catch {
        return null;
      }
    }),
  );
  return samples.filter((sample): sample is { latitude: number; longitude: number; elevationM: number } => sample !== null);
}

function parseGaugeSeries(payload: unknown, originLat: number, originLon: number): GaugeReading[] {
  const bySite = new Map<string, GaugeReading>();
  for (const series of timeSeries(payload)) {
    const info = isRecord(series.sourceInfo) ? series.sourceInfo : null;
    const siteCode = firstCode(info?.siteCode);
    if (!siteCode || !info) continue;
    const geo = isRecord(info.geoLocation) ? info.geoLocation.geogLocation : null;
    const geoRecord = isRecord(geo) ? geo : null;
    const latitude = asNumber(geoRecord?.latitude);
    const longitude = asNumber(geoRecord?.longitude);
    if (latitude === null || longitude === null) continue;
    const parameter = firstCode(isRecord(series.variable) ? series.variable.variableCode : null);
    const latest = latestValue(series);
    const existing = bySite.get(siteCode) ?? {
      siteId: siteCode,
      siteName: cleanSiteName(asString(info.siteName) ?? `USGS ${siteCode}`),
      latitude,
      longitude,
      dischargeCfs: null,
      gageHeightFt: null,
      timestamp: null,
      distanceMeters: haversineMeters(originLat, originLon, latitude, longitude),
    };
    if (parameter === "00060") existing.dischargeCfs = latest.value;
    if (parameter === "00065") existing.gageHeightFt = latest.value;
    if (latest.timestamp && (!existing.timestamp || latest.timestamp > existing.timestamp)) {
      existing.timestamp = latest.timestamp;
    }
    bySite.set(siteCode, existing);
  }
  return [...bySite.values()];
}

function parseSeries(payload: unknown): GaugeSeriesPoint[] {
  const byTime = new Map<string, GaugeSeriesPoint>();
  for (const series of timeSeries(payload)) {
    const parameter = firstCode(isRecord(series.variable) ? series.variable.variableCode : null);
    const values = valueList(series);
    for (const entry of values) {
      if (!isRecord(entry)) continue;
      const timestamp = asString(entry.dateTime);
      const numeric = sanitizeReading(asNumber(entry.value));
      if (!timestamp) continue;
      const point = byTime.get(timestamp) ?? {
        timestamp,
        dischargeCfs: null,
        gageHeightFt: null,
      };
      if (parameter === "00060") point.dischargeCfs = numeric;
      if (parameter === "00065") point.gageHeightFt = numeric;
      byTime.set(timestamp, point);
    }
  }
  const points = [...byTime.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return downsample(points, 96);
}

function timeSeries(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload) || !isRecord(payload.value) || !Array.isArray(payload.value.timeSeries)) {
    return [];
  }
  return payload.value.timeSeries.filter(isRecord);
}

function firstCode(value: unknown): string | null {
  if (!Array.isArray(value) || !isRecord(value[0])) return null;
  return asString(value[0].value);
}

function valueList(series: Record<string, unknown>): unknown[] {
  if (!Array.isArray(series.values) || !isRecord(series.values[0])) return [];
  const inner = series.values[0].value;
  return Array.isArray(inner) ? inner : [];
}

function latestValue(series: Record<string, unknown>): ParsedPoint {
  const values = valueList(series);
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const entry = values[index];
    if (!isRecord(entry)) continue;
    const numeric = sanitizeReading(asNumber(entry.value));
    if (numeric === null && asString(entry.value) === null) continue;
    return { value: numeric, timestamp: asString(entry.dateTime) };
  }
  return { value: null, timestamp: null };
}

function sanitizeReading(value: number | null): number | null {
  if (value === null || value <= -999) return null;
  return roundTo(value, 3);
}

function cleanSiteName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function downsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => items[Math.round(index * step)] as T);
}

function nhdToLineCollection(payload: unknown): FeatureCollection<LineString> {
  if (!isRecord(payload) || !Array.isArray(payload.features)) {
    return { type: "FeatureCollection", features: [] };
  }
  const features: Feature<LineString>[] = [];
  for (const raw of payload.features) {
    if (!isRecord(raw) || !isRecord(raw.geometry)) continue;
    const properties = isRecord(raw.properties) ? raw.properties : {};
    const name = asString(properties.GNIS_NAME) ?? asString(properties.gnis_name) ?? "Unnamed NHD flowline";
    const lines = geometryToLines(raw.geometry);
    lines.forEach((coordinates, index) => {
      if (coordinates.length < 2) return;
      features.push({
        type: "Feature",
        id: `nhd-${features.length + 1}`,
        properties: {
          id: `nhd-${features.length + 1}-${index}`,
          name,
          waterway: "nhd",
          source: "nhd",
          flowdir: asNumber(properties.FLOWDIR),
        },
        geometry: { type: "LineString", coordinates },
      });
    });
  }
  return { type: "FeatureCollection", features };
}

function geometryToLines(geometry: Record<string, unknown>): [number, number][][] {
  const type = asString(geometry.type);
  if (type === "LineString" && Array.isArray(geometry.coordinates)) {
    const line = positionsToLine(geometry.coordinates);
    return line ? [line] : [];
  }
  if (type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .map((line) => (Array.isArray(line) ? positionsToLine(line) : null))
      .filter((line): line is [number, number][] => line !== null);
  }
  return [];
}

function positionsToLine(positions: unknown[]): [number, number][] | null {
  const line: [number, number][] = [];
  for (const position of positions) {
    if (!Array.isArray(position)) return null;
    const lon = asNumber(position[0]);
    const lat = asNumber(position[1]);
    if (lon === null || lat === null) return null;
    line.push([lon, lat]);
  }
  return line;
}

export function emptyPolygons(): FeatureCollection<Polygon> {
  return { type: "FeatureCollection", features: [] };
}

export async function fetchNwiWetlands(
  west: number,
  south: number,
  east: number,
  north: number,
): Promise<{ wetlands: WetlandFeature[]; wetlandGeometry: FeatureCollection<Polygon> }> {
  const url = new URL(NWI_WETLANDS);
  url.searchParams.set("f", "geojson");
  url.searchParams.set("geometry", `${west.toFixed(5)},${south.toFixed(5)},${east.toFixed(5)},${north.toFixed(5)}`);
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("outFields", "WETLAND_TYPE,ATTRIBUTE");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("resultRecordCount", "60");

  const payload = await fetchJson(url.toString(), {}, 15000);
  return nwiToWetlands(payload);
}

function nwiToWetlands(payload: unknown): { wetlands: WetlandFeature[]; wetlandGeometry: FeatureCollection<Polygon> } {
  if (!isRecord(payload) || !Array.isArray(payload.features)) {
    return { wetlands: [], wetlandGeometry: emptyPolygons() };
  }
  const wetlands: WetlandFeature[] = [];
  const features: Feature<Polygon>[] = [];
  for (const raw of payload.features) {
    if (!isRecord(raw) || !isRecord(raw.geometry)) continue;
    const properties = isRecord(raw.properties) ? raw.properties : {};
    const attribute = asString(properties.ATTRIBUTE) ?? "";
    if (attribute.toUpperCase().includes("UB")) continue;
    const wetlandType = nwiClassLabel(attribute, asString(properties.WETLAND_TYPE) ?? "wetland");
    const polygons = polygonsFromGeometry(raw.geometry);
    polygons.forEach((geometry, index) => {
      const summary = wetlandFromPolygon(`nwi-${wetlands.length + 1}-${index}`, wetlandType, wetlandType, geometry);
      if (!summary) return;
      wetlands.push(summary);
      features.push({
        type: "Feature",
        id: summary.id,
        properties: { id: summary.id, name: wetlandType, wetland: wetlandType, areaHa: summary.areaHa },
        geometry,
      });
    });
  }
  return {
    wetlands: wetlands.slice(0, 80),
    wetlandGeometry: { type: "FeatureCollection", features: features.slice(0, 80) },
  };
}

function nwiClassLabel(attribute: string, wetlandType: string): string {
  const code = attribute.toUpperCase();
  if (code.startsWith("E") && code.includes("EM")) return "salt marsh";
  if (code.includes("PFO")) return "forested swamp";
  if (code.includes("PEM")) return "emergent marsh";
  if (code.includes("PSS")) return "shrub wetland";
  if (code.startsWith("M")) return "mangrove";
  if (wetlandType.trim()) return wetlandType.toLowerCase();
  return "wetland";
}

function polygonsFromGeometry(geometry: Record<string, unknown>): Polygon[] {
  const type = asString(geometry.type);
  if (type === "Polygon" && Array.isArray(geometry.coordinates)) {
    const polygon = toPolygon(geometry.coordinates);
    return polygon ? [polygon] : [];
  }
  if (type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .map((rings) => (Array.isArray(rings) ? toPolygon(rings) : null))
      .filter((polygon): polygon is Polygon => polygon !== null);
  }
  return [];
}

function toPolygon(rings: unknown[]): Polygon | null {
  const coordinates: Position[][] = [];
  for (const ring of rings) {
    if (!Array.isArray(ring)) return null;
    const line: Position[] = [];
    for (const position of ring) {
      if (!Array.isArray(position)) return null;
      const lon = asNumber(position[0]);
      const lat = asNumber(position[1]);
      if (lon === null || lat === null) return null;
      line.push([lon, lat]);
    }
    if (line.length >= 4) coordinates.push(line);
  }
  if (coordinates.length === 0) return null;
  return { type: "Polygon", coordinates };
}
