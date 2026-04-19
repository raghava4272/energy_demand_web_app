"""
Solar Prediction Router — POST /api/predict/solar

Accepts building info + solar irradiance + weather conditions,
returns predicted solar output in kW and kWh.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from utils.feature_builder import build_solar_features
from services.solar_service import predict_solar

router = APIRouter(tags=["Predictions"])


# ─────────────────────────────────────────────
# Request Schemas
# ─────────────────────────────────────────────

class WeatherInput(BaseModel):
    air_temperature: float = Field(default=20.0, description="°C")
    dew_temperature: float = Field(default=10.0, description="°C")
    wind_speed: float = Field(default=3.0, description="m/s")
    wind_direction: float = Field(default=180.0, description="degrees")
    cloud_coverage: float = Field(default=4.0, description="oktas 0-8")
    precip_depth_1_hr: float = Field(default=0.0, description="mm")
    sea_level_pressure: float = Field(default=1013.0, description="hPa")


class SolarInput(BaseModel):
    GHI: float = Field(default=500.0, description="Global Horizontal Irradiance (W/m²)")
    DNI: float = Field(default=400.0, description="Direct Normal Irradiance (W/m²)")
    DHI: float = Field(default=100.0, description="Diffuse Horizontal Irradiance (W/m²)")


class SolarPredictRequest(BaseModel):
    building_id: str
    hour: int = Field(ge=0, le=23)
    day: int = Field(ge=1, le=31)
    month: int = Field(ge=1, le=12)
    year: int = Field(default=2017)
    solar: SolarInput = SolarInput()
    weather: WeatherInput = WeatherInput()


# ─────────────────────────────────────────────
# Response Schema
# ─────────────────────────────────────────────

class SolarPredictResponse(BaseModel):
    building_id: str
    hour: int
    day: int
    month: int
    year: int
    solar_output_kw: float = 0.0
    solar_output_kwh: float = 0.0
    model_used: bool = False


# ─────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────

@router.post("/predict/solar", response_model=SolarPredictResponse)
async def predict_solar_endpoint(request: Request, body: SolarPredictRequest):
    """
    Predict solar output for a building at a specific hour.

    Uses the XGBoost solar model with 34 irradiance, geometry,
    and building features.
    """
    parquet = request.app.state.parquet
    models = request.app.state.models

    # Get building metadata
    meta = parquet.get_building_meta(body.building_id)

    # Also get solar-specific metadata (roof area, panels, etc.)
    solar_meta = parquet.get_solar_meta(body.building_id)
    meta["solar_meta"] = solar_meta

    # Build features
    features_df = build_solar_features(
        building_id=body.building_id,
        hour=body.hour,
        day=body.day,
        month=body.month,
        year=body.year,
        solar=body.solar.model_dump(),
        weather=body.weather.model_dump(),
        meta=meta,
        models=models,
    )

    # Run prediction
    result = predict_solar(features_df, models)

    return SolarPredictResponse(
        building_id=body.building_id,
        hour=body.hour,
        day=body.day,
        month=body.month,
        year=body.year,
        solar_output_kw=result["solar_output_kw"],
        solar_output_kwh=result["solar_output_kwh"],
        model_used=result["model_used"],
    )
