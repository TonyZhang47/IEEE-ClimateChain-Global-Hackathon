import { asNumber, fetchJson, isRecord } from "@/lib/api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const latitude = readCoordinate(url.searchParams.get("lat"), -90, 90);
  const longitude = readCoordinate(url.searchParams.get("lon"), -180, 180);
  if (latitude === null || longitude === null) {
    return Response.json({ error: "Provide lat and lon." }, { status: 400 });
  }

  const forecast = new URL("https://api.open-meteo.com/v1/forecast");
  forecast.searchParams.set("latitude", latitude.toFixed(4));
  forecast.searchParams.set("longitude", longitude.toFixed(4));
  forecast.searchParams.set("hourly", "precipitation,soil_moisture_0_to_1cm");
  forecast.searchParams.set("forecast_hours", "6");
  forecast.searchParams.set("timezone", "UTC");

  try {
    const payload = await fetchJson(forecast.toString(), {}, 12000);
    const hourly = isRecord(payload) && isRecord(payload.hourly) ? payload.hourly : null;
    const rain = firstNumber(hourly?.precipitation);
    const soil = firstNumber(hourly?.soil_moisture_0_to_1cm);
    return Response.json({
      precipitationMm: rain,
      soilMoisture: soil,
      note:
        soil === null
          ? "Open-Meteo returned no soil-moisture value for this hour."
          : "Soil moisture is the 0–1 cm volumetric fraction from Open-Meteo, not a measured infiltration test.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Climate request failed";
    return Response.json({ error: message }, { status: 502 });
  }
}

function firstNumber(value: unknown): number | null {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    const numeric = asNumber(entry);
    if (numeric !== null) return numeric;
  }
  return null;
}

function readCoordinate(value: string | null, min: number, max: number): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}
