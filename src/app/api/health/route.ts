export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

interface Probe {
  name: string;
  ok: boolean;
  ms: number;
  detail: string;
}

export async function GET(): Promise<Response> {
  const probes = await Promise.all([
    probe("USGS", "https://waterservices.usgs.gov/nwis/iv/?format=json&sites=05454500&parameterCd=00060"),
    probe("OpenFreeMap", "https://tiles.openfreemap.org/styles/dark"),
    probe("Nominatim", "https://nominatim.openstreetmap.org/status?format=json", {
      "User-Agent": "ProofOfFlow/1.0 (IEEE ClimateChain hackathon)",
      Accept: "application/json",
    }),
  ]);

  return Response.json({
    checkedAt: new Date().toISOString(),
    probes,
    xaiConfigured: Boolean(process.env.XAI_API_KEY),
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    contractConfigured: Boolean(process.env.NEXT_PUBLIC_HYDROTRUST_CONTRACT),
  });
}

async function probe(name: string, url: string, headers?: Record<string, string>): Promise<Probe> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers,
    });
    return {
      name,
      ok: response.ok,
      ms: Date.now() - started,
      detail: response.ok ? `${response.status}` : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      ms: Date.now() - started,
      detail: error instanceof Error ? error.message : "unreachable",
    };
  }
}
