import { searchPlaces } from "@/lib/api/nominatim";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 120) {
    return Response.json({ error: "Enter between 2 and 120 characters." }, { status: 400 });
  }
  try {
    const places = await searchPlaces(query);
    return Response.json({ places });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Geocoder failed";
    return Response.json({ error: message, places: [] }, { status: 502 });
  }
}
