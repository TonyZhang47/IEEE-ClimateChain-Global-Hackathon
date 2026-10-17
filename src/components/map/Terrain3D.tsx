import type { Map, StyleSpecification } from "maplibre-gl";

export const DARK_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";
export const TERRARIUM_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export function rasterFallbackStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      carto: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
          "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO",
      },
    },
    layers: [{ id: "carto", type: "raster", source: "carto" }],
  };
}

export function addTerrain(map: Map, exaggeration = 1.35): void {
  if (!map.getSource("hydro-dem")) {
    map.addSource("hydro-dem", {
      type: "raster-dem",
      tiles: [TERRARIUM_TILES],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 15,
    });
  }
  if (!map.getLayer("hydro-hillshade")) {
    map.addLayer({
      id: "hydro-hillshade",
      type: "hillshade",
      source: "hydro-dem",
      paint: {
        "hillshade-exaggeration": 0.25,
        "hillshade-shadow-color": "#071018",
        "hillshade-highlight-color": "#e8fff8",
        "hillshade-accent-color": "#143840",
      },
    });
  }
  map.setTerrain({ source: "hydro-dem", exaggeration });
}

export function removeTerrain(map: Map): void {
  if (map.getTerrain()) map.setTerrain(null);
}
