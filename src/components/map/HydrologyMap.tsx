"use client";

import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, LineString, Polygon } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { GaugeReading, WaybackImagery } from "@/types/hydro";
import { addTerrain, DARK_STYLE_URL, rasterFallbackStyle } from "@/components/map/Terrain3D";
import { StreamGaugeLayer } from "@/components/map/StreamGaugeLayer";
import { MapTools } from "@/components/map/MapTools";

interface HydrologyMapProps {
  latitude: number;
  longitude: number;
  label: string;
  streams: FeatureCollection<LineString>;
  wetlands: FeatureCollection<Polygon>;
  gauges: GaugeReading[];
  wayback: WaybackImagery | null;
  streamSource: "nhd" | "overpass" | "deterministic-flow-model";
  onSelectGauge: (gauge: GaugeReading) => void;
}

const DASH_SEQUENCE: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

export function HydrologyMap({
  latitude,
  longitude,
  label,
  streams,
  wetlands,
  gauges,
  wayback,
  streamSource,
  onSelectGauge,
}: HydrologyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const dataRef = useRef({ streams, wetlands });
  const waybackRef = useRef(wayback);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);
  const [imagery, setImagery] = useState<"base" | "latest" | "historic">("base");
  const [styleEpoch, setStyleEpoch] = useState(0);
  const imageryRef = useRef(imagery);
  imageryRef.current = imagery;
  waybackRef.current = wayback;
  dataRef.current = { streams, wetlands };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let frame = 0;
    let fallbackTimer = 0;
    const bag: { stop: () => void; map: MapLibreMap | null } = {
      stop: () => undefined,
      map: null,
    };

    const boot = async () => {
      const maplibre = await import("maplibre-gl");
      if (disposed || !containerRef.current) return;
      const instance = new maplibre.Map({
        container: containerRef.current,
        style: DARK_STYLE_URL,
        center: [longitude, latitude],
        zoom: 3.5,
        pitch: 0,
        bearing: 0,
        maxPitch: 72,
      });
      bag.map = instance;
      mapRef.current = instance;
      setMapInstance(instance);
      const point = new maplibre.Marker({ color: "#e7a15a" })
        .setLngLat([longitude, latitude])
        .setPopup(new maplibre.Popup({ offset: 16 }).setText(label))
        .addTo(instance);

      let flown = false;
      const applyStyle = () => {
        if (disposed || !instance.isStyleLoaded()) return;
        setMapInstance(instance);
        setReady(true);
        try {
          addTerrain(instance);
          ensureHydroLayers(instance);
          setStyleEpoch((current) => current + 1);
          paintData(instance, dataRef.current.streams, dataRef.current.wetlands);
          applyImagery(instance, imageryRef.current, waybackRef.current);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Hydrography layers failed";
          instance.getContainer().dataset.layerError = message;
        }
        if (!flown) {
          flown = true;
          const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          instance.flyTo({
            center: [longitude, latitude],
            zoom: 12.15,
            pitch: 56,
            bearing: -26,
            duration: reduce ? 0 : 2600,
            essential: true,
          });
        }
      };

      instance.on("style.load", applyStyle);
      instance.on("load", applyStyle);
      if (instance.isStyleLoaded()) applyStyle();
      fallbackTimer = window.setTimeout(() => {
        if (disposed || instance.isStyleLoaded()) return;
        instance.setStyle(rasterFallbackStyle());
      }, 8000);

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let step = 0;
      const animate = (timestamp: number) => {
        frame = window.requestAnimationFrame(animate);
        if (reduceMotion || !instance.getLayer("hydro-flow")) return;
        const next = Math.floor(timestamp / 70) % DASH_SEQUENCE.length;
        if (next === step) return;
        step = next;
        const dash = DASH_SEQUENCE[step];
        if (!dash) return;
        instance.setPaintProperty("hydro-flow", "line-dasharray", dash);
      };
      frame = window.requestAnimationFrame(animate);

      const observer = new ResizeObserver(() => instance.resize());
      observer.observe(containerRef.current);
      bag.stop = () => {
        observer.disconnect();
        point.remove();
        window.clearTimeout(fallbackTimer);
        window.cancelAnimationFrame(frame);
      };
    };

    void boot();

    return () => {
      disposed = true;
      bag.stop();
      bag.map?.remove();
      mapRef.current = null;
      setMapInstance(null);
      setReady(false);
    };
  }, [latitude, longitude, label]);

  useEffect(() => {
    const instance = mapRef.current;
    if (!instance || !ready) return;
    paintData(instance, streams, wetlands);
  }, [streams, wetlands, ready]);

  useEffect(() => {
    const instance = mapRef.current;
    if (!instance || !ready) return;
    applyImagery(instance, imagery, wayback);
  }, [imagery, wayback, ready]);

  const sourceLabel =
    streamSource === "nhd"
      ? "NHD flowlines, drawn in digitized direction"
      : streamSource === "overpass"
        ? "OpenStreetMap waterways, drawn in way direction"
        : "Deterministic downhill model";

  return (
    <div className="relative h-full min-h-[420px] w-full">
      <div ref={containerRef} className="map-reticle h-full w-full" />
      <StreamGaugeLayer map={mapInstance} gauges={gauges} onSelect={onSelectGauge} />
      <MapTools
        map={mapInstance}
        ready={ready}
        styleEpoch={styleEpoch}
        latitude={latitude}
        longitude={longitude}
        streams={streams}
      />
      <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2">
        <span className="pointer-events-auto rounded-full border border-line bg-abyss/80 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-mist backdrop-blur">
          {sourceLabel}
        </span>
        <span className="pointer-events-auto rounded-full border border-line bg-abyss/80 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-aqua backdrop-blur">
          Dashed lines follow mapped flow
        </span>
        <span className="pointer-events-auto rounded-full border border-aqua/50 bg-abyss/80 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-foam backdrop-blur">
          Solid pins are live USGS gauges
        </span>
      </div>
      <div className="absolute bottom-8 right-3 flex flex-col gap-2">
        <ImageryButton active={imagery === "base"} onClick={() => setImagery("base")}>
          Dark base
        </ImageryButton>
        <ImageryButton active={imagery === "latest"} onClick={() => setImagery("latest")} disabled={!wayback}>
          {wayback ? `Imagery ${wayback.latestDate.slice(0, 10)}` : "Imagery"}
        </ImageryButton>
        <ImageryButton active={imagery === "historic"} onClick={() => setImagery("historic")} disabled={!wayback}>
          {wayback ? `Wayback ${wayback.historicDate.slice(0, 10)}` : "Wayback"}
        </ImageryButton>
      </div>
    </div>
  );
}

function ImageryButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-left text-[11px] uppercase tracking-[0.12em] backdrop-blur disabled:opacity-40 ${
        active ? "border-aqua bg-aqua text-abyss" : "border-line bg-abyss/80 text-foam"
      }`}
    >
      {children}
    </button>
  );
}

function paintData(
  map: MapLibreMap,
  streams: FeatureCollection<LineString>,
  wetlands: FeatureCollection<Polygon>,
): void {
  const streamSource = asGeoJsonWriter(map.getSource("hydro-streams"));
  const wetlandSource = asGeoJsonWriter(map.getSource("hydro-wetlands"));
  streamSource?.setData(streams);
  wetlandSource?.setData(wetlands);
}

function asGeoJsonWriter(
  source: unknown,
): { setData: (data: FeatureCollection<LineString> | FeatureCollection<Polygon>) => void } | null {
  if (typeof source !== "object" || source === null || !("setData" in source)) return null;
  if (typeof (source as { setData?: unknown }).setData !== "function") return null;
  return source as { setData: (data: FeatureCollection<LineString> | FeatureCollection<Polygon>) => void };
}

function applyImagery(
  map: MapLibreMap,
  imagery: "base" | "latest" | "historic",
  wayback: WaybackImagery | null,
): void {
  if (map.getLayer("hydro-imagery")) map.removeLayer("hydro-imagery");
  if (map.getSource("hydro-imagery")) map.removeSource("hydro-imagery");
  if (imagery === "base" || !wayback) return;
  const tiles = imagery === "historic" ? wayback.historicTiles : wayback.latestTiles;
  map.addSource("hydro-imagery", { type: "raster", tiles: [tiles], tileSize: 256 });
  const before = map.getLayer("hydro-wetlands") ? "hydro-wetlands" : undefined;
  map.addLayer(
    {
      id: "hydro-imagery",
      type: "raster",
      source: "hydro-imagery",
      paint: { "raster-opacity": 0.88 },
    },
    before,
  );
}

function ensureHydroLayers(map: MapLibreMap): void {
  if (!map.getSource("hydro-wetlands")) {
    map.addSource("hydro-wetlands", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getSource("hydro-streams")) {
    map.addSource("hydro-streams", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer("hydro-wetlands")) {
    map.addLayer({
      id: "hydro-wetlands",
      type: "fill",
      source: "hydro-wetlands",
      paint: {
        "fill-color": "#3ddec0",
        "fill-opacity": 0.22,
      },
    });
  }
  if (!map.getLayer("hydro-wetland-line")) {
    map.addLayer({
      id: "hydro-wetland-line",
      type: "line",
      source: "hydro-wetlands",
      paint: {
        "line-color": "#b8fff0",
        "line-width": 1,
        "line-opacity": 0.7,
      },
    });
  }
  if (!map.getLayer("hydro-streams")) {
    map.addLayer({
      id: "hydro-streams",
      type: "line",
      source: "hydro-streams",
      paint: {
        "line-color": "#1f8f86",
        "line-width": 2.4,
        "line-opacity": 0.85,
      },
      layout: { "line-cap": "round", "line-join": "round" },
    });
  }
  if (!map.getLayer("hydro-flow")) {
    map.addLayer({
      id: "hydro-flow",
      type: "line",
      source: "hydro-streams",
      paint: {
        "line-color": "#d8fff6",
        "line-width": 1.6,
        "line-dasharray": [0, 4, 3],
        "line-opacity": 0.95,
      },
    });
  }
}
