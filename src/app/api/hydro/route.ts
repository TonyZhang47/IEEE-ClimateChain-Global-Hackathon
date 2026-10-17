import { buildHydroSnapshot } from "@/lib/api/snapshot";
import { fetchGaugeSeries } from "@/lib/api/usgs";
import type { PlaceSuggestion } from "@/types/hydro";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const site = url.searchParams.get("site");
  if (site) {
    if (!/^[A-Za-z0-9-]{7,20}$/.test(site)) {
      return Response.json({ error: "Site id is not a USGS identifier." }, { status: 400 });
    }
    try {
      const series = await fetchGaugeSeries(site);
      return Response.json({ siteId: site, series });
    } catch (error) {
      const message = error instanceof Error ? error.message : "USGS history failed";
      return Response.json({ error: message }, { status: 502 });
    }
  }

  const latitude = readCoordinate(url.searchParams.get("lat"), -90, 90);
  const longitude = readCoordinate(url.searchParams.get("lon"), -180, 180);
  const label = (url.searchParams.get("label") ?? "").trim().slice(0, 240);
  if (latitude === null || longitude === null || label.length < 2) {
    return Response.json({ error: "Provide lat, lon, and a label." }, { status: 400 });
  }

  const place: PlaceSuggestion = {
    id: `${latitude.toFixed(5)},${longitude.toFixed(5)}`,
    label,
    latitude,
    longitude,
  };

  try {
    const snapshot = await buildHydroSnapshot(place);
    return Response.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hydrography assembly failed";
    return Response.json({ error: message }, { status: 502 });
  }
}

function readCoordinate(value: string | null, min: number, max: number): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}
