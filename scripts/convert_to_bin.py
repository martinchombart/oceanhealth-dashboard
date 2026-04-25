#!/usr/bin/env python3
"""
Convert ocean data JSON files → compact binary (.bin) at 1° resolution.

Output binary format (little-endian, 32-byte header + data):
  float32  lon_min    float32  lon_step   int32  lon_n
  float32  lat_min    float32  lat_step   int32  lat_n
  float32  global_min float32  global_max
  float32[lon_n × lat_n]  row-major (lat outer, lon inner), NaN = no data

Size: 32 + 360×180×4 = ~253 KB per file  (vs ~6 MB JSON → 24× reduction)
"""
import json, struct, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from pathlib import Path
import numpy as np

# ── Output grid (1° resolution) ────────────────────────────────
OUT_STEP          = 1.0
OUT_LON_MIN       = -179.5
OUT_LAT_MIN       = -89.5
OUT_LON_N         = 360
OUT_LAT_N         = 180

# ── Input grid (0.5° — matches existing JSON files) ────────────
IN_STEP           = 0.5
IN_LON0           = -179.75
IN_LAT0           = -89.75
IN_LON_N          = 720
IN_LAT_N          = 360

DATA_DIR = Path("public/data")

VARS = {
    "temperature": "sst",
    "salinity":    "sal",
    "ph":          "ph",
    "chlorophyll": "chl",
    "oxygen":      "o2",
    "seaice":      "ice",
    "sealevel":    "ssl",
}
SEASONS = ["year", "spring", "summer", "fall", "winter"]


def json_to_bin(json_path: Path) -> Path:
    bin_path = json_path.with_suffix(".bin")

    with open(json_path) as f:
        obj = json.load(f)

    gmin = float(obj.get("global_min", float("nan")))
    gmax = float(obj.get("global_max", float("nan")))

    # Build 0.5° source grid
    src = np.full(IN_LON_N * IN_LAT_N, np.nan, dtype=np.float32)
    for p in obj["points"]:
        li = round((p["lon"] - IN_LON0) / IN_STEP)
        ai = round((p["lat"] - IN_LAT0) / IN_STEP)
        if 0 <= li < IN_LON_N and 0 <= ai < IN_LAT_N:
            src[ai * IN_LON_N + li] = p["v"]

    # Downsample 0.5° → 1° by averaging 2×2 blocks (nanmean ignores NaN)
    # Grid aligns perfectly: 1° centre = mean of 2 adjacent 0.5° centres
    with np.errstate(all="ignore"):
        g = src.reshape(IN_LAT_N, IN_LON_N).reshape(OUT_LAT_N, 2, OUT_LON_N, 2)
        out = np.nanmean(g, axis=(1, 3)).astype(np.float32)

    # Write binary
    header = struct.pack(
        "<ffiffiff",
        OUT_LON_MIN, OUT_STEP, OUT_LON_N,
        OUT_LAT_MIN, OUT_STEP, OUT_LAT_N,
        gmin, gmax,
    )
    with open(bin_path, "wb") as f:
        f.write(header)
        f.write(out.flatten().tobytes())

    return bin_path


def main():
    total, errors, skipped = 0, 0, 0
    for var, prefix in VARS.items():
        var_dir = DATA_DIR / var
        if not var_dir.exists():
            print(f"  skip {var} (dir not found)")
            continue
        print(f"\n── {var} ──")
        for year in range(1993, 2026):
            for season in SEASONS:
                jp = var_dir / f"{prefix}_{year}_{season}.json"
                if not jp.exists():
                    continue
                bp = jp.with_suffix(".bin")
                if bp.exists():
                    skipped += 1
                    continue
                try:
                    out = json_to_bin(jp)
                    kb = out.stat().st_size // 1024
                    print(f"  {jp.name} → {out.name}  ({kb} KB)")
                    total += 1
                except Exception as e:
                    print(f"  ERROR {jp.name}: {e}", file=sys.stderr)
                    errors += 1

    print(f"\nDone: {total} converted, {skipped} already existed, {errors} errors")
    if total > 0:
        size_mb = total * 253 // 1024
        print(f"Estimated new binary size: ~{size_mb} MB")
        print("Once verified, delete .json files to reclaim disk space.")


if __name__ == "__main__":
    main()
