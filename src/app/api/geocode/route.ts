import { searchPlaces } from "@/lib/api/nominatim";
import { fetchSitePlace } from "@/lib/api/usgs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 120) {
    return Response.json({ error: "Enter between 2 and 120 characters." }, { status: 400 });
  }
  if (/^\d{7,15}$/.test(query)) {
    try {
      const gauge = await fetchSitePlace(query);
      if (gauge) return Response.json({ places: [gauge] });
    } catch {
      // Fall through to place search when the site id is not a live USGS gauge.
    }
  }
  try {
    const places = await searchPlaces(query);
    return Response.json({ places });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Geocoder failed";
    return Response.json({ error: message, places: [] }, { status: 502 });
  }
}
