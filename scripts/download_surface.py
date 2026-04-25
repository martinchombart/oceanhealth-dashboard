#!/usr/bin/env python3
"""
download_surface.py — Download all surface variables from Copernicus Marine
                      and save directly as .bin (no JSON intermediary).

Setup (once):
    pip install copernicusmarine xarray numpy
    copernicusmarine login

Usage:
    python scripts/download_surface.py              # full 1993-2025
    python scripts/download_surface.py --year 2025  # single year update
    python scripts/download_surface.py --from 2020  # from year onwards
    python scripts/download_surface.py --var temperature salinity

Outputs: public/data/<variable>/<prefix>_<year>_<season>.bin
Skips files that already exist — safe to resume after interruption.
"""
import sys, io, struct, argparse, itertools
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from pathlib import Path
import numpy as np

try:
    import copernicusmarine as cm
except ImportError:
    print("ERROR: pip install copernicusmarine"); sys.exit(1)
try:
    import xarray as xr
except ImportError:
    print("ERROR: pip install xarray"); sys.exit(1)

# ── Output grid (1 degree) ────────────────────────────────────
OUT_LON_MIN, OUT_LAT_MIN = -179.5, -89.5
OUT_LON_N,   OUT_LAT_N   = 360, 180
OUT_STEP = 1.0

DATA_DIR = Path("public/data")

# ── Variable definitions ──────────────────────────────────────
# dataset_id : CMEMS product identifier
# var        : NetCDF variable name inside the dataset
# depth      : True  → select shallowest depth level before averaging
#              False → 2D field, no depth dimension
VARIABLES = {
    "temperature": dict(
        prefix     = "sst",
        dataset_id = "cmems_mod_glo_phy_my_0.083deg_P1M-m",
        var        = "thetao",
        depth      = True,
    ),
    "salinity": dict(
        prefix     = "sal",
        dataset_id = "cmems_mod_glo_phy_my_0.083deg_P1M-m",
        var        = "so",
        depth      = True,
    ),
    "sealevel": dict(
        prefix     = "ssl",
        dataset_id = "cmems_mod_glo_phy_my_0.083deg_P1M-m",
        var        = "zos",
        depth      = False,
    ),
    "seaice": dict(
        prefix     = "ice",
        dataset_id = "cmems_mod_glo_phy_my_0.083deg_P1M-m",
        var        = "sithick",
        depth      = False,
    ),
    "ph": dict(
        prefix     = "ph",
        dataset_id = "cmems_mod_glo_bgc_my_0.25deg_P1M-m",
        var        = "ph",
        depth      = True,
    ),
    "chlorophyll": dict(
        prefix     = "chl",
        dataset_id = "cmems_mod_glo_bgc_my_0.25deg_P1M-m",
        var        = "chl",
        depth      = True,
    ),
    "oxygen": dict(
        prefix     = "o2",
        dataset_id = "cmems_mod_glo_bgc_my_0.25deg_P1M-m",
        var        = "o2",
        depth      = True,
    ),
}

SEASON_MONTHS = {
    "year":   list(range(1, 13)),
    "spring": [3, 4, 5],
    "summer": [6, 7, 8],
    "fall":   [9, 10, 11],
    "winter": [12, 1, 2],
}


# ── Binary serializer ─────────────────────────────────────────
def write_bin(path: Path, grid: np.ndarray, gmin: float, gmax: float):
    header = struct.pack(
        "<ffiffiff",
        OUT_LON_MIN, OUT_STEP, OUT_LON_N,
        OUT_LAT_MIN, OUT_STEP, OUT_LAT_N,
        float(gmin), float(gmax),
    )
    path.write_bytes(header + grid.astype(np.float32).flatten().tobytes())


# ── Resample any resolution → 1 degree ───────────────────────
def to_1deg(da: xr.DataArray) -> np.ndarray:
    """Area-average DataArray onto the 1° output grid."""
    # Normalise coordinate names
    rename = {}
    for old, new in [("longitude", "lon"), ("latitude", "lat")]:
        if old in da.coords:
            rename[old] = new
    if rename:
        da = da.rename(rename)

    lons = da.lon.values
    lats = da.lat.values
    vals = da.values.astype(np.float32)

    out = np.full((OUT_LAT_N, OUT_LON_N), np.nan, dtype=np.float32)
    for ai in range(OUT_LAT_N):
        lat_c  = OUT_LAT_MIN + ai * OUT_STEP
        lmask  = (lats >= lat_c - 0.5) & (lats < lat_c + 0.5)
        if not lmask.any():
            continue
        row = vals[lmask, :] if vals.ndim == 2 else vals
        for li in range(OUT_LON_N):
            lon_c = OUT_LON_MIN + li * OUT_STEP
            omask = (lons >= lon_c - 0.5) & (lons < lon_c + 0.5)
            block = row[:, omask] if row.ndim == 2 else row
            valid = block[~np.isnan(block)]
            if valid.size:
                out[ai, li] = float(np.mean(valid))
    return out


# ── Date helpers ──────────────────────────────────────────────
def date_ranges(year: int, season: str) -> list[tuple[str, str]]:
    months = SEASON_MONTHS[season]
    if season == "winter":
        return [
            (f"{year-1}-12-01", f"{year-1}-12-31"),
            (f"{year}-01-01",   f"{year}-02-28"),
        ]
    m0, m1 = months[0], months[-1]
    ends = {1:31,2:28,3:31,4:30,5:31,6:30,7:31,8:31,9:30,10:31,11:30,12:31}
    return [(f"{year}-{m0:02d}-01", f"{year}-{m1:02d}-{ends[m1]}")]


# ── Fetch one season ──────────────────────────────────────────
def fetch(cfg: dict, year: int, season: str) -> np.ndarray | None:
    arrays = []
    for start, end in date_ranges(year, season):
        kwargs = dict(
            dataset_id         = cfg["dataset_id"],
            variables          = [cfg["var"]],
            minimum_longitude  = -180,
            maximum_longitude  = 180,
            minimum_latitude   = -90,
            maximum_latitude   = 90,
            start_datetime     = start,
            end_datetime       = end,
        )
        if cfg["depth"]:
            # Surface = shallowest available level
            kwargs["minimum_depth"] = 0
            kwargs["maximum_depth"] = 1

        try:
            ds = cm.open_dataset(**kwargs)
            da = ds[cfg["var"]]
            # Drop depth dim if present (take first/only level)
            if "depth" in da.dims:
                da = da.isel(depth=0)
            # Time average
            if "time" in da.dims:
                da = da.mean(dim="time")
            arrays.append(da)
        except Exception as e:
            print(f"    WARNING {start}~{end}: {e}")

    if not arrays:
        return None
    combined = arrays[0] if len(arrays) == 1 else xr.concat(arrays, dim="time").mean(dim="time")
    return to_1deg(combined)


# ── Main ──────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year",  type=int, help="Single year to download")
    parser.add_argument("--from",  dest="from_year", type=int, default=1993)
    parser.add_argument("--to",    dest="to_year",   type=int, default=2025)
    parser.add_argument("--var",   nargs="+", choices=list(VARIABLES), default=list(VARIABLES))
    args = parser.parse_args()

    years = [args.year] if args.year else range(args.from_year, args.to_year + 1)

    done = skip = err = 0
    for var_name in args.var:
        cfg     = VARIABLES[var_name]
        out_dir = DATA_DIR / var_name
        out_dir.mkdir(parents=True, exist_ok=True)
        print(f"\n=== {var_name} ({cfg['dataset_id']}) ===")

        for year, season in itertools.product(years, SEASON_MONTHS):
            fname = f"{cfg['prefix']}_{year}_{season}.bin"
            fpath = out_dir / fname
            if fpath.exists():
                skip += 1
                continue

            print(f"  {fname} ...", end=" ", flush=True)
            try:
                grid = fetch(cfg, year, season)
                if grid is None:
                    print("no data"); err += 1; continue
                valid = grid[~np.isnan(grid)]
                gmin = float(valid.min()) if valid.size else float("nan")
                gmax = float(valid.max()) if valid.size else float("nan")
                write_bin(fpath, grid, gmin, gmax)
                print(f"ok  ({fpath.stat().st_size // 1024} KB)")
                done += 1
            except Exception as e:
                print(f"ERROR: {e}"); err += 1

    print(f"\nDone: {done} created, {skip} skipped, {err} errors")


if __name__ == "__main__":
    main()
