"use client";

import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { buffer, circle, point } from "@turf/turf";
import { cellToBoundary, gridDiskDistances, latLngToCell } from "h3-js";
import { DARK_STYLE_URL, LIGHT_STYLE_URL } from "@/components/map/Terrain3D";

interface MapToolsProps {
  map: MapLibreMap | null;
  ready: boolean;
  styleEpoch: number;
  latitude: number;
  longitude: number;
  streams: FeatureCollection<LineString>;
}

type TraceMode = "basin" | "upstream" | "downstream";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

export function MapTools({ map, ready, styleEpoch, latitude, longitude, streams }: MapToolsProps) {
  const [palette, setPalette] = useState<"dark" | "light">("dark");
  const [exaggeration, setExaggeration] = useState(1.5);
  const [bufferKm, setBufferKm] = useState<0 | 0.5 | 1 | 5>(0);
  const [stageM, setStageM] = useState(0);
  const [hexOn, setHexOn] = useState(false);
  const [particlesOn, setParticlesOn] = useState(true);
  const [ringsOn, setRingsOn] = useState(false);
  const [radarOn, setRadarOn] = useState(false);
  const [hydroOn, setHydroOn] = useState(true);
  const [wetlandsOn, setWetlandsOn] = useState(true);
  const [trace, setTrace] = useState<TraceMode | null>(null);
  const [traceData, setTraceData] = useState<FeatureCollection | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [traceNote, setTraceNote] = useState<string | null>(null);
  const [climate, setClimate] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ distanceM: number; elevationM: number }[] | null>(null);
  const paletteReady = useRef(false);

  useEffect(() => {
    if (!map || !ready) return;
    if (!map.isStyleLoaded()) return;
    ensureOverlay(map);
    paintGeo(map, "hydro-buffer", bufferKm === 0 ? EMPTY : diskCollection(longitude, latitude, bufferKm));
    paintGeo(map, "hydro-stage", stageM === 0 ? EMPTY : diskCollection(longitude, latitude, stageM * 0.08));
    paintGeo(map, "hydro-rings", ringsOn ? walkRings(longitude, latitude) : EMPTY);
    paintGeo(map, "hydro-hex", hexOn ? hexGrid(latitude, longitude) : EMPTY);
    paintGeo(map, "hydro-trace", traceData ?? EMPTY);
    setLayerVisibility(map, "hydro-streams", hydroOn);
    setLayerVisibility(map, "hydro-flow", hydroOn);
    setLayerVisibility(map, "hydro-wetlands", wetlandsOn);
    setLayerVisibility(map, "hydro-wetland-line", wetlandsOn);
    if (map.getSource("hydro-dem")) {
      map.setTerrain({ source: "hydro-dem", exaggeration });
    }
  }, [map, ready, styleEpoch, bufferKm, stageM, ringsOn, hexOn, hydroOn, wetlandsOn, exaggeration, latitude, longitude, traceData]);

  useEffect(() => {
    if (!map || !ready) return;
    if (!paletteReady.current) {
      paletteReady.current = true;
      return;
    }
    map.setStyle(palette === "light" ? LIGHT_STYLE_URL : DARK_STYLE_URL);
  }, [palette, map, ready]);

  useEffect(() => {
    if (!map || !ready || !particlesOn) return;
    let frame = 0;
    let phase = 0;
    const tick = () => {
      frame = window.requestAnimationFrame(tick);
      if (!map.getSource("hydro-particles") || !map.isStyleLoaded()) return;
      phase = (phase + 0.04) % 8;
      paintGeo(map, "hydro-particles", flowParticles(streams, phase));
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [map, ready, particlesOn, streams, styleEpoch]);

  useEffect(() => {
    if (!map || !ready) return;
    if (map.getLayer("hydro-particles")) {
      map.setLayoutProperty("hydro-particles", "visibility", particlesOn ? "visible" : "none");
    }
  }, [map, ready, particlesOn, styleEpoch]);

  useEffect(() => {
    if (!map || !ready) return;
    let cancelled = false;
    const clear = () => {
      if (map.getLayer("hydro-radar")) map.removeLayer("hydro-radar");
      if (map.getSource("hydro-radar")) map.removeSource("hydro-radar");
    };
    if (!radarOn) {
      clear();
      return;
    }
    void fetch("/api/radar")
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok || !isRecord(body) || typeof body.tiles !== "string") {
          throw new Error(readError(body) ?? "Radar was not available.");
        }
        if (cancelled || !map.isStyleLoaded()) return;
        clear();
        map.addSource("hydro-radar", { type: "raster", tiles: [body.tiles], tileSize: 256 });
        const before = map.getLayer("hydro-wetlands") ? "hydro-wetlands" : undefined;
        map.addLayer({ id: "hydro-radar", type: "raster", source: "hydro-radar", paint: { "raster-opacity": 0.55 } }, before);
        setStatus("RainViewer radar is the latest public frame.");
      })
      .catch((reason: unknown) => {
        if (!cancelled) setStatus(reason instanceof Error ? reason.message : "Radar failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [radarOn, map, ready, styleEpoch]);

  useEffect(() => {
    if (!trace) {
      setTraceData(null);
      setTraceNote(null);
      return;
    }
    let cancelled = false;
    setTraceNote("Tracing NLDI…");
    void fetch(`/api/nldi?lat=${latitude}&lon=${longitude}&mode=${trace}`)
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok || !isRecord(body)) throw new Error(readError(body) ?? "NLDI trace failed.");
        const geojson = body.geojson;
        if (!isFeatureCollection(geojson)) throw new Error("NLDI returned no features.");
        if (cancelled) return;
        setTraceData(geojson);
        setTraceNote(
          trace === "basin"
            ? `Catchment ${String(body.comid)} from NLDI.`
            : trace === "upstream"
              ? "Upstream tributaries within 25 km of the NLDI comid."
              : "Downstream main path within 25 km of the NLDI comid.",
        );
      })
      .catch((reason: unknown) => {
        if (!cancelled) setTraceNote(reason instanceof Error ? reason.message : "NLDI trace failed.");
      });
    return () => {
      cancelled = true;
    };
  }, [trace, latitude, longitude]);

  useEffect(() => {
    const controller = new AbortController();
    setClimate(null);
    void fetch(`/api/climate?lat=${latitude}&lon=${longitude}`, { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok || !isRecord(body)) throw new Error(readError(body) ?? "Climate layer failed.");
        const rain = typeof body.precipitationMm === "number" ? `${body.precipitationMm.toFixed(1)} mm` : "no rain value";
        const soil = typeof body.soilMoisture === "number" ? body.soilMoisture.toFixed(3) : "n/a";
        setClimate(`Next hours ${rain} · soil moisture ${soil}`);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setClimate(reason instanceof Error ? reason.message : "Climate layer failed.");
      });
    return () => controller.abort();
  }, [latitude, longitude]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!map) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        map.zoomIn({ duration: 200 });
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        map.zoomOut({ duration: 200 });
      } else if (event.key === "ArrowLeft") {
        map.panBy([-90, 0], { duration: 180 });
      } else if (event.key === "ArrowRight") {
        map.panBy([90, 0], { duration: 180 });
      } else if (event.key === "ArrowUp") {
        map.panBy([0, -90], { duration: 180 });
      } else if (event.key === "ArrowDown") {
        map.panBy([0, 90], { duration: 180 });
      } else if (event.key === " ") {
        event.preventDefault();
        map.flyTo({ center: [longitude, latitude], zoom: 12.2, pitch: 58, bearing: -24, duration: 1400 });
      } else if (event.key.toLowerCase() === "m") {
        setHydroOn((current) => !current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map, latitude, longitude]);

  const loadProfile = () => {
    setStatus("Sampling elevation…");
    void fetch(`/api/profile?lat=${latitude}&lon=${longitude}&bearing=90`)
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok || !isRecord(body) || !Array.isArray(body.samples)) {
          throw new Error(readError(body) ?? "Profile failed.");
        }
        const samples = body.samples.filter(isSample);
        setProfile(samples);
        setStatus("East–west elevation every 200 m from USGS EPQS.");
      })
      .catch((reason: unknown) => setStatus(reason instanceof Error ? reason.message : "Profile failed."));
  };

  return (
    <div className="pointer-events-none absolute left-3 top-14 z-10 w-64 max-w-[calc(100%-1.5rem)]">
      <div className="pointer-events-auto glass max-h-[62vh] space-y-3 overflow-auto rounded-2xl p-3 text-xs text-mist">
        <p className="text-[11px] uppercase tracking-[0.16em] text-foam">Map layers</p>
        <div className="flex flex-wrap gap-1">
          <Toggle on={palette === "light"} onClick={() => setPalette((current) => (current === "dark" ? "light" : "dark"))}>
            {palette === "dark" ? "Dark" : "Light"}
          </Toggle>
          <Toggle on={hydroOn} onClick={() => setHydroOn((value) => !value)}>Hydrography</Toggle>
          <Toggle on={wetlandsOn} onClick={() => setWetlandsOn((value) => !value)}>Wetlands</Toggle>
          <Toggle on={radarOn} onClick={() => setRadarOn((value) => !value)}>Radar</Toggle>
          <Toggle on={hexOn} onClick={() => setHexOn((value) => !value)}>H3</Toggle>
          <Toggle on={particlesOn} onClick={() => setParticlesOn((value) => !value)}>Particles</Toggle>
          <Toggle on={ringsOn} onClick={() => setRingsOn((value) => !value)}>Walk rings</Toggle>
        </div>
        <label className="block">
          Terrain exaggeration {exaggeration.toFixed(1)}×
          <input
            className="mt-1 w-full"
            type="range"
            min={1}
            max={2}
            step={0.1}
            value={exaggeration}
            onChange={(event) => setExaggeration(Number(event.target.value))}
          />
        </label>
        <div className="flex flex-wrap gap-1">
          <Toggle on={bufferKm === 0.5} onClick={() => setBufferKm(bufferKm === 0.5 ? 0 : 0.5)}>500 m</Toggle>
          <Toggle on={bufferKm === 1} onClick={() => setBufferKm(bufferKm === 1 ? 0 : 1)}>1 km</Toggle>
          <Toggle on={bufferKm === 5} onClick={() => setBufferKm(bufferKm === 5 ? 0 : 5)}>5 km</Toggle>
        </div>
        <label className="block">
          Stage screen +{stageM} m
          <input
            className="mt-1 w-full"
            type="range"
            min={0}
            max={10}
            step={1}
            value={stageM}
            onChange={(event) => setStageM(Number(event.target.value))}
          />
        </label>
        <p>The stage control draws an 80 m radius disk per meter. It is not a DEM inundation fill.</p>
        <p>Walk rings are 5, 10, and 15 minutes at 4 km/h in a straight line, not a road isochrone.</p>
        <div className="flex flex-wrap gap-1">
          <Toggle on={trace === "basin"} onClick={() => setTrace(trace === "basin" ? null : "basin")}>Basin</Toggle>
          <Toggle on={trace === "upstream"} onClick={() => setTrace(trace === "upstream" ? null : "upstream")}>Upstream</Toggle>
          <Toggle on={trace === "downstream"} onClick={() => setTrace(trace === "downstream" ? null : "downstream")}>Downstream</Toggle>
          <button type="button" className="btn-ghost" onClick={loadProfile}>Profile</button>
        </div>
        {climate ? <p>{climate}</p> : <p>Loading precipitation and soil moisture…</p>}
        {traceNote ? <p>{traceNote}</p> : null}
        {status ? <p>{status}</p> : null}
        {profile ? <ProfileChart samples={profile} /> : null}
        <p className="text-[10px] uppercase tracking-[0.14em]">Arrows pan · +/- zoom · space recenters · M toggles hydrography</p>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${on ? "border-aqua bg-aqua text-abyss" : "border-line text-foam"}`}
    >
      {children}
    </button>
  );
}

function ProfileChart({ samples }: { samples: { distanceM: number; elevationM: number }[] }) {
  const min = Math.min(...samples.map((sample) => sample.elevationM));
  const max = Math.max(...samples.map((sample) => sample.elevationM));
  const span = Math.max(1, max - min);
  const minDistance = Math.min(...samples.map((sample) => sample.distanceM));
  const maxDistance = Math.max(...samples.map((sample) => sample.distanceM));
  const distanceSpan = Math.max(1, maxDistance - minDistance);
  const points = samples
    .map((sample) => {
      const x = ((sample.distanceM - minDistance) / distanceSpan) * 220;
      const y = 48 - ((sample.elevationM - min) / span) * 40;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 220 56" className="w-full" role="img" aria-label="Elevation profile">
      <polyline fill="none" stroke="#3ddec0" strokeWidth="2" points={points} />
    </svg>
  );
}

function ensureOverlay(map: MapLibreMap): void {
  addGeoSource(map, "hydro-buffer");
  addGeoSource(map, "hydro-stage");
  addGeoSource(map, "hydro-rings");
  addGeoSource(map, "hydro-hex");
  addGeoSource(map, "hydro-trace");
  addGeoSource(map, "hydro-particles");
  addFill(map, "hydro-buffer-fill", "hydro-buffer", "#e7a15a", 0.16);
  addLine(map, "hydro-buffer-line", "hydro-buffer", "#e7a15a");
  addFill(map, "hydro-stage-fill", "hydro-stage", "#4aa3ff", 0.28);
  addLine(map, "hydro-rings-line", "hydro-rings", "#f2d48a");
  addFill(map, "hydro-hex-fill", "hydro-hex", "#00f0ff", 0.08);
  addLine(map, "hydro-hex-line", "hydro-hex", "#00f0ff");
  addFill(map, "hydro-trace-fill", "hydro-trace", "#e7a15a", 0.18);
  addLine(map, "hydro-trace-line", "hydro-trace", "#ffd7a1");
  if (!map.getLayer("hydro-particles")) {
    map.addLayer({
      id: "hydro-particles",
      type: "circle",
      source: "hydro-particles",
      paint: { "circle-radius": 2.4, "circle-color": "#e8fff8", "circle-opacity": 0.9 },
    });
  }
}

function addGeoSource(map: MapLibreMap, id: string): void {
  if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: EMPTY });
}

function addFill(map: MapLibreMap, id: string, source: string, color: string, opacity: number): void {
  if (map.getLayer(id)) return;
  map.addLayer({ id, type: "fill", source, paint: { "fill-color": color, "fill-opacity": opacity } });
}

function addLine(map: MapLibreMap, id: string, source: string, color: string): void {
  if (map.getLayer(id)) return;
  map.addLayer({ id, type: "line", source, paint: { "line-color": color, "line-width": 1.4, "line-opacity": 0.85 } });
}

function paintGeo(map: MapLibreMap, id: string, data: FeatureCollection): void {
  const source = map.getSource(id);
  if (source && "setData" in source && typeof source.setData === "function") {
    source.setData(data);
  }
}

function setLayerVisibility(map: MapLibreMap, id: string, visible: boolean): void {
  if (!map.getLayer(id)) return;
  map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}

function diskCollection(longitude: number, latitude: number, kilometers: number): FeatureCollection<Polygon> {
  const shape = kilometers >= 0.5 ? buffer(point([longitude, latitude]), kilometers, { units: "kilometers" }) : circle([longitude, latitude], kilometers, { steps: 64, units: "kilometers" });
  if (!shape || shape.geometry.type !== "Polygon") return { type: "FeatureCollection", features: [] };
  return { type: "FeatureCollection", features: [shape as FeatureCollection<Polygon>["features"][number]] };
}

function walkRings(longitude: number, latitude: number): FeatureCollection<Polygon> {
  const minutes = [5, 10, 15];
  const features = minutes
    .map((minute) => circle([longitude, latitude], (4 * minute) / 60, { steps: 64, units: "kilometers" }))
    .filter((feature) => feature.geometry.type === "Polygon");
  return { type: "FeatureCollection", features };
}

function hexGrid(latitude: number, longitude: number): FeatureCollection<Polygon> {
  const origin = latLngToCell(latitude, longitude, 7);
  const rings = gridDiskDistances(origin, 2);
  const features = rings.flatMap((ring, distance) =>
    ring.map((cell) => {
      const boundary = cellToBoundary(cell, true);
      const ringCoords = [...boundary, boundary[0]].filter((pair): pair is [number, number] => Array.isArray(pair));
      return {
        type: "Feature" as const,
        properties: { distance },
        geometry: { type: "Polygon" as const, coordinates: [ringCoords] },
      };
    }),
  );
  return { type: "FeatureCollection", features };
}

function flowParticles(streams: FeatureCollection<LineString>, phase: number): FeatureCollection<Point> {
  const features = streams.features.slice(0, 48).flatMap((feature, featureIndex) => {
    const coordinates = feature.geometry.coordinates;
    if (coordinates.length < 2) return [];
    const cursor = (phase + featureIndex * 0.37) % (coordinates.length - 1);
    const index = Math.floor(cursor);
    const start = coordinates[index];
    const end = coordinates[index + 1];
    if (!start || !end) return [];
    const t = cursor - index;
    return [
      {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "Point" as const,
          coordinates: [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t],
        },
      },
    ];
  });
  return { type: "FeatureCollection", features };
}

function isSample(value: unknown): value is { distanceM: number; elevationM: number } {
  return isRecord(value) && typeof value.distanceM === "number" && typeof value.elevationM === "number";
}

function isFeatureCollection(value: unknown): value is FeatureCollection {
  return isRecord(value) && value.type === "FeatureCollection" && Array.isArray(value.features);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readError(value: unknown): string | null {
  if (!isRecord(value) || typeof value.error !== "string") return null;
  return value.error;
}
