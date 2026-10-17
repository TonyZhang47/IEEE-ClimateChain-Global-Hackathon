import { asString, fetchJson, isRecord } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(): Promise<Response> {
  try {
    const payload = await fetchJson("https://api.rainviewer.com/public/weather-maps.json", {}, 10000);
    if (!isRecord(payload) || !isRecord(payload.radar)) {
      return Response.json({ error: "RainViewer returned no radar catalog." }, { status: 502 });
    }
    const host = asString(payload.host);
    const past = Array.isArray(payload.radar.past) ? payload.radar.past : [];
    const latest = past.length > 0 ? past[past.length - 1] : null;
    const path = isRecord(latest) ? asString(latest.path) : null;
    if (!host || !path) {
      return Response.json({ error: "RainViewer has no recent radar frame." }, { status: 502 });
    }
    return Response.json({
      tiles: `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`,
      time: isRecord(latest) ? latest.time ?? null : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Radar catalog failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
