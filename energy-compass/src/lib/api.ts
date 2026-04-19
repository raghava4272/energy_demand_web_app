import axios from "axios";

// Backend always runs on port 8000
// CORS is open (allow_origins=["*"]) so this works from any frontend port
export const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000,  // 120s — predictions take ~45-60s (26M row parquet scan)
});

// ── Building types ─────────────────────────────────────────────────────────
export type Building = {
  building_id: string;
  site_id: string;
  lat: number;
  lon: number;
  floor_area: number;
  primary_space_usage: string;
  year_built: number | null;
  number_of_floors: number | null;
  timezone: string;
};

// Full detail returned by GET /api/buildings/{id}
export type BuildingDetail = Building & {
  mean_consumption: number;
  peak_consumption: number;
  min_consumption: number;
  record_count: number;
  available_years: number[];
};

// ── Weather / Solar inputs ─────────────────────────────────────────────────
export type WeatherInput = {
  air_temperature: number;
  dew_temperature: number;
  wind_speed: number;
  wind_direction: number;
  cloud_coverage: number;
  precip_depth_1_hr: number;
  sea_level_pressure: number;
};

export type SolarInput = { GHI: number; DNI: number; DHI: number };

// ── Prediction result — must match backend /api/predict/combined response ──
export type PredictionResult = {
  building_id: string;
  hour: number;
  day: number;
  month: number;
  year: number;
  energy: {
    xgb_prediction: number;
    ann_prediction: number;
    fusion_prediction: number;
    bayesian_prediction: number;
    lower_bound: number;
    upper_bound: number;
    confidence_level: number;
    models_used: {
      xgboost: boolean;
      ann: boolean;
      bayesian: boolean;
    };
  };
  solar: {
    solar_output_kw: number;
    solar_output_kwh: number;
    model_used: boolean;
  };
  net_consumption_kwh: number;
  is_surplus: boolean;
};

// ── API functions ──────────────────────────────────────────────────────────
export const fetchBuildings = async (siteId?: string): Promise<Building[]> => {
  const r = await api.get("/api/buildings", {
    params: siteId ? { site_id: siteId } : {},
  });
  return r.data;
};

export const fetchBuilding = async (id: string): Promise<BuildingDetail> => {
  const r = await api.get(`/api/buildings/${encodeURIComponent(id)}`);
  return r.data;
};

export const ping = async (): Promise<boolean> => {
  try {
    await api.get("/health", { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
};

export const runCombinedPrediction = async (body: {
  building_id: string;
  hour: number;
  day: number;
  month: number;
  year: number;
  weather: WeatherInput;
  solar: SolarInput;
}): Promise<PredictionResult> => {
  const r = await api.post("/api/predict/combined", body);
  return r.data;
};
