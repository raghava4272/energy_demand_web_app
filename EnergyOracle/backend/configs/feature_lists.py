"""
Feature Lists for Energy Demand and Solar Output Models

These lists define the exact features expected by each model.
They can be overridden at startup by placing a text file in backend/data/:
  - energy_feature_list.txt  → overrides ENERGY_FEATURES
  - solar_feature_list.txt   → overrides SOLAR_FEATURES
One column name per line.
"""

import os
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# XGBoost Energy Model Features (48 features)
# These are the features used by the XGBoost energy demand model.
# The model was trained on ordinal-encoded categoricals + numeric features
# from the merged energy+solar dataset.
# ──────────────────────────────────────────────
XGB_ENERGY_FEATURES = [
    "building_id", "site_id", "airTemperature", "cloudCoverage",
    "dewTemperature", "precipDepth1HR", "seaLvlPressure", "windDirection",
    "windSpeed", "primaryspaceusage", "sqm", "lat", "lng", "timezone",
    "numberoffloors", "yearbuilt", "hour", "dayofweek", "month",
    "dayofyear", "weekofyear", "is_weekend", "hour_sin", "hour_cos",
    "dayofweek_sin", "dayofweek_cos", "month_sin", "month_cos",
    "temp_diff", "is_raining", "high_cloud", "cooling_degree",
    "heating_degree", "log_sqm", "building_age", "cons_lag1",
    "cons_lag24", "cons_lag168", "solar_ghi", "solar_dni", "solar_dhi",
    "nsrdb_temperature", "nsrdb_wind_speed", "is_daytime",
    "solar_log_ghi", "solar_log_dni", "solar_log_dhi", "solar_diffuse_ratio",
]

# ──────────────────────────────────────────────
# ANN Energy Model Features (43 features)
# Same as XGB but drops: chilledwater, steam, and the 5 solar-only cols
# that the ANN was not trained on. The ANN was trained with StandardScaler.
# Output is log1p-transformed, so we expm1 to recover kWh.
# ──────────────────────────────────────────────
ANN_ENERGY_FEATURES = [
    "building_id", "site_id", "airTemperature", "cloudCoverage",
    "dewTemperature", "precipDepth1HR", "seaLvlPressure", "windDirection",
    "windSpeed", "primaryspaceusage", "sub_primaryspaceusage", "sqm",
    "sqft", "lat", "lng", "timezone", "numberoffloors", "yearbuilt",
    "electricity", "industry", "subindustry", "hour", "dayofweek",
    "month", "dayofyear", "weekofyear", "is_weekend", "hour_sin",
    "hour_cos", "dayofweek_sin", "dayofweek_cos", "month_sin",
    "month_cos", "temp_diff", "is_raining", "high_cloud",
    "cooling_degree", "heating_degree", "log_sqm", "building_age",
    "cons_lag1", "cons_lag24", "cons_lag168",
]

# ──────────────────────────────────────────────
# Categorical columns (for OrdinalEncoder)
# ──────────────────────────────────────────────
CATEGORICAL_COLS = [
    "building_id", "site_id", "primaryspaceusage", "timezone",
    "sub_primaryspaceusage", "industry", "subindustry",
]

# ──────────────────────────────────────────────
# Solar XGBoost Model Features (34 features)
# ──────────────────────────────────────────────
SOLAR_FEATURES = [
    "roof_area_m2", "usable_roof_m2", "n_panels", "log_sqm",
    "numberoffloors", "building_age", "solar_ghi", "solar_dni",
    "solar_dhi", "solar_log_ghi", "solar_log_dni", "solar_log_dhi",
    "poa_irradiance", "solar_diffuse_ratio", "clearsky_ratio",
    "poa_x_n_panels", "nsrdb_temperature", "cell_temperature",
    "temp_above_stc", "nsrdb_wind_speed", "effective_efficiency",
    "cos_zenith", "solar_altitude", "hour_sin", "hour_cos",
    "month_sin", "month_cos", "dayofyear", "is_daytime",
    "is_solar_peak", "lat", "lng", "cloudCoverage", "high_cloud",
]

# ──────────────────────────────────────────────
# Bayesian Meta-Model Features (5 features)
# ──────────────────────────────────────────────
BAYESIAN_META_FEATURES = [
    "xgb_pred", "ann_pred", "fusion_pred", "pred_diff", "pred_avg",
]


def _load_feature_override(filename: str) -> Optional[List[str]]:
    """Load feature list from a text file (one column name per line)."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    filepath = os.path.join(base_dir, "data", filename)
    if os.path.exists(filepath):
        try:
            with open(filepath, "r") as f:
                features = [line.strip() for line in f if line.strip()]
            logger.info(f"Loaded {len(features)} features from {filename}")
            return features
        except Exception as e:
            logger.warning(f"Failed to load {filename}: {e}")
    return None


def load_feature_lists():
    """
    Load feature list overrides from text files if they exist.
    Call this at startup after logging is configured.
    """
    global XGB_ENERGY_FEATURES, ANN_ENERGY_FEATURES, SOLAR_FEATURES

    override = _load_feature_override("energy_feature_list.txt")
    if override is not None:
        XGB_ENERGY_FEATURES = override
        logger.info("XGB_ENERGY_FEATURES overridden from energy_feature_list.txt")

    override = _load_feature_override("ann_feature_list.txt")
    if override is not None:
        ANN_ENERGY_FEATURES = override
        logger.info("ANN_ENERGY_FEATURES overridden from ann_feature_list.txt")

    override = _load_feature_override("solar_feature_list.txt")
    if override is not None:
        SOLAR_FEATURES = override
        logger.info("SOLAR_FEATURES overridden from solar_feature_list.txt")
