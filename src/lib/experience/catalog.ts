import type { PlaceSuggestion } from "@/types/hydro";

export interface CatalogPlace extends PlaceSuggestion {
  note: string;
}

export const CASE_STUDIES: CatalogPlace[] = [
  { id: "iowa-city", label: "Iowa City, Iowa, United States", latitude: 41.6611, longitude: -91.5302, kind: "city", note: "Iowa River gauge 05454500" },
  { id: "new-orleans", label: "New Orleans, Louisiana, United States", latitude: 29.9511, longitude: -90.0715, kind: "city", note: "Mississippi delta, hurricane exposure" },
  { id: "sacramento", label: "Sacramento, California, United States", latitude: 38.5816, longitude: -121.4944, kind: "city", note: "Confluence of the American and Sacramento" },
  { id: "baltimore", label: "Baltimore Inner Harbor, Maryland, United States", latitude: 39.285, longitude: -76.61, kind: "harbor", note: "Tidal Patapsco basin" },
  { id: "rhine", label: "Cologne, Rhine, Germany", latitude: 50.9375, longitude: 6.9603, kind: "city", note: "Rhine River basin" },
  { id: "indus", label: "Sukkur, Indus River, Pakistan", latitude: 27.7052, longitude: 68.8574, kind: "city", note: "Indus valley barrage reach" },
  { id: "dhaka", label: "Dhaka, Bangladesh", latitude: 23.8103, longitude: 90.4125, kind: "city", note: "Brahmaputra-Ganges delta" },
  { id: "rotterdam", label: "Rotterdam, Netherlands", latitude: 51.9244, longitude: 4.4777, kind: "city", note: "Rhine-Meuse estuary" },
];

export const DELTA_HOTSPOTS = [
  { id: "mississippi", label: "Mississippi delta", latitude: 29.15, longitude: -89.25 },
  { id: "ganges", label: "Ganges-Brahmaputra delta", latitude: 22.0, longitude: 89.5 },
  { id: "mekong", label: "Mekong delta", latitude: 10.0, longitude: 105.8 },
  { id: "nile", label: "Nile delta", latitude: 31.0, longitude: 31.2 },
  { id: "indus", label: "Indus delta", latitude: 24.1, longitude: 67.6 },
  { id: "rhine", label: "Rhine-Meuse delta", latitude: 51.9, longitude: 4.5 },
] as const;

export const BRIGHT_STARS: { name: string; raHours: number; dec: number }[] = [
  { name: "Sirius", raHours: 6.752, dec: -16.716 },
  { name: "Canopus", raHours: 6.399, dec: -52.696 },
  { name: "Arcturus", raHours: 14.261, dec: 19.182 },
  { name: "Vega", raHours: 18.616, dec: 38.784 },
  { name: "Capella", raHours: 5.278, dec: 45.998 },
  { name: "Rigel", raHours: 5.242, dec: -8.202 },
  { name: "Procyon", raHours: 7.655, dec: 5.225 },
  { name: "Betelgeuse", raHours: 5.919, dec: 7.407 },
  { name: "Altair", raHours: 19.846, dec: 8.868 },
  { name: "Aldebaran", raHours: 4.599, dec: 16.509 },
  { name: "Spica", raHours: 13.42, dec: -11.161 },
  { name: "Antares", raHours: 16.49, dec: -26.432 },
  { name: "Pollux", raHours: 7.755, dec: 28.026 },
  { name: "Fomalhaut", raHours: 22.961, dec: -29.622 },
  { name: "Deneb", raHours: 20.69, dec: 45.28 },
  { name: "Regulus", raHours: 10.139, dec: 11.967 },
];

export const SATELLITES = [
  { id: "landsat-9", label: "Landsat 9", inclination: 98.2, phase: 0.2 },
  { id: "sentinel-2a", label: "Sentinel-2A", inclination: 98.6, phase: 1.4 },
  { id: "sentinel-1", label: "Sentinel-1", inclination: 98.2, phase: 2.6 },
] as const;

export const HISTORICAL_NOTES: { match: RegExp; text: string }[] = [
  { match: /iowa/i, text: "June 2008: the Iowa River at Iowa City exceeded major flood stage and closed campus buildings. This note is a curated reminder, not a complete flood archive." },
  { match: /new orleans|mississippi delta/i, text: "August 2005: Hurricane Katrina drove levee failures across the New Orleans basin. Screening scores here are not a surge model." },
  { match: /sacramento/i, text: "The Sacramento valley has a long record of river and bypass flooding, including the 1986 and 1997 events on the American and Sacramento rivers." },
  { match: /baltimore/i, text: "The Inner Harbor is a tidal basin. Coastal flooding here is driven by storm surge and sea level as much as by river discharge." },
  { match: /cologne|rhine/i, text: "The Rhine at Cologne has a long gauged flood record, including the January 1995 high water that threatened the old town." },
  { match: /sukkur|indus/i, text: "The Indus at Sukkur is a managed barrage reach. The 2010 and 2022 basin floods showed how far inundation can extend beyond the channel." },
  { match: /dhaka|bangladesh/i, text: "The Bengal delta combines river flood, monsoon rain, and cyclone surge. A single gauge does not describe that combination." },
  { match: /rotterdam/i, text: "Rotterdam sits in the Rhine-Meuse estuary behind the Delta Works. River flood and North Sea surge are managed as one system." },
];

export function historicalNote(label: string): string {
  return HISTORICAL_NOTES.find((entry) => entry.match.test(label))?.text
    ?? "No curated flood note is stored for this place. Check the USGS or national hydrological service before citing a past event.";
}

export const NETWORKS = [
  { name: "Hardhat local", chainId: 31337, hex: "0x7a69", explorer: "", rpc: "http://127.0.0.1:8545" },
  { name: "Sepolia", chainId: 11155111, hex: "0xaa36a7", explorer: "https://sepolia.etherscan.io", rpc: "https://rpc.sepolia.org" },
  { name: "Polygon Amoy", chainId: 80002, hex: "0x13882", explorer: "https://amoy.polygonscan.com", rpc: "https://rpc-amoy.polygon.technology" },
  { name: "Arbitrum Sepolia", chainId: 421614, hex: "0x66eee", explorer: "https://sepolia.arbiscan.io", rpc: "https://sepolia-rollup.arbitrum.io/rpc" },
] as const;

export function parseConversationalQuery(query: string): string {
  const trimmed = query.trim();
  const near = trimmed.match(/\b(?:near|around|in|at|of)\s+(.+)$/i);
  if (near?.[1]) return near[1].replace(/\b(prone to flooding|flood risk|rivers?|watershed)\b/gi, "").trim() || trimmed;
  return trimmed;
}
