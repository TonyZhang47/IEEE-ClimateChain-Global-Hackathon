import type { FeatureCollection, LineString, Polygon } from "geojson";

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

export interface PlaceSuggestion {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  country?: string;
  kind?: string;
}

export interface GaugeReading {
  siteId: string;
  siteName: string;
  latitude: number;
  longitude: number;
  dischargeCfs: number | null;
  gageHeightFt: number | null;
  timestamp: string | null;
  distanceMeters: number;
}

export interface GaugeSeriesPoint {
  timestamp: string;
  dischargeCfs: number | null;
  gageHeightFt: number | null;
}

export interface WetlandFeature {
  id: string;
  name: string;
  wetlandType: string;
  areaHa: number;
  sequestrationTco2ePerYear: number;
  latitude: number;
  longitude: number;
}

export interface FloodRiskScore {
  score: number;
  slopeComponent: number;
  proximityComponent: number;
  dischargeComponent: number;
  elevationM: number | null;
  slopePercent: number | null;
  nearestStreamMeters: number | null;
  depressionMeters: number | null;
  confidence: "high" | "medium" | "low";
  rationale: string[];
}

export interface BlueCarbonRating {
  score: number;
  wetlandAreaHa: number;
  annualSequestrationTco2e: number;
  dominantType: string;
  rationale: string[];
}

export interface WaybackImagery {
  latestTiles: string;
  historicTiles: string;
  historicDate: string;
  latestDate: string;
}

export interface HydroSnapshot {
  place: PlaceSuggestion;
  gauges: GaugeReading[];
  primarySiteId: string | null;
  series: GaugeSeriesPoint[];
  streams: FeatureCollection<LineString>;
  streamSource: "nhd" | "overpass" | "deterministic-flow-model";
  wetlands: WetlandFeature[];
  wetlandGeometry: FeatureCollection<Polygon>;
  risk: FloodRiskScore;
  blueCarbon: BlueCarbonRating;
  wayback: WaybackImagery | null;
  sources: string[];
  notices: string[];
  fetchedAt: string;
}

export interface AdvisoryReport {
  headline: string;
  summary: string;
  communityActions: string[];
  policyActions: string[];
  confidence: "deterministic" | "model";
  model?: string;
  notice?: string;
}

export interface ElevationSample {
  latitude: number;
  longitude: number;
  elevationM: number;
}
