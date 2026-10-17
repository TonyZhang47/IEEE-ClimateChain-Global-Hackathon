import { destination } from "@/lib/gis/flowDirection";
import { fetchElevationMeters } from "@/lib/api/usgs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const latitude = readCoordinate(url.searchParams.get("lat"), -90, 90);
  const longitude = readCoordinate(url.searchParams.get("lon"), -180, 180);
  const bearing = readCoordinate(url.searchParams.get("bearing") ?? "90", 0, 359);
  if (latitude === null || longitude === null || bearing === null) {
    return Response.json({ error: "Provide lat, lon, and a bearing from 0 to 359." }, { status: 400 });
  }

  const offsets = [-800, -600, -400, -200, 0, 200, 400, 600, 800];
  const samples = await mapPool(offsets, 3, (distanceM) => sampleElevation(latitude, longitude, bearing, distanceM));
  const repaired = await Promise.all(
    samples.map((sample, index) => sample ?? sampleElevation(latitude, longitude, bearing, offsets[index] ?? 0)),
  );
  const profile = repaired.filter((sample): sample is { distanceM: number; elevationM: number } => sample !== null);
  if (profile.length < 3) {
    return Response.json({ error: "Elevation samples were not available along this line." }, { status: 502 });
  }
  return Response.json({
    bearing,
    samples: profile,
    note: "USGS EPQS samples every 200 m. This is a terrain cross-section, not a surveyed channel profile.",
  });
}

async function sampleElevation(
  latitude: number,
  longitude: number,
  bearing: number,
  distanceM: number,
): Promise<{ distanceM: number; elevationM: number } | null> {
  const point =
    distanceM === 0
      ? { latitude, longitude }
      : destination(latitude, longitude, distanceM < 0 ? (bearing + 180) % 360 : bearing, Math.abs(distanceM));
  const elevationM = await fetchElevationMeters(point.latitude, point.longitude, 1);
  return elevationM === null ? null : { distanceM, elevationM };
}

async function mapPool<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

function readCoordinate(value: string | null, min: number, max: number): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}
