import type { PlaceSuggestion } from "@/types/hydro";
import { asNumber, asString, fetchJson, isRecord } from "@/lib/api/http";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
let lastRequestAt = 0;

export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const coordinate = parseCoordinateQuery(trimmed);
  if (coordinate) return [coordinate];

  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastRequestAt));
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();

  const url = new URL(NOMINATIM);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");

  const payload = await fetchJson(
    url.toString(),
    {
      headers: {
        "User-Agent": "HydroTrustAI/1.0 (IEEE ClimateChain educational hydrology viewer)",
        "Accept-Language": "en",
      },
    },
    10000,
  );

  if (!Array.isArray(payload)) return [];
  const places: PlaceSuggestion[] = [];
  for (const row of payload) {
    if (!isRecord(row)) continue;
    const latitude = asNumber(row.lat);
    const longitude = asNumber(row.lon);
    const label = asString(row.display_name);
    if (latitude === null || longitude === null || !label) continue;
    const address = isRecord(row.address) ? row.address : {};
    places.push({
      id: String(asNumber(row.place_id) ?? `${latitude},${longitude}`),
      label,
      latitude,
      longitude,
      country: asString(address.country) ?? undefined,
      kind: asString(row.type) ?? asString(row.category) ?? undefined,
    });
  }
  return places;
}

export function parseCoordinateQuery(query: string): PlaceSuggestion | null {
  const match = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return {
    id: `coord-${latitude.toFixed(5)}-${longitude.toFixed(5)}`,
    label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    latitude,
    longitude,
    kind: "coordinate",
  };
}
