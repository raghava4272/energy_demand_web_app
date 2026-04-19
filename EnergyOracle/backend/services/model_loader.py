"""
Model Loader — loads all ML models from backend/models/ at startup.

Handles missing files gracefully (logs warning, sets to None).
Prints a startup summary showing which models loaded successfully.
"""

import os
import logging
import warnings

from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# Suppress XGBoost serialization warnings during load
warnings.filterwarnings("ignore", category=UserWarning, module="xgboost")


def load_all_models(models_dir: Optional[str] = None) -> dict:
    """
    Load all model artifacts from the models/ directory.

    Expected layout:
      models/
      ├── energy demand/
      │   ├── ann_model.keras             (or ann_bdg2_only (1).keras)
      │   ├── encoder.joblib              (OrdinalEncoder)
      │   ├── scaler.joblib               (StandardScaler for ANN)
      │   ├── bayesian_meta_model (2).pkl (BayesianRidge meta-model)
      │   └── xgb_solar_model (1).pkl    (Solar XGBoost)
      └── solar/
          └── xgb_solar_model.pkl         (Energy XGBoost — misnamed in repo)

    Returns dict with keys:
      xgb_energy, ann_energy, bayesian, xgb_solar,
      scaler_energy, scaler_solar, label_encoders
    """
    if models_dir is None:
        # __file__ is backend/services/model_loader.py
        # Go up: services/ → backend/ → EnergyOracle/ → project/
        services_dir = os.path.dirname(os.path.abspath(__file__))
        backend_dir = os.path.dirname(services_dir)
        energyoracle_dir = os.path.dirname(backend_dir)
        project_root = os.path.dirname(energyoracle_dir)
        models_dir = os.path.join(project_root, "models")
        logger.info(f"Model directory resolved to: {models_dir}")

    result = {
        "xgb_energy": None,
        "ann_energy": None,
        "bayesian": None,
        "xgb_solar": None,
        "scaler_energy": None,
        "scaler_solar": None,
        "label_encoders": None,
    }

    energy_dir = os.path.join(models_dir, "energy demand")
    solar_dir = os.path.join(models_dir, "solar")

    # ── XGBoost Energy ──
    # Note: the energy XGB is stored in models/solar/ (misnamed during training)
    # It has 48 features matching the merged energy+solar dataset
    xgb_energy_paths = [
        os.path.join(solar_dir, "xgb_solar_model.pkl"),
        os.path.join(models_dir, "xgboost_energy_model.pkl"),
        os.path.join(energy_dir, "xgboost_energy_model.pkl"),
    ]
    result["xgb_energy"] = _load_joblib("xgb_energy", xgb_energy_paths)

    # ── ANN Energy ──
    ann_paths = [
        os.path.join(energy_dir, "ann_model.keras"),
        os.path.join(energy_dir, "ann_bdg2_only (1).keras"),
        os.path.join(models_dir, "ann_energy_model.h5"),
        os.path.join(energy_dir, "ann_energy_model.h5"),
    ]
    result["ann_energy"] = _load_keras("ann_energy", ann_paths)

    # ── Bayesian Meta-Model ──
    bayesian_paths = [
        os.path.join(energy_dir, "bayesian_meta_model (2).pkl"),
        os.path.join(energy_dir, "bayesian_model.pkl"),
        os.path.join(models_dir, "bayesian_model.pkl"),
    ]
    result["bayesian"] = _load_joblib("bayesian", bayesian_paths)

    # ── XGBoost Solar ──
    # Note: the solar XGB is stored in models/energy demand/ (misnamed)
    # It has 34 features matching the solar-specific feature set
    xgb_solar_paths = [
        os.path.join(energy_dir, "xgb_solar_model (1).pkl"),
        os.path.join(solar_dir, "xgb_solar_model_actual.pkl"),
        os.path.join(models_dir, "xgboost_solar_model.pkl"),
    ]
    result["xgb_solar"] = _load_joblib("xgb_solar", xgb_solar_paths)

    # ── Scaler (Energy / ANN) ──
    scaler_paths = [
        os.path.join(energy_dir, "scaler.joblib"),
        os.path.join(energy_dir, "scaler_energy.pkl"),
        os.path.join(models_dir, "scaler_energy.pkl"),
    ]
    result["scaler_energy"] = _load_joblib("scaler_energy", scaler_paths)

    # ── Scaler (Solar) — optional, may not exist ──
    scaler_solar_paths = [
        os.path.join(solar_dir, "scaler_solar.pkl"),
        os.path.join(models_dir, "scaler_solar.pkl"),
    ]
    result["scaler_solar"] = _load_joblib("scaler_solar", scaler_solar_paths)

    # ── Label Encoders (OrdinalEncoder) ──
    encoder_paths = [
        os.path.join(energy_dir, "encoder.joblib"),
        os.path.join(energy_dir, "label_encoders.pkl"),
        os.path.join(models_dir, "label_encoders.pkl"),
    ]
    result["label_encoders"] = _load_joblib("label_encoders", encoder_paths)

    # ── Print startup summary ──
    _print_summary(result)

    return result


def _load_joblib(name: str, paths: List[str]):
    """Try loading a joblib/pickle file from multiple candidate paths."""
    import joblib

    for path in paths:
        if os.path.exists(path):
            try:
                obj = joblib.load(path)
                logger.info(f"  ✓ {name} loaded from {os.path.basename(path)}")
                return obj
            except Exception as e:
                logger.warning(f"  ✗ {name} failed to load from {path}: {e}")
                continue

    logger.warning(f"  ✗ {name} NOT FOUND (tried {len(paths)} paths)")
    return None


def _load_keras(name: str, paths: List[str]):
    """Try loading a Keras model from multiple candidate paths."""
    for path in paths:
        if os.path.exists(path):
            try:
                import tensorflow as tf
                model = tf.keras.models.load_model(path, compile=False)
                model.compile(optimizer="adam", loss="mse", metrics=["mae"])
                logger.info(f"  ✓ {name} loaded from {os.path.basename(path)}")
                return model
            except Exception as e:
                logger.warning(f"  ✗ {name} failed to load from {path}: {e}")
                continue

    logger.warning(f"  ✗ {name} NOT FOUND (tried {len(paths)} paths)")
    return None


def _print_summary(models: dict):
    """Print a pretty startup summary of loaded models."""
    print("\n" + "═" * 50)
    print("  EnergyOracle — Model Loading Summary")
    print("═" * 50)

    status_lines = {
        "xgb_energy":    "XGBoost Energy Demand",
        "ann_energy":    "ANN Energy Demand",
        "bayesian":      "Bayesian Meta-Model",
        "xgb_solar":     "XGBoost Solar Output",
        "scaler_energy": "StandardScaler (Energy/ANN)",
        "scaler_solar":  "StandardScaler (Solar)",
        "label_encoders": "OrdinalEncoder (Categoricals)",
    }

    loaded_count = 0
    for key, label in status_lines.items():
        if models[key] is not None:
            print(f"  ✓ {label}")
            loaded_count += 1
        else:
            fallback = ""
            if key == "ann_energy":
                fallback = " — fusion will use XGBoost only"
            elif key == "xgb_energy":
                fallback = " — fusion will use ANN only"
            elif key == "bayesian":
                fallback = " — will use ±12% heuristic bounds"
            elif key == "scaler_solar":
                fallback = " — solar features will be unscaled"
            elif key == "scaler_energy":
                fallback = " — ANN features will be unscaled"
            print(f"  ✗ {label} NOT FOUND{fallback}")

    print(f"\n  {loaded_count}/{len(status_lines)} models loaded")
    print("═" * 50 + "\n")
