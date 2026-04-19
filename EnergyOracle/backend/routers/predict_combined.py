"""
Combined Prediction Router — POST /api/predict/combined

PRIMARY ENDPOINT: Runs both energy demand and solar output predictions,
computes net consumption, and returns the complete response.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from utils.feature_builder import build_energy_features, build_solar_features
from services.energy_service import predict_energy
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


class CombinedPredictRequest(BaseModel):
    building_id: str
    hour: int = Field(ge=0, le=23)
    day: int = Field(ge=1, le=31)
    month: int = Field(ge=1, le=12)
    year: int = Field(default=2017)
    weather: WeatherInput = WeatherInput()
    solar: SolarInput = SolarInput()


# ─────────────────────────────────────────────
# Response Schemas
# ─────────────────────────────────────────────

class ModelsUsed(BaseModel):
    xgboost: bool = False
    ann: bool = False
    bayesian: bool = False


class EnergyResult(BaseModel):
    xgb_prediction: float = 0.0
    ann_prediction: float = 0.0
    fusion_prediction: float = 0.0
    bayesian_prediction: float = 0.0
    lower_bound: float = 0.0
    upper_bound: float = 0.0
    confidence_level: float = 0.95
    models_used: ModelsUsed = ModelsUsed()


class SolarResult(BaseModel):
    solar_output_kw: float = 0.0
    solar_output_kwh: float = 0.0
    model_used: bool = False


class CombinedPredictResponse(BaseModel):
    building_id: str
    hour: int
    day: int
    month: int
    year: int
    energy: EnergyResult
    solar: SolarResult
    net_consumption_kwh: float = 0.0
    is_surplus: bool = False


# ─────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────

@router.post("/predict/combined", response_model=CombinedPredictResponse)
async def predict_combined_endpoint(request: Request, body: CombinedPredictRequest):
    """
    Combined energy demand + solar output prediction.

    This is the PRIMARY endpoint for the frontend.
    Returns energy demand predictions (multi-model with confidence intervals),
    solar output, net consumption, and whether the building has a solar surplus.
    """
    parquet = request.app.state.parquet
    models = request.app.state.models

    # Get building metadata
    meta = parquet.get_building_meta(body.building_id)

    # Also get solar-specific metadata (roof area, panels, etc.)
    solar_meta_data = parquet.get_solar_meta(body.building_id)
    meta["solar_meta"] = solar_meta_data

    weather_dict = body.weather.model_dump()
    solar_dict = body.solar.model_dump()

    # ── Energy prediction ──
    energy_features = build_energy_features(
        building_id=body.building_id,
        hour=body.hour,
        day=body.day,
        month=body.month,
        year=body.year,
        weather=weather_dict,
        meta=meta,
        models=models,
    )
    energy_result = predict_energy(energy_features, models)

    # ── Solar prediction ──
    solar_features = build_solar_features(
        building_id=body.building_id,
        hour=body.hour,
        day=body.day,
        month=body.month,
        year=body.year,
        solar=solar_dict,
        weather=weather_dict,
        meta=meta,
        models=models,
    )
    solar_result = predict_solar(solar_features, models)

    # ── Net consumption ──
    net = energy_result["fusion_prediction"] - solar_result["solar_output_kwh"]
    is_surplus = solar_result["solar_output_kwh"] > energy_result["fusion_prediction"]

    return CombinedPredictResponse(
        building_id=body.building_id,
        hour=body.hour,
        day=body.day,
        month=body.month,
        year=body.year,
        energy=EnergyResult(
            xgb_prediction=energy_result["xgb_prediction"],
            ann_prediction=energy_result["ann_prediction"],
            fusion_prediction=energy_result["fusion_prediction"],
            bayesian_prediction=energy_result["bayesian_prediction"],
            lower_bound=energy_result["lower_bound"],
            upper_bound=energy_result["upper_bound"],
            confidence_level=energy_result["confidence_level"],
            models_used=ModelsUsed(**energy_result["models_used"]),
        ),
        solar=SolarResult(
            solar_output_kw=solar_result["solar_output_kw"],
            solar_output_kwh=solar_result["solar_output_kwh"],
            model_used=solar_result["model_used"],
        ),
        net_consumption_kwh=round(net, 4),
        is_surplus=is_surplus,
    )
