# EnergyOracle — Complete Frontend Reference Guide

> **Backend is live at:** `http://localhost:8000`
> **API Docs (Swagger UI):** `http://localhost:8000/docs`
> **CORS allowed origins:** `localhost:5173`, `localhost:3000`, `localhost:8080`

---

## 1. BACKEND STARTUP

Every time you work, start the backend first:

```bash
cd /Users/ananyanarayani/Library/energy_demand/presentation/project/EnergyOracle/backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Wait ~90 seconds for it to finish loading 26M rows and index 1,512 buildings.
You'll see: `EnergyOracle API ready! Docs at http://localhost:8000/docs`

---

## 2. ALL API ENDPOINTS

### Base URL: `http://localhost:8000`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Root — welcome message |
| `GET` | `/health` | Health check + loaded models list |
| `GET` | `/api/buildings` | List all 1,512 buildings |
| `GET` | `/api/buildings?site_id=Bear` | Filter by site |
| `GET` | `/api/buildings?limit=50` | Limit results |
| `GET` | `/api/buildings/{building_id}` | Single building + historical stats |
| `POST` | `/api/predict/energy` | Energy demand only |
| `POST` | `/api/predict/solar` | Solar output only |
| `POST` | `/api/predict/combined` | **PRIMARY** — both together |

---

## 3. ENDPOINT DETAILS & EXACT SCHEMAS

---

### GET `/health`

**Response:**
```json
{
  "status": "ok",
  "models_loaded": ["xgb_energy", "ann_energy", "bayesian", "xgb_solar", "scaler_energy", "label_encoders"],
  "models_count": 6,
  "buildings_indexed": 1512
}
```

---

### GET `/api/buildings`

**Query params:**
- `site_id` (optional string) — filter by site name e.g. `Bear`
- `limit` (optional int) — cap number of results

**Response — Array of BuildingResponse:**
```json
[
  {
    "building_id": "Bear_assembly_Angel",
    "site_id": "Bear",
    "lat": 37.8719,
    "lon": -122.2607,
    "floor_area": 22117.0,
    "primary_space_usage": "Entertainment/public assembly",
    "year_built": 1933,
    "number_of_floors": 6,
    "timezone": "US/Pacific"
  }
]
```

**Field descriptions:**
| Field | Type | Notes |
|-------|------|-------|
| `building_id` | string | Format: `{Site}_{usagetype}_{Name}` e.g. `Bear_assembly_Angel` |
| `site_id` | string | One of 18 site names (see Section 5) |
| `lat` | float | Latitude from parquet data |
| `lon` | float | Longitude from parquet data |
| `floor_area` | float | Square metres (sqm) |
| `primary_space_usage` | string | One of 16 categories (see Section 6) |
| `year_built` | int | Year of construction |
| `number_of_floors` | int | Storeys |
| `timezone` | string | e.g. `US/Pacific`, `US/Eastern`, `Europe/London` |

---

### GET `/api/buildings/{building_id}`

**Example:** `GET /api/buildings/Bear_assembly_Angel`

**Response — BuildingDetailResponse:**
```json
{
  "building_id": "Bear_assembly_Angel",
  "site_id": "Bear",
  "lat": 37.8719,
  "lon": -122.2607,
  "floor_area": 22117.0,
  "primary_space_usage": "Entertainment/public assembly",
  "year_built": 1933,
  "number_of_floors": 6,
  "timezone": "US/Pacific",
  "mean_consumption": 446.87,
  "peak_consumption": 1105.6,
  "min_consumption": 36.5,
  "record_count": 17376,
  "available_years": [2016, 2017]
}
```

**Extra fields:**
| Field | Type | Notes |
|-------|------|-------|
| `mean_consumption` | float | Average hourly electricity in kWh |
| `peak_consumption` | float | Maximum hourly electricity in kWh |
| `min_consumption` | float | Minimum hourly electricity in kWh |
| `record_count` | int | Total hourly records in dataset |
| `available_years` | int[] | Years with data — always `[2016, 2017]` |

---

### POST `/api/predict/combined` ⭐ PRIMARY ENDPOINT

**Request Body:**
```json
{
  "building_id": "Bear_assembly_Angel",
  "hour": 12,
  "day": 15,
  "month": 6,
  "year": 2017,
  "weather": {
    "air_temperature": 25.0,
    "dew_temperature": 15.0,
    "wind_speed": 4.5,
    "wind_direction": 180.0,
    "cloud_coverage": 2.0,
    "precip_depth_1_hr": 0.0,
    "sea_level_pressure": 1013.0
  },
  "solar": {
    "GHI": 800.0,
    "DNI": 600.0,
    "DHI": 150.0
  }
}
```

**Request field constraints:**
| Field | Type | Range | Default | Unit |
|-------|------|-------|---------|------|
| `building_id` | string | any valid id | required | — |
| `hour` | int | 0–23 | required | hour of day |
| `day` | int | 1–31 | required | day of month |
| `month` | int | 1–12 | required | month |
| `year` | int | any | 2017 | year |
| `air_temperature` | float | -40 to 50 | 20.0 | °C |
| `dew_temperature` | float | -40 to 30 | 10.0 | °C |
| `wind_speed` | float | 0–50 | 3.0 | m/s |
| `wind_direction` | float | 0–360 | 180.0 | degrees |
| `cloud_coverage` | float | 0–8 | 4.0 | oktas |
| `precip_depth_1_hr` | float | 0–200 | 0.0 | mm |
| `sea_level_pressure` | float | 950–1050 | 1013.0 | hPa |
| `GHI` | float | 0–1200 | 500.0 | W/m² |
| `DNI` | float | 0–1000 | 400.0 | W/m² |
| `DHI` | float | 0–400 | 100.0 | W/m² |

**Response:**
```json
{
  "building_id": "Bear_assembly_Angel",
  "hour": 12,
  "day": 15,
  "month": 6,
  "year": 2017,
  "energy": {
    "xgb_prediction": 265.6132,
    "ann_prediction": 389.794,
    "fusion_prediction": 333.9127,
    "bayesian_prediction": 364.1318,
    "lower_bound": 319.8034,
    "upper_bound": 408.4603,
    "confidence_level": 0.95,
    "models_used": {
      "xgboost": true,
      "ann": true,
      "bayesian": true
    }
  },
  "solar": {
    "solar_output_kw": 88.0015,
    "solar_output_kwh": 88.0015,
    "model_used": true
  },
  "net_consumption_kwh": 245.9112,
  "is_surplus": false
}
```

**Response field descriptions:**
| Field | Type | Meaning |
|-------|------|---------|
| `energy.xgb_prediction` | float | XGBoost model prediction (kWh) |
| `energy.ann_prediction` | float | Neural network prediction (kWh) |
| `energy.fusion_prediction` | float | Weighted blend: 45% XGB + 55% ANN (kWh) |
| `energy.bayesian_prediction` | float | Bayesian meta-model refining fusion (kWh) |
| `energy.lower_bound` | float | 95% confidence interval lower (kWh) |
| `energy.upper_bound` | float | 95% confidence interval upper (kWh) |
| `energy.confidence_level` | float | Always 0.95 |
| `energy.models_used.xgboost` | bool | Whether XGB contributed |
| `energy.models_used.ann` | bool | Whether ANN contributed |
| `energy.models_used.bayesian` | bool | Whether Bayesian contributed |
| `solar.solar_output_kw` | float | Predicted solar power (kW) |
| `solar.solar_output_kwh` | float | Same value — energy per hour (kWh) |
| `solar.model_used` | bool | Whether solar model loaded |
| `net_consumption_kwh` | float | `fusion_prediction - solar_output_kwh` |
| `is_surplus` | bool | `true` if solar > energy demand |

---

### POST `/api/predict/energy`

Same `weather` + `building_id` + timestamp fields, no `solar` field needed.

**Response:**
```json
{
  "building_id": "...",
  "hour": 12, "day": 15, "month": 6, "year": 2017,
  "xgb_prediction": 265.6,
  "ann_prediction": 389.8,
  "fusion_prediction": 333.9,
  "bayesian_prediction": 364.1,
  "lower_bound": 319.8,
  "upper_bound": 408.5,
  "confidence_level": 0.95,
  "models_used": { "xgboost": true, "ann": true, "bayesian": true }
}
```

---

### POST `/api/predict/solar`

Needs `building_id` + timestamp + `weather` + `solar` (GHI/DNI/DHI).

**Response:**
```json
{
  "building_id": "...",
  "hour": 12, "day": 15, "month": 6, "year": 2017,
  "solar_output_kw": 88.0,
  "solar_output_kwh": 88.0,
  "model_used": true
}
```

---

## 4. JAVASCRIPT FETCH EXAMPLES

### Fetch all buildings:
```javascript
const res = await fetch('http://localhost:8000/api/buildings');
const buildings = await res.json();
// buildings is an array of 1512 objects
```

### Fetch buildings for one site:
```javascript
const res = await fetch('http://localhost:8000/api/buildings?site_id=Bear');
const buildings = await res.json();
```

### Run combined prediction:
```javascript
const predict = async (buildingId, hour, day, month, year, weather, solar) => {
  const res = await fetch('http://localhost:8000/api/predict/combined', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      building_id: buildingId,
      hour, day, month, year,
      weather: {
        air_temperature: weather.temp ?? 20,
        dew_temperature: weather.dewPoint ?? 10,
        wind_speed: weather.windSpeed ?? 3,
        wind_direction: weather.windDir ?? 180,
        cloud_coverage: weather.clouds ?? 4,
        precip_depth_1_hr: weather.rain ?? 0,
        sea_level_pressure: weather.pressure ?? 1013
      },
      solar: {
        GHI: solar.ghi ?? 500,
        DNI: solar.dni ?? 400,
        DHI: solar.dhi ?? 100
      }
    })
  });
  return res.json();
};
```

### Confidence interval band values:
```javascript
// From response, to draw uncertainty band:
const lower = data.energy.lower_bound;       // e.g. 319.8
const upper = data.energy.upper_bound;       // e.g. 408.5
const best  = data.energy.fusion_prediction; // e.g. 333.9
```

---

## 5. SITES — 18 BDG2 SITES

| Site | City | Buildings | Lat | Lon |
|------|------|-----------|-----|-----|
| Bear | Seattle, WA | 92 | 47.6062 | -122.3321 |
| Bobcat | Austin, TX | 28 | 30.2672 | -97.7431 |
| Bull | Dallas, TX | 123 | 32.7767 | -96.7970 |
| Cockatoo | Sydney, AU | 117 | -33.8688 | 151.2093 |
| Crow | Chicago, IL | 5 | 41.8781 | -87.6298 |
| Eagle | Boise, ID | 103 | 43.6150 | -116.2023 |
| Fox | Berkeley, CA | 135 | 37.8716 | -122.2727 |
| Gator | Houston, TX | 73 | 29.7604 | -95.3698 |
| Hog | Charlotte, NC | 152 | 35.2271 | -80.8431 |
| Lamb | Philadelphia, PA | 145 | 39.9526 | -75.1652 |
| Moose | Anchorage, AK | 12 | 61.2181 | -149.9003 |
| Mouse | Washington, DC | 7 | 38.9072 | -77.0369 |
| Panther | Miami, FL | 105 | 25.7617 | -80.1918 |
| Peacock | Los Angeles, CA | 36 | 34.0522 | -118.2437 |
| Rat | Boston, MA | 282 | 42.3601 | -71.0589 |
| Robin | Phoenix, AZ | 52 | 33.4484 | -112.0740 |
| Shrew | Denver, CO | 9 | 39.7392 | -104.9903 |
| Wolf | Minneapolis, MN | 36 | 44.9778 | -93.2650 |

---

## 6. BUILDING USAGE TYPES (16 categories)

```
Education
Entertainment/public assembly
Food sales and service
Healthcare
Lodging/residential
Manufacturing/industrial
Office
Other
Parking
Public services
Religious worship
Retail
Services
Technology/science
Utility
Warehouse/storage
```

---

## 7. BUILDING_ID FORMAT

Building IDs follow this pattern:
```
{Site}_{usagetype}_{PersonName}
```

Examples:
- `Bear_assembly_Angel` → Site: Bear, Type: assembly, Name: Angel
- `Fox_office_Marcus` → Site: Fox, Type: office, Name: Marcus
- `Rat_education_Smith` → Site: Rat, Type: education, Name: Smith

You can extract parts like:
```javascript
const [site, type, name] = building_id.split('_');
```

---

## 8. TYPICAL VALUE RANGES (for UI scaling)

From live data on `Bear_assembly_Angel`:

| Metric | Typical Low | Typical High | Unit |
|--------|-------------|--------------|------|
| Energy demand (small building) | 5 | 200 | kWh |
| Energy demand (large building) | 100 | 1500 | kWh |
| Solar output | 0 (night) | 200 | kWh |
| Net consumption | -100 (surplus) | 1500 | kWh |
| Confidence interval width | ±10% | ±30% | of prediction |
| Floor area | 100 | 100,000 | m² |

> **Night hours (0–5, 20–23):** Solar GHI/DNI/DHI should be 0 → solar_output_kwh will be ~0

---

## 9. RECOMMENDED UI STATE SHAPE (React/Vue example)

```javascript
// Suggested global state
const state = {
  // Building selection
  selectedBuilding: null,       // full building object from /api/buildings/{id}
  buildingsList: [],            // all 1512 buildings

  // Time controls
  hour: 12,                     // 0-23
  day: 15,                      // 1-31
  month: 6,                     // 1-12
  year: 2017,                   // 2016 or 2017 (data range)

  // Weather inputs
  weather: {
    air_temperature: 20,
    dew_temperature: 10,
    wind_speed: 3,
    wind_direction: 180,
    cloud_coverage: 4,
    precip_depth_1_hr: 0,
    sea_level_pressure: 1013
  },

  // Solar inputs
  solar: {
    GHI: 500,
    DNI: 400,
    DHI: 100
  },

  // Prediction result
  prediction: null,             // full /api/predict/combined response
  loading: false,
  error: null,

  // Filter
  siteFilter: null,             // 'Bear', 'Fox', etc. or null for all
};
```

---

## 10. USEFUL METADATA FOR MAP/GLOBE VIEWS

Each building has `lat` and `lon`. Use these for:
- Globe markers (CesiumJS, MapboxGL, Leaflet, deck.gl)
- Colour-code by `primary_space_usage` category
- Size markers by `floor_area`
- On hover/click: show `mean_consumption`, `peak_consumption`

**Colour palette suggestion for usage types:**
```javascript
const USAGE_COLORS = {
  'Education':                    '#4FC3F7',  // light blue
  'Entertainment/public assembly':'#FFB74D',  // amber
  'Food sales and service':       '#81C784',  // green
  'Healthcare':                   '#F06292',  // pink
  'Lodging/residential':          '#CE93D8',  // purple
  'Manufacturing/industrial':     '#FF8A65',  // deep orange
  'Office':                       '#64B5F6',  // blue
  'Other':                        '#90A4AE',  // grey
  'Parking':                      '#B0BEC5',  // light grey
  'Public services':              '#4DB6AC',  // teal
  'Religious worship':            '#FFD54F',  // yellow
  'Retail':                       '#E57373',  // red
  'Services':                     '#AED581',  // light green
  'Technology/science':           '#4DD0E1',  // cyan
  'Utility':                      '#78909C',  // blue grey
  'Warehouse/storage':            '#A1887F',  // brown
};
```

---

## 11. WEATHER DEFAULTS BY MONTH (for slider presets)

```javascript
const MONTHLY_WEATHER_DEFAULTS = {
  1:  { air_temperature: 2,  cloud_coverage: 5, GHI: 200, DNI: 150, DHI: 60  },  // Jan
  2:  { air_temperature: 4,  cloud_coverage: 5, GHI: 280, DNI: 200, DHI: 80  },  // Feb
  3:  { air_temperature: 9,  cloud_coverage: 4, GHI: 400, DNI: 300, DHI: 100 },  // Mar
  4:  { air_temperature: 14, cloud_coverage: 4, GHI: 520, DNI: 380, DHI: 120 },  // Apr
  5:  { air_temperature: 19, cloud_coverage: 3, GHI: 620, DNI: 480, DHI: 130 },  // May
  6:  { air_temperature: 24, cloud_coverage: 2, GHI: 750, DNI: 580, DHI: 140 },  // Jun
  7:  { air_temperature: 27, cloud_coverage: 2, GHI: 800, DNI: 620, DHI: 140 },  // Jul
  8:  { air_temperature: 26, cloud_coverage: 2, GHI: 720, DNI: 560, DHI: 130 },  // Aug
  9:  { air_temperature: 21, cloud_coverage: 3, GHI: 560, DNI: 420, DHI: 120 },  // Sep
  10: { air_temperature: 15, cloud_coverage: 4, GHI: 380, DNI: 280, DHI: 100 },  // Oct
  11: { air_temperature: 8,  cloud_coverage: 5, GHI: 220, DNI: 160, DHI: 70  },  // Nov
  12: { air_temperature: 3,  cloud_coverage: 6, GHI: 170, DNI: 120, DHI: 55  },  // Dec
};

// Night hours → zero out solar
const getSolar = (hour, month) => {
  if (hour < 6 || hour > 19) return { GHI: 0, DNI: 0, DHI: 0 };
  const base = MONTHLY_WEATHER_DEFAULTS[month];
  // Scale by hour: peak at noon
  const factor = Math.sin(Math.PI * (hour - 6) / 14);
  return {
    GHI: Math.round(base.GHI * factor),
    DNI: Math.round(base.DNI * factor),
    DHI: Math.round(base.DHI * factor),
  };
};
```

---

## 12. ERROR HANDLING

The API **never crashes** — all errors return clean JSON HTTP errors.

| HTTP Code | Meaning | When |
|-----------|---------|------|
| `200` | Success | Normal response |
| `404` | Not Found | `building_id` does not exist |
| `422` | Validation Error | Bad input (e.g. hour=25) |
| `500` | Server Error | Unexpected bug (check backend logs) |

**Error response shape:**
```json
{
  "detail": "Building 'abc' not found"
}
```

If a model is missing, predictions gracefully return `0.0` — never a 500 error.

---

## 13. PERFORMANCE NOTES

- `/api/buildings` — fast (~50ms), cached after first call
- `/api/buildings/{id}` — moderate (~200ms), scans 26M rows per building
- `/api/predict/combined` — moderate (~500ms–2s), runs 3 ML models
- First request after startup is slowest; subsequent are faster

> **Tip:** Pre-fetch all buildings at app load. Cache building detail and prediction results per building+timestamp to avoid redundant calls.

---

## 14. RECOMMENDED FRONTEND FEATURES

### Must-Have
- [ ] Building selector (searchable dropdown or list panel) — 1,512 buildings
- [ ] Site filter tabs/pills (18 sites)
- [ ] Hour slider (0–23, labeled AM/PM)
- [ ] Month picker (1–12)
- [ ] Energy demand gauge or bar (kWh)
- [ ] Solar output display (kWh)
- [ ] Net consumption result (positive = consuming, negative = surplus)
- [ ] Confidence interval visualization (shaded range)
- [ ] "Which models were used" indicator badges

### Nice-to-Have
- [ ] Map/globe with all 1,512 buildings plotted by lat/lon
- [ ] Weather sliders (temperature, cloud coverage)
- [ ] Day slider (1–31)
- [ ] Year toggle (2016 / 2017)
- [ ] Building detail panel (floor area, year built, usage type, mean/peak consumption)
- [ ] Usage type filter (16 categories)
- [ ] Animated time-of-day sweep (loop hour 0→23)
- [ ] Comparison mode (two buildings side by side)

---

## 15. QUICK START CHECKLIST

1. ✅ Start backend: `python3 -m uvicorn main:app --host 0.0.0.0 --port 8000`
2. ✅ Verify: `curl http://localhost:8000/health`
3. ✅ Load buildings: `GET /api/buildings`
4. ✅ Pick a building (e.g. `Bear_assembly_Angel`)
5. ✅ Run prediction: `POST /api/predict/combined`
6. ✅ Read `energy.fusion_prediction` for demand, `solar.solar_output_kwh` for generation
7. ✅ Show `net_consumption_kwh` — positive means building is a net consumer, negative means surplus
8. ✅ Show confidence band: `energy.lower_bound` to `energy.upper_bound`
