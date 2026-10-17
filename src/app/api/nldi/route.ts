import { asNumber, asString, fetchJson, isRecord } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const NLDI = "https://api.water.usgs.gov/nldi/linked-data";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const latitude = readCoordinate(url.searchParams.get("lat"), -90, 90);
  const longitude = readCoordinate(url.searchParams.get("lon"), -180, 180);
  const mode = url.searchParams.get("mode");
  if (latitude === null || longitude === null) {
    return Response.json({ error: "Provide lat and lon." }, { status: 400 });
  }
  if (mode !== "basin" && mode !== "upstream" && mode !== "downstream") {
    return Response.json({ error: "Mode must be basin, upstream, or downstream." }, { status: 400 });
  }

  try {
    const position = await fetchJson(
      `${NLDI}/comid/position?coords=POINT(${longitude.toFixed(5)}%20${latitude.toFixed(5)})`,
      {},
      12000,
    );
    const comid = firstComid(position);
    if (!comid) {
      return Response.json({ error: "NLDI has no catchment for this point. The index covers the United States." }, { status: 404 });
    }
    const path =
      mode === "basin"
        ? `${NLDI}/comid/${comid}/basin`
        : mode === "upstream"
          ? `${NLDI}/comid/${comid}/navigation/UT/flowlines?distance=25`
          : `${NLDI}/comid/${comid}/navigation/DM/flowlines?distance=25`;
    const geometry = await fetchJson(path, {}, 20000);
    if (!isRecord(geometry) || geometry.type !== "FeatureCollection") {
      return Response.json({ error: "NLDI returned an unexpected geometry." }, { status: 502 });
    }
    return Response.json({ comid, mode, geojson: geometry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "NLDI request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}

function firstComid(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.features)) return null;
  for (const feature of payload.features) {
    if (!isRecord(feature) || !isRecord(feature.properties)) continue;
    const comid = asString(feature.properties.comid) ?? (asNumber(feature.properties.comid)?.toString() ?? null);
    if (comid) return comid;
  }
  return null;
}

function readCoordinate(value: string | null, min: number, max: number): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}
