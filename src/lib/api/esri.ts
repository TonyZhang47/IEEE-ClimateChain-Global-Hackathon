import type { WaybackImagery } from "@/types/hydro";
import { asString, fetchJson, isRecord } from "@/lib/api/http";

const WAYBACK_CONFIG = "https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json";
const WORLD_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

interface ReleaseRow {
  id: number;
  date: string;
}

export async function fetchWaybackImagery(): Promise<WaybackImagery | null> {
  try {
    const payload = await fetchJson(WAYBACK_CONFIG, {}, 12000);
    const releases = parseReleases(payload);
    if (releases.length === 0) return worldImageryFallback();
    const latest = releases[releases.length - 1];
    if (!latest) return worldImageryFallback();
    const historic =
      releases.find((release) => release.date.startsWith("2014")) ??
      releases[Math.max(0, Math.floor(releases.length * 0.25))] ??
      latest;
    return {
      latestTiles: waybackTemplate(latest.id),
      historicTiles: waybackTemplate(historic.id),
      latestDate: latest.date,
      historicDate: historic.date,
    };
  } catch {
    return worldImageryFallback();
  }
}

export function worldImageryTiles(): string {
  return WORLD_IMAGERY;
}

function worldImageryFallback(): WaybackImagery {
  return {
    latestTiles: WORLD_IMAGERY,
    historicTiles: WORLD_IMAGERY,
    latestDate: "Esri World Imagery",
    historicDate: "Esri World Imagery",
  };
}

function waybackTemplate(releaseId: number): string {
  return `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${releaseId}/{z}/{y}/{x}`;
}

function parseReleases(payload: unknown): ReleaseRow[] {
  if (!isRecord(payload)) return [];
  const rows: ReleaseRow[] = [];
  for (const [key, value] of Object.entries(payload)) {
    const id = Number(key);
    if (!Number.isFinite(id) || !isRecord(value)) continue;
    const date =
      asString(value.itemDate) ??
      asString(value.itemTitle) ??
      asString(value.releaseDate) ??
      key;
    rows.push({ id, date });
  }
  return rows.sort((a, b) => a.id - b.id);
}
