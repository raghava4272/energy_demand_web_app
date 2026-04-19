"""
EnergyOracle API — Main Application Entry Point

FastAPI backend for building energy demand and solar output prediction.
Uses lifespan context manager for startup/shutdown to load ML models
and parquet data once at boot.

Run with:
    cd EnergyOracle/backend
    uvicorn main:app --reload --port 8000
"""

import sys
import os
import logging
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ─────────────────────────────────────────────
# Ensure backend/ is on sys.path for local imports
# ─────────────────────────────────────────────
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# ─────────────────────────────────────────────
# Configure logging
# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("energyoracle")


# ─────────────────────────────────────────────
# Lifespan: startup & shutdown
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models and data at startup, clean up at shutdown."""
    logger.info("Starting EnergyOracle API...")

    # Load feature list overrides (if any text files exist in data/)
    from configs.feature_lists import load_feature_lists
    load_feature_lists()

    # Load ML models
    from services.model_loader import load_all_models
    app.state.models = load_all_models()

    # Load parquet data
    from utils.parquet_reader import ParquetReader

    # Data lives at project/data/ (sibling of EnergyOracle/)
    project_root = os.path.dirname(os.path.dirname(BACKEND_DIR))
    data_dir = os.path.join(project_root, "data")

    # Fallback: check if data/ exists inside EnergyOracle/backend/data/
    if not os.path.isdir(data_dir):
        data_dir = os.path.join(BACKEND_DIR, "data")

    logger.info(f"Loading parquet data from: {data_dir}")
    app.state.parquet = ParquetReader(data_dir=data_dir)

    buildings = app.state.parquet.get_buildings()
    logger.info(f"Indexed {len(buildings)} buildings")

    logger.info("EnergyOracle API ready! Docs at http://localhost:8000/docs")
    yield

    # Shutdown
    logger.info("Shutting down EnergyOracle API...")


# ─────────────────────────────────────────────
# Create FastAPI app
# ─────────────────────────────────────────────
app = FastAPI(
    title="EnergyOracle API",
    description=(
        "Building energy demand and solar output prediction system. "
        "Uses XGBoost, ANN, and Bayesian meta-models for multi-model "
        "energy forecasting with confidence intervals."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# ─────────────────────────────────────────────
# CORS
# ─────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# Include routers
# ─────────────────────────────────────────────
from routers.buildings import router as buildings_router
from routers.predict_energy import router as predict_energy_router
from routers.predict_solar import router as predict_solar_router
from routers.predict_combined import router as predict_combined_router

app.include_router(buildings_router, prefix="/api")
app.include_router(predict_energy_router, prefix="/api")
app.include_router(predict_solar_router, prefix="/api")
app.include_router(predict_combined_router, prefix="/api")


# ─────────────────────────────────────────────
# Root & Health Endpoints
# ─────────────────────────────────────────────

@app.get("/", tags=["Root"])
async def root():
    """API root — welcome message with docs link."""
    return {
        "message": "EnergyOracle API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "buildings": "/api/buildings",
            "predict_energy": "/api/predict/energy",
            "predict_solar": "/api/predict/solar",
            "predict_combined": "/api/predict/combined",
            "health": "/health",
        },
    }


@app.get("/health", tags=["Health"])
async def health():
    """Health check — shows which models are loaded."""
    models = getattr(app.state, "models", {})
    loaded = [key for key, val in models.items() if val is not None]
    building_count = 0
    try:
        building_count = len(app.state.parquet.get_buildings())
    except Exception:
        pass

    return {
        "status": "ok",
        "models_loaded": loaded,
        "models_count": len(loaded),
        "buildings_indexed": building_count,
    }
