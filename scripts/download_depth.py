#!/usr/bin/env python3
"""
download_depth.py — Download GLORYS12 data at depth levels and convert to .bin

Requires: pip install copernicusmarine numpy
Credentials: run `copernicusmarine login` once before this script.

Depth levels produced: 100m, 500m, 1000m
Variables: temperature (thetao), salinity (so), oxygen (o2), pH (ph)

File naming: sst_2024_year_100m.bin, sal_2024_spring_500m.bin, etc.

Approximate closest GLORYS12 depth levels (m):
  100m  -> depth index ~21  (actual: ~96.9 m)
  500m  -> depth index ~34  (actual: ~496.9 m)
  1000m -> depth index ~38  (actual: ~997.0 m)

Runtime: ~2-4 hours depending on connection. Can resume — already-converted
files are skipped.
"""
import sys, io, struct, itertools
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from pathlib import Path
import numpy as np

try:
    import copernicusmarine as cm
except ImportError:
    print("ERROR: copernicusmarine not installed.")
    print("  pip install copernicusmarine")
    sys.exit(1)

try:
    import xarray as xr
except ImportError:
    print("ERROR: xarray not installed.")
    print("  pip install xarray")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────
DATA_DIR = Path("public/data")

DEPTH_TARGETS = {
    "100m":  96.9,
    "500m":  496.9,
    "1000m": 997.0,
}

# CMEMS variable names, datasets, and local prefixes.
# Physics (GLORYS12, 1/12°) for temperature & salinity.
# Biogeochemistry (PISCES, 1/4°) for oxygen & pH.
PHY_DATASET = "cmems_mod_glo_phy_my_0.083deg_P1M-m"
BGC_DATASET = "cmems_mod_glo_bgc_my_0.25deg_P1M-m"

DEPTH_VARS = {
    "temperature": {"cmems_var": "thetao", "prefix": "sst", "subdir": "temperature", "dataset_id": PHY_DATASET},
    "salinity":    {"cmems_var": "so",     "prefix": "sal", "subdir": "salinity",    "dataset_id": PHY_DATASET},
    "oxygen":      {"cmems_var": "o2",     "prefix": "o2",  "subdir": "oxygen",      "dataset_id": BGC_DATASET},
    "ph":          {"cmems_var": "ph",     "prefix": "ph",  "subdir": "ph",          "dataset_id": BGC_DATASET},
}

SEASON_MONTHS = {
    "year":   list(range(1, 13)),
    "spring": [3, 4, 5],
    "summer": [6, 7, 8],
    "fall":   [9, 10, 11],
    "winter": [12, 1, 2],
}

YEAR_MIN, YEAR_MAX = 1993, 2025

# Output 1-degree grid
OUT_LON_MIN, OUT_LAT_MIN = -179.5, -89.5
OUT_LON_N,   OUT_LAT_N   = 360, 180
OUT_STEP = 1.0


def to_bin(grid_2d: np.ndarray, gmin: float, gmax: float) -> bytes:
    """Serialize a (LAT_N, LON_N) float32 grid to the dashboard binary format."""
    header = struct.pack(
        "<ffiffiff",
        OUT_LON_MIN, OUT_STEP, OUT_LON_N,
        OUT_LAT_MIN, OUT_STEP, OUT_LAT_N,
        gmin, gmax,
    )
    return header + grid_2d.astype(np.float32).flatten().tobytes()


def resample_to_1deg(da: xr.DataArray) -> np.ndarray:
    """Resample any resolution DataArray to 1-degree grid via averaging."""
    # Coarsen to 1° — works for any input resolution
    out = np.full((OUT_LAT_N, OUT_LON_N), np.nan, dtype=np.float32)
    lons = da.coords.get("longitude", da.coords.get("lon", None))
    lats = da.coords.get("latitude",  da.coords.get("lat", None))
    vals = da.values.astype(np.float32)

    for ai in range(OUT_LAT_N):
        lat_c = OUT_LAT_MIN + ai * OUT_STEP
        lat_mask = (lats.values >= lat_c - 0.5) & (lats.values < lat_c + 0.5)
        if not lat_mask.any():
            continue
        for li in range(OUT_LON_N):
            lon_c = OUT_LON_MIN + li * OUT_STEP
            lon_mask = (lons.values >= lon_c - 0.5) & (lons.values < lon_c + 0.5)
            block = vals[np.ix_(lat_mask, lon_mask)] if vals.ndim == 2 else vals
            valid = block[~np.isnan(block)]
            if valid.size > 0:
                out[ai, li] = float(np.mean(valid))
    return out


def fetch_season(var_cfg: dict, depth_label: str, depth_m: float,
                 year: int, season: str) -> np.ndarray | None:
    """Download one dataset from Copernicus and return a 1° grid."""
    months = SEASON_MONTHS[season]

    # Build date ranges (handle winter spanning two years)
    if season == "winter":
        date_ranges = [
            (f"{year-1}-12-01", f"{year-1}-12-31"),
            (f"{year}-01-01",   f"{year}-02-28"),
        ]
    else:
        m_start, m_end = months[0], months[-1]
        date_ranges = [(f"{year}-{m_start:02d}-01", f"{year}-{m_end:02d}-30")]

    arrays = []
    for start, end in date_ranges:
        try:
            ds = cm.open_dataset(
                dataset_id=var_cfg["dataset_id"],
                variables=[var_cfg["cmems_var"]],
                minimum_longitude=-180,
                maximum_longitude=180,
                minimum_latitude=-90,
                maximum_latitude=90,
                minimum_depth=depth_m - 20,
                maximum_depth=depth_m + 20,
                start_datetime=start,
                end_datetime=end,
            )
            da = ds[var_cfg["cmems_var"]]
            # Select closest depth level
            da = da.sel(depth=depth_m, method="nearest")
            # Time mean over the period
            da = da.mean(dim="time")
            arrays.append(da)
        except Exception as e:
            print(f"    WARNING fetch {start}~{end}: {e}")

    if not arrays:
        return None

    if len(arrays) == 1:
        combined = arrays[0]
    else:
        combined = xr.concat(arrays, dim="time").mean(dim="time")

    return resample_to_1deg(combined)


def main():
    years   = range(YEAR_MIN, YEAR_MAX + 1)
    seasons = list(SEASON_MONTHS.keys())

    total_done, total_skip, total_err = 0, 0, 0

    for var_name, var_cfg in DEPTH_VARS.items():
        out_dir = DATA_DIR / var_cfg["subdir"]
        out_dir.mkdir(parents=True, exist_ok=True)

        for depth_label, depth_m in DEPTH_TARGETS.items():
            print(f"\n=== {var_name} @ {depth_label} ===")

            for year, season in itertools.product(years, seasons):
                fname = f"{var_cfg['prefix']}_{year}_{season}_{depth_label}.bin"
                fpath = out_dir / fname

                if fpath.exists():
                    total_skip += 1
                    continue

                print(f"  {fname} ...", end=" ", flush=True)
                try:
                    grid = fetch_season(var_cfg, depth_label, depth_m, year, season)
                    if grid is None:
                        print("no data")
                        total_err += 1
                        continue

                    valid = grid[~np.isnan(grid)]
                    gmin = float(valid.min()) if valid.size else float("nan")
                    gmax = float(valid.max()) if valid.size else float("nan")

                    fpath.write_bytes(to_bin(grid, gmin, gmax))
                    print(f"ok ({fpath.stat().st_size // 1024} KB)")
                    total_done += 1

                except Exception as e:
                    print(f"ERROR: {e}")
                    total_err += 1

    print(f"\nDone: {total_done} created, {total_skip} skipped, {total_err} errors")


if __name__ == "__main__":
    main()
