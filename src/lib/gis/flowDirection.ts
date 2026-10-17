import type { Feature, FeatureCollection, LineString, Position } from "geojson";

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const phi1 = (aLat * Math.PI) / 180;
  const phi2 = (bLat * Math.PI) / 180;
  const dPhi = ((bLat - aLat) * Math.PI) / 180;
  const dLambda = ((bLon - aLon) * Math.PI) / 180;
  const h =
    Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function destination(
  latitude: number,
  longitude: number,
  bearingDeg: number,
  distanceM: number,
): { latitude: number; longitude: number } {
  const delta = distanceM / EARTH_RADIUS_M;
  const theta = (bearingDeg * Math.PI) / 180;
  const phi1 = (latitude * Math.PI) / 180;
  const lambda1 = (longitude * Math.PI) / 180;
  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta),
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
    );
  return {
    latitude: (phi2 * 180) / Math.PI,
    longitude: ((((lambda2 * 180) / Math.PI + 540) % 360) + 360) % 360 - 180,
  };
}

export function bboxAround(
  latitude: number,
  longitude: number,
  radiusKm: number,
): [number, number, number, number] {
  const dLat = radiusKm / 111;
  const cosine = Math.cos((latitude * Math.PI) / 180);
  const dLon = radiusKm / (111 * Math.max(0.2, Math.abs(cosine)));
  return [longitude - dLon, latitude - dLat, longitude + dLon, latitude + dLat];
}

export function isLikelyUsgsCoverage(latitude: number, longitude: number): boolean {
  const conus = latitude >= 24 && latitude <= 49.6 && longitude >= -125 && longitude <= -66;
  const alaska = latitude >= 51 && latitude <= 72 && longitude >= -170 && longitude <= -129;
  const hawaii = latitude >= 18.5 && latitude <= 22.5 && longitude >= -160.5 && longitude <= -154.5;
  const puertoRico = latitude >= 17.8 && latitude <= 18.6 && longitude >= -67.5 && longitude <= -65.1;
  return conus || alaska || hawaii || puertoRico;
}

export interface FlowSegment {
  bearingDeg: number;
  lengthMeters: number;
}

export function segmentBearings(coords: [number, number][]): FlowSegment[] {
  const segments: FlowSegment[] = [];
  for (let index = 0; index < coords.length - 1; index += 1) {
    const start = coords[index];
    const end = coords[index + 1];
    if (!start || !end) continue;
    const lengthMeters = haversineMeters(start[1], start[0], end[1], end[0]);
    if (lengthMeters < 1) continue;
    segments.push({
      bearingDeg: initialBearing(start[1], start[0], end[1], end[0]),
      lengthMeters,
    });
  }
  return segments;
}

export function meanBearing(coords: [number, number][]): number | null {
  const segments = segmentBearings(coords);
  if (segments.length === 0) return null;
  let east = 0;
  let north = 0;
  for (const segment of segments) {
    const radians = (segment.bearingDeg * Math.PI) / 180;
    east += Math.sin(radians) * segment.lengthMeters;
    north += Math.cos(radians) * segment.lengthMeters;
  }
  if (east === 0 && north === 0) return null;
  const degrees = (Math.atan2(east, north) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

export function orientDownstream(
  coords: [number, number][],
  startElevationM: number | null,
  endElevationM: number | null,
): [number, number][] {
  if (
    startElevationM !== null &&
    endElevationM !== null &&
    endElevationM > startElevationM + 0.5
  ) {
    return [...coords].reverse();
  }
  return coords;
}

export function lineLengthMeters(coords: [number, number][]): number {
  return segmentBearings(coords).reduce((sum, segment) => sum + segment.lengthMeters, 0);
}

function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function syntheticElevation(latitude: number, longitude: number): number {
  return (
    Math.sin(latitude * 0.37) * 40 +
    Math.cos(longitude * 0.41) * 30 +
    Math.sin(latitude * 1.7 + longitude * 0.8) * 8
  );
}

function hashSeed(latitude: number, longitude: number): number {
  const x = Math.round((latitude + 90) * 1000);
  const y = Math.round((longitude + 180) * 1000);
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic downhill traces on a smooth synthetic surface.
 * Used only when both NHD and Overpass return no stream geometry.
 * Vertex order follows the descending gradient, so dash animation moves downstream.
 */
export function buildFallbackStreams(
  latitude: number,
  longitude: number,
): FeatureCollection<LineString> {
  const random = mulberry32(hashSeed(latitude, longitude));
  const features: Feature<LineString>[] = [];

  for (let streamIndex = 0; streamIndex < 5; streamIndex += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 0.012 + random() * 0.03;
    let lat = latitude + Math.sin(angle) * radius;
    let lon = longitude + Math.cos(angle) * radius * 1.3;
    const coords: [number, number][] = [[Number(lon.toFixed(6)), Number(lat.toFixed(6))]];

    for (let step = 0; step < 16; step += 1) {
      let bestLat = lat;
      let bestLon = lon;
      let bestElevation = syntheticElevation(lat, lon);
      const bearings = [0, 45, 90, 135, 180, 225, 270, 315];
      for (const bearing of bearings) {
        const next = destination(lat, lon, bearing, 280 + random() * 80);
        const elevation = syntheticElevation(next.latitude, next.longitude);
        if (elevation < bestElevation) {
          bestElevation = elevation;
          bestLat = next.latitude;
          bestLon = next.longitude;
        }
      }
      if (bestLat === lat && bestLon === lon) break;
      const jitter = destination(bestLat, bestLon, random() * 360, random() * 40);
      lat = jitter.latitude;
      lon = jitter.longitude;
      coords.push([Number(lon.toFixed(6)), Number(lat.toFixed(6))]);
    }

    if (coords.length < 3) continue;
    const bearing = meanBearing(coords);
    features.push({
      type: "Feature",
      id: `modeled-${streamIndex + 1}`,
      properties: {
        id: `modeled-${streamIndex + 1}`,
        name: `Modeled tributary ${streamIndex + 1}`,
        waterway: "modeled",
        source: "deterministic-flow-model",
        bearingDeg: bearing,
        lengthM: Math.round(lineLengthMeters(coords)),
      },
      geometry: { type: "LineString", coordinates: coords },
    });
  }

  return { type: "FeatureCollection", features };
}

export function flattenLinePositions(position: Position): [number, number] | null {
  const lon = position[0];
  const lat = position[1];
  if (typeof lon !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
}
