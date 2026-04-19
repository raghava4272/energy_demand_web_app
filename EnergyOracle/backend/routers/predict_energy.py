"""
Energy Prediction Router — POST /api/predict/energy

Accepts building info + weather conditions, returns multi-model
energy demand predictions with confidence intervals.
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from utils.feature_builder import build_energy_features
from services.energy_service import predict_energy

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


class EnergyPredictRequest(BaseModel):
    building_id: str
    hour: int = Field(ge=0, le=23)
    day: int = Field(ge=1, le=31)
    month: int = Field(ge=1, le=12)
    year: int = Field(default=2017)
    weather: WeatherInput = WeatherInput()


# ─────────────────────────────────────────────
# Response Schema
# ─────────────────────────────────────────────

class ModelsUsed(BaseModel):
    xgboost: bool = False
    ann: bool = False
    bayesian: bool = False


class EnergyPredictResponse(BaseModel):
    building_id: str
    hour: int
    day: int
    month: int
    year: int
    xgb_prediction: float = 0.0
    ann_prediction: float = 0.0
    fusion_prediction: float = 0.0
    bayesian_prediction: float = 0.0
    lower_bound: float = 0.0
    upper_bound: float = 0.0
    confidence_level: float = 0.95
    models_used: ModelsUsed = ModelsUsed()


# ─────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────

@router.post("/predict/energy", response_model=EnergyPredictResponse)
async def predict_energy_endpoint(request: Request, body: EnergyPredictRequest):
    """
    Predict energy demand for a building at a specific hour.

    Uses XGBoost, ANN, fusion, and Bayesian meta-model predictions
    with 95% confidence intervals.
    """
    parquet = request.app.state.parquet
    models = request.app.state.models

    # Get building metadata
    meta = parquet.get_building_meta(body.building_id)

    # Also get solar metadata if available
    solar_meta = parquet.get_solar_meta(body.building_id)
    meta["solar_meta"] = solar_meta

    # Build features
    features = build_energy_features(
        building_id=body.building_id,
        hour=body.hour,
        day=body.day,
        month=body.month,
        year=body.year,
        weather=body.weather.model_dump(),
        meta=meta,
        models=models,
    )

    # Run prediction pipeline
    result = predict_energy(features, models)

    return EnergyPredictResponse(
        building_id=body.building_id,
        hour=body.hour,
        day=body.day,
        month=body.month,
        year=body.year,
        xgb_prediction=result["xgb_prediction"],
        ann_prediction=result["ann_prediction"],
        fusion_prediction=result["fusion_prediction"],
        bayesian_prediction=result["bayesian_prediction"],
        lower_bound=result["lower_bound"],
        upper_bound=result["upper_bound"],
        confidence_level=result["confidence_level"],
        models_used=ModelsUsed(**result["models_used"]),
    )
