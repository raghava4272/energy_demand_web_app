"""
Buildings Router — building registry and metadata endpoints.

GET /api/buildings          → list all buildings
GET /api/buildings/{id}     → building detail with consumption stats
"""

from typing import List, Optional

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["Buildings"])


# ─────────────────────────────────────────────
# Response Schemas
# ─────────────────────────────────────────────

class BuildingResponse(BaseModel):
    building_id: str
    site_id: str
    lat: float
    lon: float
    floor_area: float
    primary_space_usage: str
    year_built: int
    number_of_floors: int
    timezone: str


class BuildingDetailResponse(BuildingResponse):
    mean_consumption: float = 0.0
    peak_consumption: float = 0.0
    min_consumption: float = 0.0
    record_count: int = 0
    available_years: List[int] = []


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@router.get("/buildings", response_model=List[BuildingResponse])
async def list_buildings(
    request: Request,
    site_id: Optional[str] = None,
    limit: Optional[int] = None,
):
    """
    List all buildings in the registry.
    Optional filters: site_id, limit.
    """
    parquet = request.app.state.parquet
    buildings = parquet.get_buildings()

    if site_id:
        buildings = [b for b in buildings if b["site_id"] == site_id]

    if limit and limit > 0:
        buildings = buildings[:limit]

    return buildings


@router.get("/buildings/{building_id}", response_model=BuildingDetailResponse)
async def get_building_detail(request: Request, building_id: str):
    """
    Get detailed info for a specific building, including consumption stats.
    """
    parquet = request.app.state.parquet

    # Find building in registry
    buildings = parquet.get_buildings()
    building = None
    for b in buildings:
        if b["building_id"] == building_id:
            building = b
            break

    if building is None:
        raise HTTPException(
            status_code=404,
            detail=f"Building '{building_id}' not found",
        )

    # Get stats
    stats = parquet.get_building_stats(building_id)

    # Merge building info + stats
    return BuildingDetailResponse(
        building_id=building["building_id"],
        site_id=building["site_id"],
        lat=building["lat"],
        lon=building["lon"],
        floor_area=building["floor_area"],
        primary_space_usage=building["primary_space_usage"],
        year_built=building["year_built"],
        number_of_floors=building["number_of_floors"],
        timezone=building["timezone"],
        mean_consumption=stats["mean_consumption"],
        peak_consumption=stats["peak_consumption"],
        min_consumption=stats["min_consumption"],
        record_count=stats["record_count"],
        available_years=stats["available_years"],
    )
