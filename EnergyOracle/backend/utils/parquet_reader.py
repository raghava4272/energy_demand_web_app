"""
ParquetReader — loads and indexes all parquet data at startup.

Scans backend/data/ recursively for .parquet files and separates them into:
  - energy_df: files from energy_demand_data/ directories
  - solar_df:  files from solar_data/ directories or containing 'nsrdb'/'merged'

Provides building registry, stats, and metadata lookup methods.
"""

import os
import logging
from typing import List, Optional

import pandas as pd
import numpy as np

from configs.site_coordinates import SITE_COORDINATES

logger = logging.getLogger(__name__)


class ParquetReader:
    """Reads and indexes all parquet datasets at startup."""

    def __init__(self, data_dir: Optional[str] = None):
        if data_dir is None:
            base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            data_dir = os.path.join(base, "data")

        self.data_dir = data_dir
        self.energy_df: pd.DataFrame = pd.DataFrame()
        self.solar_df: pd.DataFrame = pd.DataFrame()
        self._building_cache: Optional[List[dict]] = None

        self._scan_and_load()

    # ─────────────────────────────────────────────
    # Internal: scan & load parquet files
    # ─────────────────────────────────────────────
    def _scan_and_load(self):
        """Walk data_dir, classify and load all .parquet files."""
        if not os.path.isdir(self.data_dir):
            logger.warning(f"Data directory not found: {self.data_dir}")
            return

        energy_files: List[str] = []
        solar_files: List[str] = []

        for root, _, files in os.walk(self.data_dir):
            for fname in files:
                if not fname.endswith(".parquet"):
                    continue
                full_path = os.path.join(root, fname)
                rel_parts = os.path.relpath(full_path, self.data_dir).lower()

                # Classify by directory name or filename patterns
                if "solar" in rel_parts or "nsrdb" in rel_parts or "merged" in rel_parts:
                    solar_files.append(full_path)
                elif "energy" in rel_parts or "bdg2" in rel_parts:
                    energy_files.append(full_path)
                else:
                    # Default: try to detect from columns
                    energy_files.append(full_path)

        # Load energy data
        if energy_files:
            logger.info(f"Loading {len(energy_files)} energy parquet file(s)...")
            dfs = []
            for fp in energy_files:
                try:
                    df = pd.read_parquet(fp, engine="pyarrow")
                    dfs.append(df)
                    logger.info(f"  ✓ {os.path.basename(fp)}: {len(df):,} rows")
                except Exception as e:
                    logger.warning(f"  ✗ Failed to load {fp}: {e}")
            if dfs:
                self.energy_df = pd.concat(dfs, ignore_index=True)
                logger.info(f"Total energy records: {len(self.energy_df):,}")
        else:
            logger.warning("No energy parquet files found in data/")

        # Load solar data
        if solar_files:
            logger.info(f"Loading {len(solar_files)} solar parquet file(s)...")
            dfs = []
            for fp in solar_files:
                try:
                    df = pd.read_parquet(fp, engine="pyarrow")
                    dfs.append(df)
                    logger.info(f"  ✓ {os.path.basename(fp)}: {len(df):,} rows")
                except Exception as e:
                    logger.warning(f"  ✗ Failed to load {fp}: {e}")
            if dfs:
                self.solar_df = pd.concat(dfs, ignore_index=True)
                logger.info(f"Total solar records: {len(self.solar_df):,}")
        else:
            logger.warning("No solar parquet files found in data/")

    # ─────────────────────────────────────────────
    # Helper: resolve column name variants
    # ─────────────────────────────────────────────
    @staticmethod
    def _get_col(df: pd.DataFrame, variants: List[str], default=None):
        """Return the first matching column value, or default."""
        for v in variants:
            if v in df.columns:
                return v
        return default

    def _resolve_value(self, row: pd.Series, variants: List[str], default):
        """Get a value from a row trying multiple column names."""
        for v in variants:
            if v in row.index and pd.notna(row[v]):
                return row[v]
        return default

    # ─────────────────────────────────────────────
    # Public: get_buildings
    # ─────────────────────────────────────────────
    def get_buildings(self) -> List[dict]:
        """Extract unique buildings with metadata from energy_df."""
        if self._building_cache is not None:
            return self._building_cache

        if self.energy_df.empty:
            logger.warning("energy_df is empty — returning no buildings")
            return []

        df = self.energy_df

        # Determine building_id column
        bid_col = self._get_col(df, ["building_id", "Building_ID", "BuildingID"])
        if bid_col is None:
            logger.warning("No building_id column found")
            return []

        # Determine site_id column
        sid_col = self._get_col(df, ["site_id", "Site_ID", "SiteID", "site"])

        # Get unique buildings — take first row per building_id for metadata
        unique_buildings = df.drop_duplicates(subset=[bid_col])

        buildings = []
        for _, row in unique_buildings.iterrows():
            building_id = str(row[bid_col])
            site_id = str(row[sid_col]) if sid_col and pd.notna(row.get(sid_col)) else ""

            # Resolve lat/lon: try data columns first, then SITE_COORDINATES
            lat = self._resolve_value(row, ["lat", "latitude", "Latitude", "LAT"], None)
            lon = self._resolve_value(row, ["lng", "lon", "longitude", "Longitude", "LON"], None)

            if (lat is None or lon is None) and site_id in SITE_COORDINATES:
                coords = SITE_COORDINATES[site_id]
                lat = lat if lat is not None else coords["lat"]
                lon = lon if lon is not None else coords["lon"]

            lat = float(lat) if lat is not None else 0.0
            lon = float(lon) if lon is not None else 0.0

            # Floor area
            floor_area = self._resolve_value(row, ["sqm", "floor_area", "FloorArea"], None)
            if floor_area is None:
                sqft = self._resolve_value(row, ["sqft", "sq_ft", "SqFt"], None)
                floor_area = float(sqft) * 0.0929 if sqft is not None else 0.0
            floor_area = float(floor_area) if floor_area is not None else 0.0

            # Primary space usage
            psu = self._resolve_value(
                row,
                ["primaryspaceusage", "primary_space_usage", "PrimarySpaceUsage"],
                "Unknown",
            )

            # Year built
            year_built = self._resolve_value(row, ["yearbuilt", "year_built", "YearBuilt"], 0)
            year_built = int(year_built) if pd.notna(year_built) and year_built != 0 else 0

            # Number of floors
            n_floors = self._resolve_value(
                row, ["numberoffloors", "number_of_floors", "NumberOfFloors"], 1
            )
            n_floors = int(n_floors) if pd.notna(n_floors) and n_floors > 0 else 1

            # Timezone
            tz = self._resolve_value(row, ["timezone", "Timezone", "tz"], "UTC")

            buildings.append(
                {
                    "building_id": building_id,
                    "site_id": site_id,
                    "lat": lat,
                    "lon": lon,
                    "floor_area": floor_area,
                    "primary_space_usage": str(psu),
                    "year_built": year_built,
                    "number_of_floors": n_floors,
                    "timezone": str(tz),
                }
            )

        # Deduplicate by building_id
        seen = set()
        deduped = []
        for b in buildings:
            if b["building_id"] not in seen:
                seen.add(b["building_id"])
                deduped.append(b)

        # ── Detect and fix placeholder coordinates ───────────────────────────
        # Some sites have ALL buildings at the exact same lat/lon (a parquet
        # placeholder that may land in the ocean). For those sites, override
        # with SITE_COORDINATES and spread buildings with a small deterministic
        # jitter (~0.01° ≈ 1 km) so they don't stack as a single dot.

        # Collect per-site unique coordinate sets
        from math import sin, cos, pi
        site_unique_coords: dict = {}
        site_building_indices: dict = {}
        for i, b in enumerate(deduped):
            s = b["site_id"]
            if s not in site_unique_coords:
                site_unique_coords[s] = set()
                site_building_indices[s] = []
            site_unique_coords[s].add((round(b["lat"], 5), round(b["lon"], 5)))
            site_building_indices[s].append(i)

        for site, unique_coords in site_unique_coords.items():
            if len(unique_coords) == 1 and site in SITE_COORDINATES:
                # All buildings share one coordinate → likely placeholder
                sc = SITE_COORDINATES[site]
                sc_lat, sc_lon = sc["lat"], sc["lon"]
                indices = site_building_indices[site]
                n = len(indices)
                logger.info(
                    f"  Site '{site}': all {n} buildings share one coord "
                    f"({sc_lat:.4f}, {sc_lon:.4f}) → using site coordinates with jitter"
                )
                for rank, idx in enumerate(indices):
                    # Sunflower spiral — buildings spread evenly up to ~2.5 km radius
                    angle = rank * 2.399963  # golden angle in radians
                    # Scale radius: smallest cluster ≈ 0.3 km, largest ≈ 2.5 km
                    max_radius = min(0.025, 0.004 * (n ** 0.5))
                    # At least 0.001° so even building 0 is slightly offset
                    radius = max(0.001, max_radius * ((rank + 0.5) / max(n, 1)) ** 0.5)
                    jitter_lat = radius * sin(angle)
                    jitter_lon = radius * cos(angle) / max(0.3, cos(sc_lat * pi / 180))
                    deduped[idx] = dict(deduped[idx])
                    deduped[idx]["lat"] = sc_lat + jitter_lat
                    deduped[idx]["lon"] = sc_lon + jitter_lon

        self._building_cache = deduped
        logger.info(f"Indexed {len(deduped)} unique buildings")
        return deduped

    # ─────────────────────────────────────────────
    # Public: get_building_stats
    # ─────────────────────────────────────────────
    def get_building_stats(self, building_id: str) -> dict:
        """Return consumption statistics for a given building."""
        if self.energy_df.empty:
            return self._empty_stats()

        bid_col = self._get_col(self.energy_df, ["building_id", "Building_ID", "BuildingID"])
        if bid_col is None:
            return self._empty_stats()

        mask = self.energy_df[bid_col].astype(str) == building_id
        bdf = self.energy_df[mask]

        if bdf.empty:
            return self._empty_stats()

        # Find the target/consumption column
        target_col = self._get_col(
            bdf,
            [
                "electricity_consumption",
                "meter_reading",
                "consumption",
                "target",
                "electricity",
            ],
        )

        if target_col is None:
            return self._empty_stats()

        values = bdf[target_col].dropna()

        # Extract available years from timestamp
        ts_col = self._get_col(bdf, ["timestamp", "Timestamp", "datetime", "date"])
        available_years = []
        if ts_col is not None:
            try:
                years = pd.to_datetime(bdf[ts_col]).dt.year.dropna().unique()
                available_years = sorted(int(y) for y in years)
            except Exception:
                pass

        return {
            "mean_consumption": round(float(values.mean()), 4) if len(values) > 0 else 0.0,
            "peak_consumption": round(float(values.max()), 4) if len(values) > 0 else 0.0,
            "min_consumption": round(float(values.min()), 4) if len(values) > 0 else 0.0,
            "record_count": int(len(bdf)),
            "available_years": available_years,
        }

    @staticmethod
    def _empty_stats() -> dict:
        return {
            "mean_consumption": 0.0,
            "peak_consumption": 0.0,
            "min_consumption": 0.0,
            "record_count": 0,
            "available_years": [],
        }

    # ─────────────────────────────────────────────
    # Public: get_building_meta
    # ─────────────────────────────────────────────
    def get_building_meta(self, building_id: str) -> dict:
        """Return metadata dict for a single building (non-timeseries columns)."""
        if self.energy_df.empty:
            return {"building_id": building_id}

        bid_col = self._get_col(self.energy_df, ["building_id", "Building_ID", "BuildingID"])
        if bid_col is None:
            return {"building_id": building_id}

        mask = self.energy_df[bid_col].astype(str) == building_id
        bdf = self.energy_df[mask]

        if bdf.empty:
            return {"building_id": building_id}

        # Take first row
        row = bdf.iloc[0]

        # Timeseries columns to exclude from metadata
        ts_exclude = {
            "timestamp", "electricity_consumption", "meter_reading",
            "consumption", "target",
        }

        meta = {"building_id": building_id}
        for col in bdf.columns:
            if col.lower() in ts_exclude or col == bid_col:
                continue
            val = row[col]
            if pd.isna(val):
                meta[col] = None
            elif isinstance(val, (np.integer,)):
                meta[col] = int(val)
            elif isinstance(val, (np.floating,)):
                meta[col] = float(val)
            else:
                meta[col] = str(val)

        # Ensure essential keys exist
        site_id = meta.get("site_id", "")
        if site_id and site_id in SITE_COORDINATES:
            coords = SITE_COORDINATES[site_id]
            meta.setdefault("city", coords["city"])

        # Inject mean lag values from full building data (critical for XGB model).
        # Also inject 'mean_consumption' so feature_builder's _meta_float fallback always works
        # whether the parquet has pre-computed lag columns or only the raw electricity_consumption col.
        try:
            lag_cols = ["cons_lag1", "cons_lag24", "cons_lag168", "electricity_consumption"]
            for col in lag_cols:
                if col in bdf.columns and col not in meta:
                    series = bdf[col].dropna()
                    if len(series) > 0:
                        meta[col] = round(float(series.mean()), 4)

            # Always expose mean_consumption so feature_builder can find it as a universal lag fallback
            if "mean_consumption" not in meta:
                for fallback_col in ["electricity_consumption", "meter_reading", "consumption", "target"]:
                    if fallback_col in bdf.columns:
                        series = bdf[fallback_col].dropna()
                        if len(series) > 0:
                            meta["mean_consumption"] = round(float(series.mean()), 4)
                            break
        except Exception as e:
            logger.debug(f"Lag mean computation failed for {building_id}: {e}")

        return meta

    # ─────────────────────────────────────────────
    # Public: get_solar_meta (for solar model)
    # ─────────────────────────────────────────────
    def get_solar_meta(self, building_id: str) -> dict:
        """Return solar-specific metadata for a building from solar_df."""
        if self.solar_df.empty:
            return {}

        bid_col = self._get_col(self.solar_df, ["building_id", "Building_ID", "BuildingID"])
        if bid_col is None:
            return {}

        mask = self.solar_df[bid_col].astype(str) == building_id
        bdf = self.solar_df[mask]

        if bdf.empty:
            return {}

        row = bdf.iloc[0]
        meta = {}

        solar_cols = [
            "roof_area_m2", "usable_roof_m2", "n_panels",
            "eta_corrected", "effective_efficiency",
        ]
        for col in solar_cols:
            if col in row.index and pd.notna(row[col]):
                meta[col] = float(row[col])

        return meta
