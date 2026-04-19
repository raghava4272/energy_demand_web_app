"""
Feature Builder — constructs model-ready feature DataFrames from raw inputs.

Builds features for:
  - Energy demand models (XGBoost 48-feature, ANN 43-feature)
  - Solar output model (XGBoost 34-feature)
"""

import math
import logging
from datetime import datetime

import numpy as np
import pandas as pd

from configs.feature_lists import (
    XGB_ENERGY_FEATURES,
    ANN_ENERGY_FEATURES,
    SOLAR_FEATURES,
    CATEGORICAL_COLS,
)

logger = logging.getLogger(__name__)


def _safe_float(value, default: float = 0.0) -> float:
    """Convert value to float, returning default if value is None or NaN."""
    if value is None:
        return default
    try:
        result = float(value)
        return result if result == result else default  # NaN check
    except (TypeError, ValueError):
        return default


def _meta_float(meta: dict, *keys, default: float = 0.0) -> float:
    """Try multiple keys from meta dict, returning first valid float found."""
    for key in keys:
        val = meta.get(key)
        if val is not None:
            try:
                result = float(val)
                if result == result:  # not NaN
                    return result
            except (TypeError, ValueError):
                continue
    return default


# ═══════════════════════════════════════════════
# ENERGY FEATURES
# ═══════════════════════════════════════════════

def build_energy_features(
    building_id: str,
    hour: int,
    day: int,
    month: int,
    year: int,
    weather: dict,
    meta: dict,
    models: dict,
) -> dict:
    """
    Build feature DataFrames for both XGBoost and ANN energy models.

    Returns a dict with:
      "xgb_features": pd.DataFrame with XGB_ENERGY_FEATURES columns
      "ann_features": pd.DataFrame with ANN_ENERGY_FEATURES columns (scaled)
    """
    try:
        dt = datetime(year, month, day, hour)
    except (ValueError, OverflowError):
        dt = datetime(2017, 1, 1, 12)

    day_of_year = dt.timetuple().tm_yday
    day_of_week = dt.weekday()
    week_of_year = dt.isocalendar()[1]
    is_weekend = 1 if day_of_week >= 5 else 0

    # Time cyclical features
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)
    dayofweek_sin = math.sin(2 * math.pi * day_of_week / 7)
    dayofweek_cos = math.cos(2 * math.pi * day_of_week / 7)
    month_sin = math.sin(2 * math.pi * month / 12)
    month_cos = math.cos(2 * math.pi * month / 12)

    # Weather
    air_temp = weather.get("air_temperature", 20.0)
    dew_temp = weather.get("dew_temperature", 10.0)
    wind_speed = weather.get("wind_speed", 3.0)
    wind_dir = weather.get("wind_direction", 180.0)
    cloud_cov = weather.get("cloud_coverage", 4.0)
    precip = weather.get("precip_depth_1_hr", 0.0)
    sea_pressure = weather.get("sea_level_pressure", 1013.0)

    # Derived weather features
    temp_diff = air_temp - dew_temp
    is_raining = 1 if precip > 0 else 0
    high_cloud = 1 if cloud_cov >= 6 else 0
    cooling_degree = max(0.0, air_temp - 18.0)
    heating_degree = max(0.0, 18.0 - air_temp)

    # Building metadata
    sqm = _meta_float(meta, "sqm", "floor_area", default=1000.0)
    sqft = _meta_float(meta, "sqft", default=sqm / 0.0929)
    n_floors = _meta_float(meta, "numberoffloors", "number_of_floors", default=1.0)
    year_built = _meta_float(meta, "yearbuilt", "year_built", default=2000.0)
    lat = _meta_float(meta, "lat", "latitude", default=40.0)
    lng = _meta_float(meta, "lng", "lon", "longitude", default=-74.0)
    electricity = _meta_float(meta, "electricity", default=1.0)

    log_sqm = math.log(sqm + 1) if sqm > 0 else 0.0
    building_age = max(0, year - int(year_built)) if year_built > 0 else 20

    # Solar weather (for XGB energy model which was trained on merged data)
    solar_ghi = _safe_float(weather.get("solar_ghi", weather.get("GHI")), 0.0)
    solar_dni = _safe_float(weather.get("solar_dni", weather.get("DNI")), 0.0)
    solar_dhi = _safe_float(weather.get("solar_dhi", weather.get("DHI")), 0.0)
    nsrdb_temperature = _safe_float(weather.get("nsrdb_temperature"), air_temp)
    nsrdb_wind_speed = _safe_float(weather.get("nsrdb_wind_speed"), wind_speed)
    is_daytime = 1 if 6 <= hour <= 18 else 0
    solar_log_ghi = math.log(solar_ghi + 1) if solar_ghi > 0 else 0.0
    solar_log_dni = math.log(solar_dni + 1) if solar_dni > 0 else 0.0
    solar_log_dhi = math.log(solar_dhi + 1) if solar_dhi > 0 else 0.0
    solar_diffuse_ratio = (solar_dhi / solar_ghi) if solar_ghi > 0 else 0.0

    # Lag features — prefer actual lag cols from parquet, fallback to mean consumption.
    # parquet_reader injects mean under 'electricity_consumption' key (not 'mean_consumption'),
    # so we check that key too so that lag features are never zero for a real building.
    cons_lag1 = _meta_float(meta, "cons_lag1", "mean_consumption", "electricity_consumption", default=0.0)
    cons_lag24 = _meta_float(meta, "cons_lag24", "mean_consumption", "electricity_consumption", default=0.0)
    cons_lag168 = _meta_float(meta, "cons_lag168", "mean_consumption", "electricity_consumption", default=0.0)

    # ── Encode categoricals ──
    encoder = models.get("label_encoders")
    building_id_enc = _encode_categorical(encoder, "building_id", building_id, 0)
    site_id_val = str(meta.get("site_id", ""))
    site_id_enc = _encode_categorical(encoder, "site_id", site_id_val, 0)
    psu_val = str(meta.get("primaryspaceusage", meta.get("primary_space_usage", "Office")))
    psu_enc = _encode_categorical(encoder, "primaryspaceusage", psu_val, 0)
    tz_val = str(meta.get("timezone", "US/Eastern"))
    tz_enc = _encode_categorical(encoder, "timezone", tz_val, 0)
    sub_psu_val = str(meta.get("sub_primaryspaceusage", "Office"))
    sub_psu_enc = _encode_categorical(encoder, "sub_primaryspaceusage", sub_psu_val, 0)
    industry_val = str(meta.get("industry", "Unknown"))
    industry_enc = _encode_categorical(encoder, "industry", industry_val, 0)
    subindustry_val = str(meta.get("subindustry", "Unknown"))
    subindustry_enc = _encode_categorical(encoder, "subindustry", subindustry_val, 0)

    # ── Build base feature dict ──
    base = {
        "building_id": building_id_enc,
        "site_id": site_id_enc,
        "airTemperature": air_temp,
        "cloudCoverage": cloud_cov,
        "dewTemperature": dew_temp,
        "precipDepth1HR": precip,
        "seaLvlPressure": sea_pressure,
        "windDirection": wind_dir,
        "windSpeed": wind_speed,
        "primaryspaceusage": psu_enc,
        "sub_primaryspaceusage": sub_psu_enc,
        "sqm": sqm,
        "sqft": sqft,
        "lat": lat,
        "lng": lng,
        "timezone": tz_enc,
        "numberoffloors": n_floors,
        "yearbuilt": year_built,
        "electricity": electricity,
        "chilledwater": _meta_float(meta, "chilledwater", default=0.0),
        "industry": industry_enc,
        "subindustry": subindustry_enc,
        "steam": _meta_float(meta, "steam", default=0.0),
        "hour": hour,
        "dayofweek": day_of_week,
        "month": month,
        "dayofyear": day_of_year,
        "weekofyear": week_of_year,
        "is_weekend": is_weekend,
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "dayofweek_sin": dayofweek_sin,
        "dayofweek_cos": dayofweek_cos,
        "month_sin": month_sin,
        "month_cos": month_cos,
        "temp_diff": temp_diff,
        "is_raining": is_raining,
        "high_cloud": high_cloud,
        "cooling_degree": cooling_degree,
        "heating_degree": heating_degree,
        "log_sqm": log_sqm,
        "building_age": building_age,
        "cons_lag1": cons_lag1,
        "cons_lag24": cons_lag24,
        "cons_lag168": cons_lag168,
        # Solar cols for XGB energy (trained on merged data)
        "solar_ghi": solar_ghi,
        "solar_dni": solar_dni,
        "solar_dhi": solar_dhi,
        "nsrdb_temperature": nsrdb_temperature,
        "nsrdb_wind_speed": nsrdb_wind_speed,
        "is_daytime": is_daytime,
        "solar_log_ghi": solar_log_ghi,
        "solar_log_dni": solar_log_dni,
        "solar_log_dhi": solar_log_dhi,
        "solar_diffuse_ratio": solar_diffuse_ratio,
    }

    # ── Build XGB energy DataFrame ──
    xgb_dict = {}
    for col in XGB_ENERGY_FEATURES:
        xgb_dict[col] = base.get(col, 0.0)
    xgb_df = pd.DataFrame([xgb_dict], columns=XGB_ENERGY_FEATURES)

    # ── Build ANN energy DataFrame ──
    ann_dict = {}
    for col in ANN_ENERGY_FEATURES:
        ann_dict[col] = base.get(col, 0.0)
    ann_df = pd.DataFrame([ann_dict], columns=ANN_ENERGY_FEATURES)

    # Apply scaler for ANN
    scaler = models.get("scaler_energy")
    if scaler is not None:
        try:
            ann_scaled = scaler.transform(ann_df)
            ann_df = pd.DataFrame(ann_scaled, columns=ANN_ENERGY_FEATURES)
        except Exception as e:
            logger.warning(f"Scaler transform failed: {e}")

    return {
        "xgb_features": xgb_df,
        "ann_features": ann_df,
    }


# ═══════════════════════════════════════════════
# SOLAR FEATURES
# ═══════════════════════════════════════════════

def build_solar_features(
    building_id: str,
    hour: int,
    day: int,
    month: int,
    year: int,
    solar: dict,
    weather: dict,
    meta: dict,
    models: dict,
) -> pd.DataFrame:
    """
    Build feature DataFrame for the XGBoost solar output model.

    Returns pd.DataFrame with exactly SOLAR_FEATURES columns.
    """
    try:
        dt = datetime(year, month, day, hour)
    except (ValueError, OverflowError):
        dt = datetime(2017, 1, 1, 12)

    day_of_year = dt.timetuple().tm_yday

    # Time cyclical features
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)
    month_sin = math.sin(2 * math.pi * month / 12)
    month_cos = math.cos(2 * math.pi * month / 12)

    # Location
    lat = _meta_float(meta, "lat", "latitude", default=40.0)
    lng = _meta_float(meta, "lng", "lon", "longitude", default=-74.0)

    # Solar geometry
    declination = 23.45 * math.sin(math.radians(360.0 / 365.0 * (day_of_year - 81)))
    hour_angle = 15.0 * (hour - 12)

    sin_elevation = (
        math.sin(math.radians(lat)) * math.sin(math.radians(declination))
        + math.cos(math.radians(lat))
        * math.cos(math.radians(declination))
        * math.cos(math.radians(hour_angle))
    )
    sin_elevation = max(-1.0, min(1.0, sin_elevation))
    solar_elevation = math.degrees(math.asin(sin_elevation))
    solar_altitude = max(0.0, solar_elevation)
    solar_zenith = 90.0 - solar_elevation
    cos_zenith = math.cos(math.radians(solar_zenith))

    # Irradiance from solar input
    ghi = float(solar.get("GHI", solar.get("solar_ghi", 500.0)))
    dni = float(solar.get("DNI", solar.get("solar_dni", 400.0)))
    dhi = float(solar.get("DHI", solar.get("solar_dhi", 100.0)))

    solar_log_ghi = math.log(ghi + 1) if ghi > 0 else 0.0
    solar_log_dni = math.log(dni + 1) if dni > 0 else 0.0
    solar_log_dhi = math.log(dhi + 1) if dhi > 0 else 0.0
    solar_diffuse_ratio = (dhi / ghi) if ghi > 0 else 0.0

    # Extraterrestrial radiation for clearsky ratio
    ext_rad = 1367.0 * (1 + 0.033 * math.cos(math.radians(360.0 * day_of_year / 365.0)))
    clearsky_ghi = ext_rad * max(0, cos_zenith)
    clearsky_ratio = (ghi / clearsky_ghi) if clearsky_ghi > 0 else 0.0

    # POA irradiance (simplified: tilt = lat, south-facing)
    tilt_rad = math.radians(abs(lat))
    poa_irradiance = max(0.0, dni * max(0, cos_zenith) + dhi)

    # Building-level solar parameters from meta
    sqm = _meta_float(meta, "sqm", "floor_area", default=1000.0)
    n_floors = _meta_float(meta, "numberoffloors", "number_of_floors", default=1.0)
    year_built = _meta_float(meta, "yearbuilt", "year_built", default=2000.0)
    log_sqm = math.log(sqm + 1) if sqm > 0 else 0.0
    building_age = max(0, year - int(year_built)) if year_built > 0 else 20

    # Solar panel parameters
    solar_meta = meta.get("solar_meta") or {}
    roof_area_m2 = _safe_float(solar_meta.get("roof_area_m2") or meta.get("roof_area_m2"), sqm / max(n_floors, 1))
    usable_roof_m2 = _safe_float(solar_meta.get("usable_roof_m2") or meta.get("usable_roof_m2"), roof_area_m2 * 0.6)
    n_panels = _safe_float(solar_meta.get("n_panels") or meta.get("n_panels"), usable_roof_m2 / 1.7)

    poa_x_n_panels = poa_irradiance * n_panels

    # Temperature
    air_temp = _safe_float(weather.get("air_temperature"), 20.0)
    nsrdb_temp = _safe_float(weather.get("nsrdb_temperature"), air_temp)
    nsrdb_wind = _safe_float(weather.get("nsrdb_wind_speed") or weather.get("wind_speed"), 3.0)

    # Cell temperature (simplified NOCT model)
    noct = 45.0  # Nominal Operating Cell Temperature
    cell_temperature = nsrdb_temp + (noct - 20.0) / 800.0 * ghi
    temp_above_stc = cell_temperature - 25.0

    # Effective efficiency
    base_efficiency = 0.20  # Modern panel ~20%
    temp_coeff = -0.004  # -0.4% per degree above STC
    effective_efficiency = base_efficiency * (1 + temp_coeff * temp_above_stc)

    # Time flags
    is_daytime = 1 if solar_altitude > 0 else 0
    is_solar_peak = 1 if 10 <= hour <= 15 and solar_altitude > 20 else 0

    # Cloud coverage
    cloud_cov = float(weather.get("cloud_coverage", 4.0))
    high_cloud = 1 if cloud_cov >= 6 else 0

    # ── Build DataFrame ──
    feature_dict = {
        "roof_area_m2": roof_area_m2,
        "usable_roof_m2": usable_roof_m2,
        "n_panels": n_panels,
        "log_sqm": log_sqm,
        "numberoffloors": n_floors,
        "building_age": building_age,
        "solar_ghi": ghi,
        "solar_dni": dni,
        "solar_dhi": dhi,
        "solar_log_ghi": solar_log_ghi,
        "solar_log_dni": solar_log_dni,
        "solar_log_dhi": solar_log_dhi,
        "poa_irradiance": poa_irradiance,
        "solar_diffuse_ratio": solar_diffuse_ratio,
        "clearsky_ratio": clearsky_ratio,
        "poa_x_n_panels": poa_x_n_panels,
        "nsrdb_temperature": nsrdb_temp,
        "cell_temperature": cell_temperature,
        "temp_above_stc": temp_above_stc,
        "nsrdb_wind_speed": nsrdb_wind,
        "effective_efficiency": effective_efficiency,
        "cos_zenith": cos_zenith,
        "solar_altitude": solar_altitude,
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "month_sin": month_sin,
        "month_cos": month_cos,
        "dayofyear": day_of_year,
        "is_daytime": is_daytime,
        "is_solar_peak": is_solar_peak,
        "lat": lat,
        "lng": lng,
        "cloudCoverage": cloud_cov,
        "high_cloud": high_cloud,
    }

    # Ensure all SOLAR_FEATURES are present
    final_dict = {}
    for col in SOLAR_FEATURES:
        final_dict[col] = feature_dict.get(col, 0.0)

    df = pd.DataFrame([final_dict], columns=SOLAR_FEATURES)

    # Apply solar scaler if available
    scaler = models.get("scaler_solar")
    if scaler is not None:
        try:
            scaled = scaler.transform(df)
            df = pd.DataFrame(scaled, columns=SOLAR_FEATURES)
        except Exception as e:
            logger.warning(f"Solar scaler transform failed: {e}")

    return df


# ═══════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════

def _encode_categorical(encoder, col_name: str, value: str, default: int = 0) -> int:
    """
    Encode a single categorical value using the OrdinalEncoder.
    The encoder was fit on 7 columns in this order:
      building_id, site_id, primaryspaceusage, timezone,
      sub_primaryspaceusage, industry, subindustry
    """
    if encoder is None:
        return default

    try:
        # Get the column index in the encoder
        feature_names = list(encoder.feature_names_in_)
        if col_name not in feature_names:
            return default

        col_idx = feature_names.index(col_name)
        categories = encoder.categories_[col_idx]

        if value in categories:
            return int(np.where(categories == value)[0][0])
        else:
            # Unknown value — use the encoder's configured unknown_value
            unknown_val = getattr(encoder, "unknown_value", -1)
            return int(unknown_val) if unknown_val is not None else default

    except Exception as e:
        logger.debug(f"Encoding failed for {col_name}={value}: {e}")
        return default
