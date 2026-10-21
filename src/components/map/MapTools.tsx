"use client";

import { useEffect, useState } from "react";
import type { FeatureCollection, LineString } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";

interface MapToolsProps {
  map: MapLibreMap | null;
  ready: boolean;
  styleEpoch: number;
  latitude: number;
  longitude: number;
  streams: FeatureCollection<LineString>;
}

export function MapTools({ map, ready, styleEpoch, latitude, longitude }: MapToolsProps) {
  const [hydroOn, setHydroOn] = useState(true);
  const [wetlandsOn, setWetlandsOn] = useState(true);

  useEffect(() => {
    if (!map || !ready || !map.isStyleLoaded()) return;
    setLayerVisibility(map, "hydro-streams", hydroOn);
    setLayerVisibility(map, "hydro-flow", hydroOn);
    setLayerVisibility(map, "hydro-wetlands", wetlandsOn);
    setLayerVisibility(map, "hydro-wetland-line", wetlandsOn);
  }, [map, ready, styleEpoch, hydroOn, wetlandsOn]);

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

  return (
    <div className="pointer-events-none absolute left-3 top-14 z-10 w-56 max-w-[calc(100%-1.5rem)]">
      <div className="pointer-events-auto glass space-y-3 rounded-2xl p-3 text-xs text-mist">
        <p className="text-[11px] uppercase tracking-[0.16em] text-foam">On this map</p>
        <div className="flex flex-wrap gap-1">
          <Toggle on={hydroOn} onClick={() => setHydroOn((value) => !value)}>Hydrography</Toggle>
          <Toggle on={wetlandsOn} onClick={() => setWetlandsOn((value) => !value)}>Wetlands</Toggle>
        </div>
        <p>Solid pins are live USGS gauges. Dashed lines are mapped flow.</p>
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

function setLayerVisibility(map: MapLibreMap, id: string, visible: boolean): void {
  if (!map.getLayer(id)) return;
  map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}
