"""
Energy Service — runs energy demand predictions through all available models.

Pipeline:
  1. XGBoost prediction (48-feature model on merged data)
  2. ANN prediction (43-feature model with StandardScaler, log1p target)
  3. Fusion (weighted average: 0.45 XGB + 0.55 ANN)
  4. Bayesian meta-model (BayesianRidge on [xgb, ann, fusion, diff, avg])
  5. Confidence intervals (from Bayesian or ±12% heuristic fallback)
"""

import logging

import numpy as np
import pandas as pd

from configs.feature_lists import BAYESIAN_META_FEATURES

logger = logging.getLogger(__name__)


def predict_energy(features: dict, models: dict) -> dict:
    """
    Run energy demand prediction pipeline.

    Args:
        features: dict with keys "xgb_features" and "ann_features" (DataFrames)
        models: dict of loaded model artifacts

    Returns:
        dict with xgb_prediction, ann_prediction, fusion_prediction,
        bayesian_prediction, lower_bound, upper_bound, confidence_level,
        and models_used.
    """
    xgb_pred = None
    ann_pred = None

    # ── 1. XGBoost prediction ──
    if models.get("xgb_energy") is not None:
        try:
            xgb_df = features["xgb_features"]
            raw = models["xgb_energy"].predict(xgb_df)
            raw_val = float(raw[0])
            if raw_val < 0:
                logger.warning(
                    f"XGBoost returned negative value ({raw_val:.2f}) — likely zero/bad lag features. "
                    "Check that cons_lag1/cons_lag24/cons_lag168 are populated from parquet."
                )
            xgb_pred = max(0.0, raw_val)
            logger.debug(f"XGB energy prediction: raw={raw_val:.4f} clamped={xgb_pred:.4f}")
        except Exception as e:
            logger.warning(f"XGBoost energy prediction failed: {e}")
            xgb_pred = None

    # ── 2. ANN prediction (log1p target → expm1 to recover kWh) ──
    if models.get("ann_energy") is not None:
        try:
            ann_df = features["ann_features"]
            ann_input = ann_df.values.astype("float32")
            raw_log = models["ann_energy"].predict(ann_input, verbose=0)
            ann_pred_log = float(raw_log[0][0])
            # Reverse log1p transform
            ann_pred = float(np.clip(np.expm1(ann_pred_log), 0, None))
            logger.debug(f"ANN energy prediction (log): {ann_pred_log:.4f} → {ann_pred:.4f} kWh")
        except Exception as e:
            logger.warning(f"ANN energy prediction failed: {e}")
            ann_pred = None

    # ── 3. Fusion (weighted average) ──
    if xgb_pred is not None and ann_pred is not None:
        fusion = 0.45 * xgb_pred + 0.55 * ann_pred
    elif xgb_pred is not None:
        fusion = xgb_pred
    elif ann_pred is not None:
        fusion = ann_pred
    else:
        fusion = 0.0

    fusion = max(0.0, fusion)

    # ── 4. Bayesian meta-model ──
    bayes_pred = fusion
    lower = fusion * 0.88
    upper = fusion * 1.12

    if models.get("bayesian") is not None:
        try:
            # The Bayesian meta-model expects 5 features:
            # [xgb_pred, ann_pred, fusion_pred, pred_diff, pred_avg]
            xgb_val = xgb_pred if xgb_pred is not None else fusion
            ann_val = ann_pred if ann_pred is not None else fusion
            pred_diff = xgb_val - ann_val
            pred_avg = (xgb_val + ann_val) / 2.0

            meta_features = pd.DataFrame(
                [[xgb_val, ann_val, fusion, pred_diff, pred_avg]],
                columns=BAYESIAN_META_FEATURES,
            )

            bayesian_model = models["bayesian"]

            # BayesianRidge supports predict(X, return_std=True)
            try:
                bay_result, bay_std = bayesian_model.predict(
                    meta_features, return_std=True
                )
                bayes_pred = max(0.0, float(bay_result[0]))
                std_val = float(bay_std[0])
                # 95% CI ≈ ±1.96σ
                lower = max(0.0, bayes_pred - 1.96 * std_val)
                upper = bayes_pred + 1.96 * std_val
                logger.debug(
                    f"Bayesian: {bayes_pred:.4f} [{lower:.4f}, {upper:.4f}]"
                )
            except TypeError:
                # Fallback if return_std not supported
                bay_result = bayesian_model.predict(meta_features)
                bayes_pred = max(0.0, float(bay_result[0]))
                lower = bayes_pred * 0.88
                upper = bayes_pred * 1.12

        except Exception as e:
            logger.warning(f"Bayesian prediction failed: {e}")
            bayes_pred = fusion
            lower = fusion * 0.88
            upper = fusion * 1.12

    # ── 5. Build response ──
    return {
        "xgb_prediction": round(xgb_pred if xgb_pred is not None else 0.0, 4),
        "ann_prediction": round(ann_pred if ann_pred is not None else 0.0, 4),
        "fusion_prediction": round(fusion, 4),
        "bayesian_prediction": round(bayes_pred, 4),
        "lower_bound": round(lower, 4),
        "upper_bound": round(upper, 4),
        "confidence_level": 0.95,
        "models_used": {
            "xgboost": xgb_pred is not None,
            "ann": ann_pred is not None,
            "bayesian": models.get("bayesian") is not None,
        },
    }
