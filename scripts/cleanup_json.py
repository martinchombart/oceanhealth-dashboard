#!/usr/bin/env python3
"""
cleanup_json.py — Run AFTER convert_to_bin.py is complete.

What it does:
  1. Verifies every .bin file exists and has a valid size (>= 200 KB).
  2. Saves ONE .json sample per variable in public/data/backup/ (format reference).
  3. Deletes all .json data files that have a verified .bin counterpart.

Run with --dry-run first to preview without deleting anything.
"""
import sys, shutil, struct, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from pathlib import Path

DATA_DIR   = Path("public/data")
BACKUP_DIR = DATA_DIR / "backup"

# Minimum acceptable binary file size (1° grid = 253 KB, allow some margin)
MIN_BIN_BYTES = 200_000

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

DRY_RUN = "--dry-run" in sys.argv


def verify_bin(path: Path) -> bool:
    """Check file exists, has right size, and header is plausible."""
    if not path.exists():
        return False
    if path.stat().st_size < MIN_BIN_BYTES:
        return False
    try:
        with open(path, "rb") as f:
            raw = f.read(32)
        if len(raw) < 32:
            return False
        lon_n = struct.unpack_from("<i", raw, 8)[0]
        lat_n = struct.unpack_from("<i", raw, 20)[0]
        # For 1° grid: 360×180; for 0.5° fallback: 720×360
        return lon_n in (360, 720) and lat_n in (180, 360)
    except Exception:
        return False


def main():
    if DRY_RUN:
        print("=== DRY RUN — nothing will be deleted ===\n")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    total_ok = 0
    total_missing = 0
    total_deleted = 0
    total_bytes = 0

    for var, prefix in VARS.items():
        var_dir = DATA_DIR / var
        if not var_dir.exists():
            continue

        print(f"\n── {var} ──")
        saved_sample = False

        for year in range(1993, 2026):
            for season in SEASONS:
                jp = var_dir / f"{prefix}_{year}_{season}.json"
                bp = jp.with_suffix(".bin")

                if not jp.exists():
                    continue

                if not verify_bin(bp):
                    print(f"  [SKIP] {jp.name} — .bin missing or invalid")
                    total_missing += 1
                    continue

                # Save one sample per variable as backup reference
                if not saved_sample:
                    dest = BACKUP_DIR / f"{prefix}_sample.json"
                    if not dest.exists():
                        shutil.copy2(jp, dest)
                        print(f"  [BACKUP] {jp.name} → backup/{dest.name}")
                    saved_sample = True

                # Delete the JSON
                size = jp.stat().st_size
                total_bytes += size
                total_ok += 1
                if DRY_RUN:
                    print(f"  [WOULD DELETE] {jp.name}  ({size // 1024} KB)")
                else:
                    jp.unlink()
                    total_deleted += 1

        if not saved_sample:
            print(f"  [WARNING] No .bin files verified — no JSON deleted for {var}")

    mb = total_bytes // 1_000_000
    print(f"\n{'DRY RUN summary' if DRY_RUN else 'Done'}:")
    print(f"  Verified .bin files : {total_ok}")
    print(f"  Missing/invalid .bin: {total_missing}")
    if DRY_RUN:
        print(f"  Would free          : ~{mb} MB")
    else:
        print(f"  JSON files deleted  : {total_deleted}")
        print(f"  Freed               : ~{mb} MB")
        print(f"  Samples kept in     : {BACKUP_DIR}/")


if __name__ == "__main__":
    main()
