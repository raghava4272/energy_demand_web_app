import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useBuildings } from "@/contexts/BuildingContext";
import { useTime } from "@/contexts/TimeContext";
import { useSeason } from "@/contexts/SeasonContext";
import { usePrediction } from "@/contexts/PredictionContext";
import { fetchBuilding } from "@/lib/api";
import {
  SITE_CITIES, usageColor,
  MONTH_DEFAULTS, interpolateSolar, isNight,
} from "@/lib/constants";
import { AnimatedNumber } from "./AnimatedNumber";
import { ResultsChart } from "./ResultsChart";
import { toast } from "sonner";

const parseBuildingId = (id: string) => {
  const parts = id.split("_");
  return {
    site: parts[0] || id,
    usage: parts[1] || "",
    name: parts.slice(2).join(" ") || "",
  };
};

const NightChip = () => (
  <div className="text-xs font-mono text-white/60 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
    🌙 Night — Solar output will be ~0 kWh
  </div>
);

export const SidePanel = () => {
  const {
    selectedBuilding,
    setSelectedBuilding,
    buildingsList,
    setSiteFilter,
    cacheBuilding,
    buildingStatsCache,
  } = useBuildings();
  const { hour, day, month, year } = useTime();
  const { seasonProgress } = useSeason();
  const { prediction, isLoading, error, runPrediction, reset } = usePrediction();

  // Site → building list navigation
  const [activeSite, setActiveSite] = useState<string | null>(null);
  const [buildingSearch, setBuildingSearch] = useState("");
  const [loadingBuilding, setLoadingBuilding] = useState<string | null>(null);

  // ── Sync panel when building is selected externally (map click) ──────────
  // When Globe sets selectedBuilding via context, make sure activeSite matches
  // so the panel jumps straight to building detail view instead of staying
  // stuck on the site list.
  useEffect(() => {
    if (selectedBuilding) {
      const site = selectedBuilding.building_id.split("_")[0];
      setActiveSite(site);
      reset(); // clear any stale prediction
    }
  }, [selectedBuilding?.building_id]); // eslint-disable-line

  const night = isNight(hour);
  const monthDef = MONTH_DEFAULTS[month] ?? MONTH_DEFAULTS[6];
  const interpSolar = useMemo(() => interpolateSolar(seasonProgress), [seasonProgress]);

  // Weather inputs — seeded from month defaults
  const [airTemp, setAirTemp] = useState(monthDef.temp);
  const [dewTemp, setDewTemp] = useState(monthDef.temp - 5);
  const [windSpeed, setWindSpeed] = useState(4.5);
  const [windDir, setWindDir] = useState(180);
  const [clouds, setClouds] = useState(monthDef.clouds);
  const [precip, setPrecip] = useState(0);
  const [pressure, setPressure] = useState(1013.0);

  // Solar inputs — auto-driven by hour + season
  const [ghi, setGhi] = useState(monthDef.GHI);
  const [dni, setDni] = useState(monthDef.DNI);
  const [dhi, setDhi] = useState(monthDef.DHI);

  const [showWeather, setShowWeather] = useState(true);
  const [showSolar, setShowSolar] = useState(false);

  // Sync weather defaults when month changes
  useEffect(() => {
    setAirTemp(monthDef.temp);
    setDewTemp(monthDef.temp - 5);
    setClouds(monthDef.clouds);
  }, [month]); // eslint-disable-line

  // Auto-compute solar from season + hour
  useEffect(() => {
    if (night) { setGhi(0); setDni(0); setDhi(0); return; }
    const scale = Math.max(0, Math.sin(Math.PI * (hour - 6) / 14));
    setGhi(Math.round(interpSolar.GHI * scale));
    setDni(Math.round(interpSolar.DNI * scale));
    setDhi(Math.round(interpSolar.DHI * scale));
  }, [hour, seasonProgress, night, interpSolar]);

  // Reset prediction when building changes
  useEffect(() => { if (!selectedBuilding) reset(); }, [selectedBuilding, reset]);

  // Buildings for the active site
  const siteBuildings = useMemo(() => {
    if (!activeSite) return [];
    return buildingsList
      .filter(b => b.site_id === activeSite)
      .filter(b => {
        if (!buildingSearch.trim()) return true;
        return b.building_id.toLowerCase().includes(buildingSearch.toLowerCase()) ||
          b.primary_space_usage.toLowerCase().includes(buildingSearch.toLowerCase());
      })
      .sort((a, b) => a.building_id.localeCompare(b.building_id));
  }, [buildingsList, activeSite, buildingSearch]);

  // Unique sites with building counts
  const siteSummaries = useMemo(() => {
    const map: Record<string, number> = {};
    buildingsList.forEach(b => { map[b.site_id] = (map[b.site_id] || 0) + 1; });
    return Object.entries(map)
      .map(([site, count]) => ({ site, count, city: SITE_CITIES[site] || "" }))
      .sort((a, b) => a.site.localeCompare(b.site));
  }, [buildingsList]);

  // Select a building — fetch detail from backend (parquet data)
  const handleSelectBuilding = async (buildingId: string) => {
    // Check cache first
    if (buildingStatsCache[buildingId]) {
      setSelectedBuilding(buildingStatsCache[buildingId]);
      return;
    }
    setLoadingBuilding(buildingId);
    try {
      const detail = await fetchBuilding(buildingId);
      cacheBuilding(detail);
      setSelectedBuilding(detail);
    } catch {
      toast.error("Failed to load building data");
    } finally {
      setLoadingBuilding(null);
    }
  };

  const handleRun = () => {
    if (!selectedBuilding) return;
    runPrediction(
      selectedBuilding.building_id,
      { hour, day, month, year },
      {
        air_temperature: airTemp,
        dew_temperature: dewTemp,
        wind_speed: windSpeed,
        wind_direction: windDir,
        cloud_coverage: clouds,
        precip_depth_1_hr: precip,
        sea_level_pressure: pressure,
      },
      { GHI: ghi, DNI: dni, DHI: dhi },
    );
  };

  const InputCell = ({
    label, unit, value, onChange, min, max, step = 1, disabled,
  }: {
    label: string; unit: string; value: number;
    onChange: (n: number) => void;
    min?: number; max?: number; step?: number; disabled?: boolean;
  }) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider text-white/50">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="number" value={value}
          min={min} max={max} step={step} disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-8 bg-white/5 border border-white/10 rounded-md px-2 font-mono text-xs text-white disabled:opacity-40 focus:border-energy/50 outline-none"
        />
        <span className="text-[10px] font-mono text-white/40 px-1.5 py-0.5 rounded bg-white/5">{unit}</span>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────
  // STATE 1: Site list (no site selected, no building)
  // ─────────────────────────────────────────────────────
  if (!activeSite && !selectedBuilding) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 pt-4 pb-2">
          <div className="text-[10px] uppercase tracking-widest text-white/40 mb-1">🌍 Select a Site</div>
          <div className="text-xs text-white/50">
            {buildingsList.length > 0
              ? `${buildingsList.length.toLocaleString()} buildings across ${siteSummaries.length} sites`
              : <span className="animate-pulse">Loading buildings…</span>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1.5">
          {siteSummaries.map(({ site, city, count }) => (
            <button
              key={site}
              onClick={() => {
                setActiveSite(site);
                setSiteFilter(site);
                setBuildingSearch("");
              }}
              className="w-full text-left glass-flat rounded-xl p-3 hover:bg-white/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-energy text-sm group-hover:text-white transition-colors">{site}</div>
                  <div className="text-[11px] text-white/50">{city}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-white/60">{count} bldgs</span>
                  <span className="text-white/30 group-hover:text-energy transition-colors">›</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────
  // STATE 2: Building list for active site
  // ─────────────────────────────────────────────────────
  if (activeSite && !selectedBuilding) {
    return (
      <motion.div
        key="site-buildings"
        initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        className="h-full flex flex-col"
      >
        {/* Header */}
        <div className="px-4 pt-3 pb-2 border-b border-white/10">
          <button
            onClick={() => {
              setActiveSite(null);
              setSiteFilter(null);
              setBuildingSearch("");
            }}
            className="text-xs font-mono text-white/60 hover:text-energy transition mb-2 flex items-center gap-1"
          >
            ← All Sites
          </button>
          <div className="font-mono text-energy text-base">{activeSite}</div>
          <div className="text-[11px] text-white/50 mb-2">{SITE_CITIES[activeSite]} · {siteBuildings.length} buildings</div>
          {/* Search */}
          <input
            type="text"
            placeholder="Search building or usage type…"
            value={buildingSearch}
            onChange={e => setBuildingSearch(e.target.value)}
            className="w-full h-8 bg-white/5 border border-white/10 rounded-lg px-3 text-xs font-mono text-white placeholder-white/30 outline-none focus:border-energy/40"
          />
        </div>

        {/* Building list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {siteBuildings.map(b => {
            const { usage, name } = parseBuildingId(b.building_id);
            const color = usageColor(b.primary_space_usage);
            const isLoading = loadingBuilding === b.building_id;
            return (
              <button
                key={b.building_id}
                disabled={isLoading}
                onClick={() => handleSelectBuilding(b.building_id)}
                className="w-full text-left glass-flat rounded-xl p-3 hover:bg-white/10 transition-all group disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-white text-xs truncate group-hover:text-energy transition-colors">
                      {isLoading ? "⏳ Loading…" : name || b.building_id}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono border"
                        style={{ background: color + "22", color, borderColor: color + "55" }}>
                        {usage}
                      </span>
                      {b.floor_area > 0 && (
                        <span className="text-[9px] text-white/40 font-mono">
                          {Number(b.floor_area).toLocaleString()} m²
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-white/30 group-hover:text-energy transition-colors text-sm flex-shrink-0">›</span>
                </div>
              </button>
            );
          })}
          {siteBuildings.length === 0 && buildingSearch && (
            <div className="text-xs text-white/40 text-center py-8 font-mono">No buildings match "{buildingSearch}"</div>
          )}
        </div>
      </motion.div>
    );
  }

  // ─────────────────────────────────────────────────────
  // STATE 3: Building selected — show data + inputs + results
  // ─────────────────────────────────────────────────────
  if (!selectedBuilding) return null;
  const { site, usage, name } = parseBuildingId(selectedBuilding.building_id);
  const usageHex = usageColor(selectedBuilding.primary_space_usage);

  return (
    <motion.div
      key="building-detail"
      initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="h-full flex flex-col"
    >
      {/* Header nav */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-white/10">
        <button
          onClick={() => {
            setSelectedBuilding(null);
            reset();
            // Stay on site list if we came from one
            if (activeSite) setBuildingSearch("");
          }}
          className="text-xs font-mono text-white/60 hover:text-energy transition"
        >
          ← {activeSite ? activeSite : "Back"}
        </button>
        {prediction && (
          <button onClick={reset} className="text-xs font-mono text-energy hover:underline">
            ← Adjust Inputs
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 pt-3">

        {/* ── Building identity + parquet stats ── */}
        <div className="glass p-4">
          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-energy/15 text-energy border border-energy/30">{site}</span>
            {usage && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border"
                style={{ background: usageHex + "22", color: usageHex, borderColor: usageHex + "55" }}>
                {usage}
              </span>
            )}
            {name && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/5 text-white/70 border border-white/10">{name}</span>
            )}
          </div>

          <div className="font-mono text-energy text-xs mb-3 opacity-60 break-all">{selectedBuilding.building_id}</div>

          {/* Building specs */}
          <div className="grid grid-cols-3 gap-2 text-[10px] mb-3">
            {[
              { label: "Floor Area", value: `${Number(selectedBuilding.floor_area || 0).toLocaleString()} m²` },
              { label: "Year Built", value: selectedBuilding.year_built ?? "—" },
              { label: "Floors", value: selectedBuilding.number_of_floors ?? "—" },
            ].map(f => (
              <div key={f.label} className="bg-white/5 rounded-lg p-2 text-center">
                <div className="text-white/40 mb-0.5">{f.label}</div>
                <div className="font-mono text-white text-xs">{f.value}</div>
              </div>
            ))}
          </div>

          {/* Historical consumption from parquet */}
          <div className="border-t border-white/10 pt-3">
            <div className="text-[9px] uppercase tracking-widest text-white/40 mb-2">📊 Historical Consumption (from parquet data)</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-energy/8 border border-energy/20 rounded-lg p-2 text-center">
                <div className="text-[9px] text-white/50">Mean</div>
                <div className="font-mono text-energy text-sm font-bold">
                  {selectedBuilding.mean_consumption != null ? Number(selectedBuilding.mean_consumption).toFixed(1) : "—"}
                </div>
                <div className="text-[9px] text-white/40">kWh</div>
              </div>
              <div className="bg-orange-500/8 border border-orange-500/20 rounded-lg p-2 text-center">
                <div className="text-[9px] text-white/50">Peak</div>
                <div className="font-mono text-orange-400 text-sm font-bold">
                  {selectedBuilding.peak_consumption != null ? Number(selectedBuilding.peak_consumption).toFixed(1) : "—"}
                </div>
                <div className="text-[9px] text-white/40">kWh</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-lg p-2 text-center">
                <div className="text-[9px] text-white/50">Min</div>
                <div className="font-mono text-white text-sm font-bold">
                  {selectedBuilding.min_consumption != null ? Number(selectedBuilding.min_consumption).toFixed(1) : "—"}
                </div>
                <div className="text-[9px] text-white/40">kWh</div>
              </div>
            </div>
            <div className="flex justify-between mt-1.5 text-[9px] font-mono text-white/30">
              <span>{selectedBuilding.record_count?.toLocaleString() ?? "—"} hourly records</span>
              <span>{selectedBuilding.available_years?.join(", ") ?? "2016–2017"}</span>
            </div>
          </div>
        </div>

        {/* ── Current timestamp being predicted ── */}
        <div className="glass px-4 py-2.5 flex items-center justify-between">
          <span className="text-[10px] text-white/50 font-mono">🕐 Predicting for</span>
          <span className="font-mono text-energy text-xs">
            {String(hour).padStart(2, "0")}:00 · Day {day} · Month {month} · {year}
          </span>
        </div>

        {/* ── Inputs (hidden once prediction is shown) ── */}
        {!prediction && (
          <>
            {/* Weather */}
            <Collapsible.Root open={showWeather} onOpenChange={setShowWeather}>
              <div className="glass p-4">
                <Collapsible.Trigger className="w-full flex items-center justify-between text-xs font-mono text-white/80 mb-1">
                  <span>☁️ Weather <span className="text-white/40 text-[10px]">(auto-seeded from month)</span></span>
                  <span className="text-white/40">{showWeather ? "▲" : "▼"}</span>
                </Collapsible.Trigger>
                <Collapsible.Content>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <InputCell label="Air Temp" unit="°C" value={airTemp} onChange={setAirTemp} step={0.5} />
                    <InputCell label="Dew Temp" unit="°C" value={dewTemp} onChange={setDewTemp} step={0.5} />
                    <InputCell label="Wind Speed" unit="m/s" value={windSpeed} onChange={setWindSpeed} step={0.1} min={0} />
                    <InputCell label="Wind Dir" unit="°" value={windDir} onChange={setWindDir} min={0} max={360} />
                    <InputCell label="Cloud Cover" unit="oktas" value={clouds} onChange={setClouds} min={0} max={9} />
                    <InputCell label="Precip" unit="mm" value={precip} onChange={setPrecip} step={0.1} min={0} />
                    <InputCell label="Sea Level P" unit="hPa" value={pressure} onChange={setPressure} step={0.1} />
                  </div>
                  {/* Quick presets */}
                  <div className="flex gap-1.5 flex-wrap mt-2 pt-2 border-t border-white/5">
                    {[
                      { label: "☀️ Clear", temp: 28, clouds: 1 },
                      { label: "🌧️ Rainy", temp: 14, clouds: 8 },
                      { label: "❄️ Winter", temp: 2, clouds: 6 },
                      { label: "🌤️ Mild", temp: 20, clouds: 3 },
                    ].map(p => (
                      <button key={p.label}
                        onClick={() => { setAirTemp(p.temp); setDewTemp(p.temp - 8); setClouds(p.clouds); }}
                        className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 transition">
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Collapsible.Content>
              </div>
            </Collapsible.Root>

            {/* Solar */}
            <Collapsible.Root open={showSolar} onOpenChange={setShowSolar}>
              <div className="glass p-4">
                <Collapsible.Trigger className="w-full flex items-center justify-between text-xs font-mono text-white/80 mb-1">
                  <span>☀️ Solar Irradiance <span className="text-white/40 text-[10px]">(auto from hour+season)</span></span>
                  <span className="text-white/40">{showSolar ? "▲" : "▼"}</span>
                </Collapsible.Trigger>
                <Collapsible.Content>
                  {night && <div className="mb-2"><NightChip /></div>}
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <InputCell label="GHI" unit="W/m²" value={ghi} onChange={setGhi} min={0} max={1200} disabled={night} />
                    <InputCell label="DNI" unit="W/m²" value={dni} onChange={setDni} min={0} max={1000} disabled={night} />
                    <InputCell label="DHI" unit="W/m²" value={dhi} onChange={setDhi} min={0} max={400} disabled={night} />
                  </div>
                </Collapsible.Content>
              </div>
            </Collapsible.Root>

            {error && (
              <div className="text-xs font-mono text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                ❌ {error}
              </div>
            )}

            <button
              onClick={handleRun}
              disabled={isLoading}
              className="w-full h-12 rounded-xl font-mono text-sm text-white relative overflow-hidden disabled:opacity-70 transition-all"
              style={{
                background: "linear-gradient(90deg, #00f5ff 0%, #6366f1 50%, #a855f7 100%)",
                boxShadow: "0 0 20px rgba(0,245,255,0.3)",
              }}
            >
              {isLoading
                ? <span className="animate-pulse">⏳ Computing… (30–60 sec, please wait)</span>
                : <span>⚡ Run Predictions</span>}
            </button>
          </>
        )}

        {/* ── PREDICTION RESULTS ── */}
        <AnimatePresence>
          {prediction && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              {/* Energy demand — fusion */}
              <div className="glass p-4 border-l-4 border-energy">
                <div className="text-[9px] tracking-[0.2em] text-energy font-mono mb-1">ENERGY DEMAND</div>
                <div className="text-3xl font-mono text-white">
                  <AnimatedNumber value={prediction.energy.fusion_prediction} />
                  <span className="text-base text-white/50 ml-1">kWh</span>
                </div>
                <div className="text-[10px] text-white/40 font-mono mt-0.5">
                  Fusion = 0.45 × XGB + 0.55 × ANN
                </div>

                {/* Per-model breakdown */}
                <div className="grid grid-cols-3 gap-1.5 mt-3">
                  {[
                    { label: "XGBoost", val: prediction.energy.xgb_prediction, active: prediction.energy.models_used.xgboost, color: "#64B5F6" },
                    { label: "ANN", val: prediction.energy.ann_prediction, active: prediction.energy.models_used.ann, color: "#CE93D8" },
                    { label: "Bayesian", val: prediction.energy.bayesian_prediction, active: prediction.energy.models_used.bayesian, color: "#FFB74D" },
                  ].map(m => (
                    <div key={m.label}
                      className="rounded-lg p-2 text-center border border-white/10 bg-white/5">
                      <div className="text-[9px] text-white/50 mb-0.5">{m.label}</div>
                      <div className="font-mono text-xs" style={{ color: m.active ? m.color : "#ffffff50" }}>
                        {m.val != null ? m.val.toFixed(1) : "—"}
                      </div>
                      <div className="text-[8px] text-white/30">kWh</div>
                    </div>
                  ))}
                </div>

                {/* Uncertainty / 95% CI bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-[9px] font-mono text-white/40 mb-1">
                    <span>95% CI: {prediction.energy.lower_bound.toFixed(1)}</span>
                    <span>Uncertainty Band</span>
                    <span>{prediction.energy.upper_bound.toFixed(1)} kWh</span>
                  </div>
                  <div className="relative h-2.5 rounded-full overflow-hidden"
                    style={{ background: "linear-gradient(90deg,#1e3a8a,#06b6d4,#facc15,#06b6d4,#1e3a8a)" }}>
                    {(() => {
                      const span = Math.max(0.0001, prediction.energy.upper_bound - prediction.energy.lower_bound);
                      const pos = Math.min(100, Math.max(0,
                        ((prediction.energy.fusion_prediction - prediction.energy.lower_bound) / span) * 100));
                      return (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_8px_white]"
                          style={{ left: `${pos}%` }}
                        />
                      );
                    })()}
                  </div>
                  <div className="text-[9px] font-mono text-white/30 text-center mt-1">
                    Width: ±{((prediction.energy.upper_bound - prediction.energy.lower_bound) / 2).toFixed(1)} kWh
                  </div>
                </div>
              </div>

              {/* Solar output */}
              <div className="glass p-4 border-l-4 border-yellow-400 relative overflow-hidden">
                <div className="text-[9px] tracking-[0.2em] text-yellow-400 font-mono mb-1">SOLAR OUTPUT</div>
                <div className="text-3xl font-mono text-white">
                  <AnimatedNumber value={prediction.solar.solar_output_kwh} />
                  <span className="text-base text-white/50 ml-1">kWh</span>
                </div>
                <div className="text-[10px] text-white/40 font-mono mt-0.5">
                  XGBoost Solar Model {prediction.solar.model_used ? "✓" : "✗"}
                </div>
                {prediction.solar.solar_output_kwh === 0 && (
                  <div className="text-[10px] text-white/40 font-mono mt-1">🌙 No solar generation at this hour</div>
                )}
                <div className="absolute -right-3 -top-3 opacity-15 pointer-events-none">
                  <svg width="70" height="70" viewBox="0 0 80 80" className="spin-slow">
                    <circle cx="40" cy="40" r="14" fill="#facc15" />
                    {Array.from({ length: 8 }).map((_, i) => (
                      <line key={i} x1="40" y1="40" x2="40" y2="10"
                        stroke="#facc15" strokeWidth="2.5" strokeLinecap="round"
                        transform={`rotate(${i * 45} 40 40)`} />
                    ))}
                  </svg>
                </div>
              </div>

              {/* Net demand */}
              <div className={`glass p-4 border-l-4 ${prediction.is_surplus ? "border-green-400" : "border-red-400"}`}>
                <div className={`text-[9px] tracking-[0.2em] font-mono mb-1 ${prediction.is_surplus ? "text-green-400" : "text-red-400"}`}>
                  {prediction.is_surplus ? "⚡ SOLAR SURPLUS — Exporting to Grid" : "🔌 NET GRID IMPORT"}
                </div>
                <div className="text-2xl font-mono text-white">
                  <AnimatedNumber value={Math.abs(prediction.net_consumption_kwh)} />
                  <span className="text-sm text-white/50 ml-1">
                    kWh {prediction.is_surplus ? "exported" : "from grid"}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-white/40 mt-1">
                  {prediction.energy.fusion_prediction.toFixed(1)} demand − {prediction.solar.solar_output_kwh.toFixed(1)} solar = {prediction.net_consumption_kwh.toFixed(1)} kWh
                </div>
              </div>

              {/* Chart */}
              <div className="glass p-4">
                <div className="text-[9px] tracking-[0.2em] text-white/50 font-mono mb-2">MODEL COMPARISON</div>
                <ResultsChart result={prediction} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
