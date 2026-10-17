import { z } from "zod";
import type { AdvisoryReport, HydroSnapshot } from "@/types/hydro";

const advisorySchema = z.object({
  headline: z.string().min(8).max(180),
  summary: z.string().min(40).max(1800),
  communityActions: z.array(z.string().min(8).max(280)).min(2).max(5),
  policyActions: z.array(z.string().min(8).max(280)).min(2).max(5),
});

export function buildDeterministicAdvisory(snapshot: HydroSnapshot): AdvisoryReport {
  const { risk, blueCarbon, gauges, place } = snapshot;
  const primary = gauges.find((gauge) => gauge.siteId === snapshot.primarySiteId) ?? null;
  const band =
    risk.score >= 75 ? "high" : risk.score >= 45 ? "elevated" : risk.score >= 25 ? "moderate" : "lower";

  const flowSentence = primary
    ? primary.dischargeCfs !== null
      ? `The nearest live gauge, ${primary.siteName} (${primary.siteId}), is reading ${Math.round(primary.dischargeCfs).toLocaleString("en-US")} ft³/s${primary.gageHeightFt !== null ? ` at a stage of ${primary.gageHeightFt.toFixed(2)} ft` : ""}.`
      : `The nearest gauge, ${primary.siteName} (${primary.siteId}), has no discharge value in the latest instantaneous payload.`
    : "No USGS stream gauge was returned for this window.";

  const carbonSentence =
    blueCarbon.annualSequestrationTco2e > 0
      ? `Mapped wetlands cover ${blueCarbon.wetlandAreaHa.toFixed(2)} ha and are estimated to sequester ${blueCarbon.annualSequestrationTco2e.toFixed(2)} tCO₂e/yr, led by ${blueCarbon.dominantType}.`
      : "No wetland polygons were mapped in the window, so the blue-carbon term is zero.";

  const communityActions = [
    risk.score >= 45
      ? "Walk the nearest low crossings and note which roads lose a shoulder first when stage rises."
      : "Keep the gauge identifier posted with local stewards so a rise can be checked without waiting on a broadcast.",
    blueCarbon.wetlandAreaHa > 0
      ? "Treat the mapped wetland edge as a buffer: avoid new fill, and photograph the vegetation line for the next seasonal comparison."
      : "If standing water or hydric soils are present but unmapped, record them before the blue-carbon term is treated as zero.",
    primary
      ? `Check site ${primary.siteId} on a fixed cadence during wet weeks rather than only after a warning.`
      : "Pair this screen with a local river observer, because the discharge term is a density proxy here.",
  ];

  const policyActions = [
    risk.nearestStreamMeters !== null && risk.nearestStreamMeters < 300
      ? "Hold new critical facilities outside the first 300 m of mapped channels until a site-specific study is done."
      : "Use the index as a triage layer, then commission a site study before changing a land-use designation.",
    blueCarbon.score >= 35
      ? "Count the estimated sequestration in any local stewardship credit, and keep the wetland polygon hash with the decision record."
      : "Do not issue a sequestration credit from this window until wetland area is confirmed on the ground.",
    snapshot.streamSource === "deterministic-flow-model"
      ? "Replace the downhill model with a surveyed hydrography layer before this score is cited in a plan."
      : "Archive the source list with the score so a later reader can see whether NHD, OpenStreetMap, or both were live.",
  ];

  return {
    headline: `${place.label.split(",")[0] ?? place.label} screens as ${band} flood exposure (${risk.score}/100).`,
    summary: `${flowSentence} ${carbonSentence} Proximity contributes ${risk.proximityComponent.toFixed(1)}/40, slope ${risk.slopeComponent.toFixed(1)}/30, and discharge ${risk.dischargeComponent.toFixed(1)}/30. Confidence is ${risk.confidence} because ${confidenceReason(snapshot)} The index is a screening aid for community briefing, not a FEMA map.`,
    communityActions,
    policyActions,
    confidence: "deterministic",
    notice: "No model key was configured, or the model call did not return valid JSON. Numbers above are computed locally from the telemetry snapshot.",
  };
}

function confidenceReason(snapshot: HydroSnapshot): string {
  if (snapshot.risk.confidence === "high") return "a live gauge, elevation samples, and surveyed streams all contributed.";
  if (snapshot.risk.confidence === "medium") return "at least one of gauge discharge, elevation, or surveyed streams was missing.";
  return "the screen is leaning on priors or the downhill model.";
}

interface ModelProvider {
  endpoint: string;
  key: string;
  model: string;
}

export async function synthesizeAdvisory(snapshot: HydroSnapshot): Promise<AdvisoryReport> {
  const fallback = buildDeterministicAdvisory(snapshot);
  const providers = configuredProviders();
  if (providers.length === 0) return fallback;

  const failures: string[] = [];
  for (const provider of providers) {
    try {
      return await requestAdvisory(provider, snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "model error";
      failures.push(`${provider.model}: ${message}`);
    }
  }
  return {
    ...fallback,
    notice: `Model calls failed (${failures.join("; ")}). Showing the deterministic advisory.`,
  };
}

function configuredProviders(): ModelProvider[] {
  const providers: ModelProvider[] = [];
  if (process.env.XAI_API_KEY) {
    providers.push({
      endpoint: "https://api.x.ai/v1/chat/completions",
      key: process.env.XAI_API_KEY,
      model: process.env.XAI_MODEL || "grok-4",
    });
  }
  if (process.env.OPENAI_API_KEY) {
    providers.push({
      endpoint: "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    });
  }
  return providers;
}

async function requestAdvisory(provider: ModelProvider, snapshot: HydroSnapshot): Promise<AdvisoryReport> {
  const response = await fetch(provider.endpoint, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
    headers: {
      Authorization: `Bearer ${provider.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a hydrologist writing a short community and policy advisory. Use only numbers present in the user payload. Do not invent gauges, depths, or casualties. Return JSON with keys headline, summary, communityActions, policyActions. Actions are concrete and local.",
        },
        {
          role: "user",
          content: JSON.stringify(modelContext(snapshot)),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`request failed (${response.status})`);
  }
  const body: unknown = await response.json();
  const text = extractContent(body);
  if (!text) throw new Error("empty completion");
  const parsed = advisorySchema.parse(parseModelJson(text));
  return { ...parsed, confidence: "model", model: provider.model };
}

function modelContext(snapshot: HydroSnapshot) {
  const primary = snapshot.gauges.find((gauge) => gauge.siteId === snapshot.primarySiteId) ?? null;
  return {
    place: snapshot.place.label,
    latitude: snapshot.place.latitude,
    longitude: snapshot.place.longitude,
    floodIndex: snapshot.risk.score,
    confidence: snapshot.risk.confidence,
    components: {
      proximity: snapshot.risk.proximityComponent,
      slope: snapshot.risk.slopeComponent,
      discharge: snapshot.risk.dischargeComponent,
    },
    nearestStreamMeters: snapshot.risk.nearestStreamMeters,
    slopePercent: snapshot.risk.slopePercent,
    elevationM: snapshot.risk.elevationM,
    streamSource: snapshot.streamSource,
    gauge: primary
      ? {
          id: primary.siteId,
          name: primary.siteName,
          dischargeCfs: primary.dischargeCfs,
          gageHeightFt: primary.gageHeightFt,
          distanceMeters: Math.round(primary.distanceMeters),
        }
      : null,
    blueCarbon: snapshot.blueCarbon,
    notices: snapshot.notices,
    rationale: snapshot.risk.rationale,
  };
}

function extractContent(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("choices" in body)) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== "object" || first === null || !("message" in first)) return null;
  const message = (first as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" ? message.content : null;
}

function parseModelJson(text: string): unknown {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(unfenced) as unknown;
}
