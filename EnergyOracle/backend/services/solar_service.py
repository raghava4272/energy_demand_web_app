"""
Solar Service — runs solar output prediction through the XGBoost solar model.

The solar XGB model predicts solar_output_kwh for a 1-hour window,
so kW == kWh for the interval.
"""

import logging

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def predict_solar(features_df: pd.DataFrame, models: dict) -> dict:
    """
    Run solar output prediction.

    Args:
        features_df: DataFrame with SOLAR_FEATURES columns (34 features)
        models: dict of loaded model artifacts

    Returns:
        dict with solar_output_kw, solar_output_kwh, model_used
    """
    solar_kw = 0.0

    if models.get("xgb_solar") is not None:
        try:
            raw = models["xgb_solar"].predict(features_df)
            solar_kw = float(raw[0])
            # Solar output cannot be negative
            solar_kw = max(0.0, solar_kw)
            logger.debug(f"Solar XGB prediction: {solar_kw:.4f} kW")
        except Exception as e:
            logger.warning(f"Solar XGBoost prediction failed: {e}")
            solar_kw = 0.0

    # For a 1-hour window, kW == kWh
    solar_kwh = solar_kw

    return {
        "solar_output_kw": round(solar_kw, 4),
        "solar_output_kwh": round(solar_kwh, 4),
        "model_used": models.get("xgb_solar") is not None,
    }
