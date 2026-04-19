import { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import { useBuildings } from "@/contexts/BuildingContext";
import { useSeason } from "@/contexts/SeasonContext";
import { fetchBuildings, fetchBuilding, Building } from "@/lib/api";
import {
  USAGE_COLORS, usageColor, SITE_COORDS, ALL_SITES, SITE_CITIES,
  interpolateSeasonColor, interpolateSeasonOpacity,
} from "@/lib/constants";
import { toast } from "sonner";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

// ── Haversine distance (km) ────────────────────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Find nearest building within maxKm, or null ───────────────────────────
function nearestBuilding(
  buildings: Building[],
  lat: number,
  lon: number,
  maxKm = 50
): Building | null {
  let best: Building | null = null;
  let bestDist = Infinity;
  for (const b of buildings) {
    const d = haversineKm(lat, lon, b.lat, b.lon);
    if (d < bestDist && d <= maxKm) {
      bestDist = d;
      best = b;
    }
  }
  return best;
}

// ── GeoJSON feature builder ────────────────────────────────────────────────
const buildFeatures = (
  buildings: Building[],
  colorMode: "solar" | "usage",
  seasonProgress: number,
  selectedId: string | null,
) => {
  const seasonColor = interpolateSeasonColor(seasonProgress);
  const seasonOpacity = interpolateSeasonOpacity(seasonProgress);
  return {
    type: "FeatureCollection" as const,
    features: buildings.map(b => {
      const isSelected = b.building_id === selectedId;
      const baseColor = colorMode === "solar" ? seasonColor : usageColor(b.primary_space_usage);
      const color = isSelected ? "#00f5ff" : baseColor;
      const opacity = colorMode === "solar" ? seasonOpacity : 0.9;
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [b.lon, b.lat] },
        properties: {
          ...b,
          height: Math.max(8, (b.number_of_floors || 1) * 3.5),
          markerColor: color,
          markerOpacity: opacity,
          isSelected,
        },
      };
    }),
  };
};

interface Props { onBuildingSelect: (id: string) => void; }

export const Globe = ({ onBuildingSelect }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const { buildingsList, setBuildingsList, selectedBuilding, siteFilter, setSiteFilter,
    cacheBuilding, setSelectedBuilding } = useBuildings();
  const { seasonProgress, colorMode } = useSeason();

  const [loaded, setLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // ── Initial load of buildings ────────────────────────────────────────────
  useEffect(() => {
    if (buildingsList.length > 0) return;
    fetchBuildings()
      .then((bs) => setBuildingsList(bs))
      .catch(() => toast.error("Backend offline — start uvicorn on port 8000"));
  }, [buildingsList.length, setBuildingsList]);

  // ── Handle building selection (shared between dot-click and map-click) ───
  const handleSelectBuilding = useCallback(async (
    id: string,
    flyTo?: { lon: number; lat: number }
  ) => {
    if (flyTo) {
      mapRef.current?.flyTo({
        center: [flyTo.lon, flyTo.lat], zoom: 17, pitch: 65,
        bearing: (Math.random() * 60 - 30), duration: 2500, essential: true,
      });
    }
    try {
      const detail = await fetchBuilding(id);
      cacheBuilding(detail);
      setSelectedBuilding(detail);
      onBuildingSelect(id);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) toast.error("Building not found");
      else toast.error("Failed to load building details");
    }
  }, [cacheBuilding, setSelectedBuilding, onBuildingSelect]);

  // ── Init map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/standard",
      projection: "globe" as any,
      center: [0, 20],
      zoom: 2, pitch: 45, bearing: 0,
      antialias: true,
    });
    mapRef.current = map;

    map.on("load", () => {
      try {
        map.setFog({
          color: "rgb(186, 210, 235)",
          "high-color": "rgb(36, 92, 223)",
          "horizon-blend": 0.02,
          "space-color": "rgb(4, 7, 20)",
          "star-intensity": 0.8,
        } as any);
      } catch {}
      setMapReady(true);
    });

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Add/refresh source + layers ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || buildingsList.length === 0) return;

    const data = buildFeatures(
      buildingsList, colorMode, seasonProgress,
      selectedBuilding?.building_id ?? null,
    );

    if (!loaded) {
      if (!map.getSource("buildings-source")) {
        map.addSource("buildings-source", { type: "geojson", data: data as any });

        map.addLayer({
          id: "buildings-halo", type: "circle", source: "buildings-source",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 12, 8, 20, 13, 28],
            "circle-color": ["get", "markerColor"],
            "circle-opacity": 0.12,
            "circle-blur": 1.2,
          },
        });
        map.addLayer({
          id: "buildings-dots", type: "circle", source: "buildings-source",
          maxzoom: 14,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 6, 6, 9, 10, 13, 13, 18, 15, 22],
            "circle-color": ["get", "markerColor"],
            "circle-opacity": ["get", "markerOpacity"],
            "circle-stroke-width": ["case", ["==", ["get", "isSelected"], true], 3, 1.5],
            "circle-stroke-color": "#ffffff",
          },
        });
        map.addLayer({
          id: "buildings-3d", type: "fill-extrusion", source: "buildings-source",
          minzoom: 12,
          paint: {
            "fill-extrusion-color": ["get", "markerColor"],
            "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 12, 20, 16, ["get", "height"]],
            "fill-extrusion-base": 0,
            "fill-extrusion-opacity": 0.85,
          },
        });

        // ── Hover popup ────────────────────────────────────────────────────
        const handleEnter = (e: any) => {
          map.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0]; if (!f) return;
          const p = f.properties as any;
          const html = `
            <div style="font-family:'Inter';">
              <div style="font-family:'JetBrains Mono';color:#00f5ff;font-weight:600;margin-bottom:4px">${p.building_id}</div>
              <div style="display:inline-block;padding:2px 8px;border-radius:999px;background:${USAGE_COLORS[p.primary_space_usage] || "#90A4AE"}33;color:${USAGE_COLORS[p.primary_space_usage] || "#90A4AE"};font-size:10px;margin-bottom:4px">${p.primary_space_usage}</div>
              <div style="font-size:11px;color:#cbd5e1">Floor area: ${Number(p.floor_area).toLocaleString()} m² · Floors: ${p.number_of_floors ?? "—"}</div>
            </div>`;
          if (popupRef.current) popupRef.current.remove();
          popupRef.current = new mapboxgl.Popup({ closeButton: false, offset: 12 })
            .setLngLat(e.lngLat).setHTML(html).addTo(map);
        };
        const handleLeave = () => {
          map.getCanvas().style.cursor = "";
          if (popupRef.current) { popupRef.current.remove(); popupRef.current = null; }
        };

        // ── Building dot click ─────────────────────────────────────────────
        const handleBuildingClick = async (e: any) => {
          e.originalEvent.stopPropagation(); // don't bubble to map click
          const f = e.features?.[0]; if (!f) return;
          const p = f.properties as any;
          await handleSelectBuilding(p.building_id, { lon: p.lon, lat: p.lat });
        };

        ["buildings-dots", "buildings-3d"].forEach(layerId => {
          map.on("mouseenter", layerId, handleEnter);
          map.on("mousemove", layerId, handleEnter);
          map.on("mouseleave", layerId, handleLeave);
          map.on("click", layerId, handleBuildingClick);
        });

        // ── Map background click → nearest building ────────────────────────
        map.on("click", async (e) => {
          // Only fires if no building layer was clicked (layers stop propagation above)
          const { lng, lat } = e.lngLat;

          // Get the current filtered set
          const candidates = siteFilterRef.current
            ? buildingsListRef.current.filter(b => b.site_id === siteFilterRef.current)
            : buildingsListRef.current;

          if (candidates.length === 0) return;

          // Try nearest within 50 km
          let target = nearestBuilding(candidates, lat, lng, 50);

          if (!target) {
            // Nothing close → pick random from candidates
            target = candidates[Math.floor(Math.random() * candidates.length)];
            toast.info(`No building at this spot — selected a random building: ${target.building_id}`, { duration: 3000 });
          }

          await handleSelectBuilding(target.building_id, { lon: target.lon, lat: target.lat });
        });
      }
      setLoaded(true);
    } else {
      const src = map.getSource("buildings-source") as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(data as any);
    }
  }, [buildingsList, mapReady, colorMode, seasonProgress, selectedBuilding, loaded,
      cacheBuilding, setSelectedBuilding, onBuildingSelect, handleSelectBuilding]);

  // ── Keep refs for map click handler (avoids stale closure) ───────────────
  const buildingsListRef = useRef(buildingsList);
  buildingsListRef.current = buildingsList;
  const siteFilterRef = useRef(siteFilter);
  siteFilterRef.current = siteFilter;

  // ── Site filter → map filter expression ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (!siteFilter) {
      ["buildings-halo", "buildings-dots", "buildings-3d"].forEach(id => map.setFilter(id, null as any));
      return;
    }
    const filter = ["==", ["get", "site_id"], siteFilter];
    ["buildings-halo", "buildings-dots", "buildings-3d"].forEach(id => map.setFilter(id, filter as any));
  }, [siteFilter, loaded]);

  if (!TOKEN) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="glass p-8 max-w-md text-center">
          <div className="text-4xl mb-3">🗺</div>
          <div className="font-mono text-energy mb-2">Mapbox token required</div>
          <div className="text-sm text-white/70">Add <code className="text-solar">VITE_MAPBOX_TOKEN</code> to your <code className="text-solar">.env</code> file and restart the dev server.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0 rounded-2xl overflow-hidden" />

      {/* Click hint overlay */}
      {buildingsList.length > 0 && !selectedBuilding && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="glass-flat px-3 py-1.5 rounded-full text-[10px] font-mono text-white/50 flex items-center gap-1.5 animate-pulse">
            <span>🖱️</span>
            <span>Click any building dot — or click anywhere to pick the nearest</span>
          </div>
        </div>
      )}

      {/* Site filter pills */}
      <div className="absolute top-3 left-3 right-3 z-10 overflow-x-auto pb-1 flex gap-1.5 scrollbar-hide">
        <button
          onClick={() => { setSiteFilter(null); mapRef.current?.flyTo({ center: [0, 20], zoom: 2, pitch: 45, bearing: 0, duration: 1500 }); }}
          className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-mono border transition
            ${!siteFilter ? "bg-energy text-[#0a0f1e] border-energy" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"}`}
        >All</button>
        {ALL_SITES.map(s => {
          const active = siteFilter === s;
          const coords = SITE_COORDS[s];
          return (
            <button key={s}
              onClick={() => {
                setSiteFilter(s);
                if (coords) mapRef.current?.flyTo({ center: [coords[1], coords[0]], zoom: 13, pitch: 55, duration: 2000 });
              }}
              className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-mono border transition
                ${active ? "bg-energy text-[#0a0f1e] border-energy" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"}`}
            >{s}</button>
          );
        })}
      </div>

      {/* Map mini-controls */}
      <div className="absolute bottom-3 left-3 z-10 glass-flat rounded-full px-2 py-1 flex items-center gap-1">
        <button title="Reset" className="w-7 h-7 rounded-full hover:bg-white/10 text-sm"
          onClick={() => mapRef.current?.flyTo({ center: [0, 20], zoom: 2, pitch: 45, bearing: 0, duration: 1800 })}>🌍</button>
        <button title="Zoom in" className="w-7 h-7 rounded-full hover:bg-white/10 text-sm"
          onClick={() => mapRef.current?.zoomIn()}>⊕</button>
        <button title="Zoom out" className="w-7 h-7 rounded-full hover:bg-white/10 text-sm"
          onClick={() => mapRef.current?.zoomOut()}>⊖</button>
        <button title="Reset bearing" className="w-7 h-7 rounded-full hover:bg-white/10 text-sm"
          onClick={() => mapRef.current?.easeTo({ bearing: 0, duration: 800 })}>🧭</button>
      </div>

      {/* Site name overlay when filtered */}
      {siteFilter && (
        <div className="absolute bottom-3 right-3 z-10 glass px-3 py-1.5 text-xs font-mono">
          <span className="text-energy">{siteFilter}</span>
          <span className="text-white/40 mx-2">·</span>
          <span className="text-white/60">{SITE_CITIES[siteFilter] || ""}</span>
        </div>
      )}
    </div>
  );
};
