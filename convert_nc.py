"""
Ocean Health Dashboard — CMEMS Live Fetcher
===========================================
Interroge l'API CMEMS directement. Aucun fichier .nc stocké localement.
Sortie : public/data/{variable}/{prefix}_{year}_{season}.json

── SETUP (une fois) ──────────────────────────────────────────────────
    pip install copernicusmarine xarray numpy scipy
    copernicusmarine login          # stocke les credentials localement

── USAGE ─────────────────────────────────────────────────────────────
    python convert_nc.py                     # tous les fichiers manquants
    python convert_nc.py --only-new          # seulement les mois récents (cron)
    python convert_nc.py --var temperature   # une seule variable
    python convert_nc.py --probe             # inspecte les datasets CMEMS
    python convert_nc.py --probe --var ph    # inspecte un dataset précis
    python convert_nc.py --delay 5           # pause 5s entre chaque fichier (réseau instable)
    python convert_nc.py --delay 0           # sans pause (réseau stable)

── CI / GITHUB ACTIONS ───────────────────────────────────────────────
    Variables d'environnement attendues :
        COPERNICUSMARINE_SERVICE_USERNAME
        COPERNICUSMARINE_SERVICE_PASSWORD
"""

import os, json, argparse, sys, time
from pathlib import Path
from datetime import datetime
import numpy as np
from scipy.interpolate import RegularGridInterpolator
from tqdm import tqdm

try:
    import psutil
    proc = psutil.Process()
    proc.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)   # Windows : priorité basse CPU
    proc.ionice(psutil.IOPRIO_LOW)                  # Windows : priorité basse disque
    print("  [Priorité] CPU et I/O disque réglés sur 'inférieure à la normale'")
except Exception:
    pass  # psutil absent ou droits insuffisants -> on continue normalement

# ─── CONFIG ──────────────────────────────────────────────────────────

OUT_DIR    = Path("public/data")
RESOLUTION = 0.5                        # résolution de sortie en degrés
YEAR_END   = datetime.now().year        # automatiquement à jour

SEASONS = {
    "year":   list(range(1, 13)),
    "spring": [3, 4, 5],
    "summer": [6, 7, 8],
    "fall":   [9, 10, 11],
    "winter": [12, 1, 2],
}

# ─── DATASETS CMEMS ──────────────────────────────────────────────────
# IDs vérifiables sur : https://data.marine.copernicus.eu
# En cas d'erreur "dataset not found", lancer :
#   python convert_nc.py --probe --var <variable>

DATASETS = {
    "temperature": {
        "dataset_id":   "cmems_mod_glo_phy_my_0.083deg_P1M-m",
        "variable":     "thetao",
        "prefix":       "sst",
        "unit":         "C",
        "year_min":     1993,       # GLORYS12 reanalyse depuis 1993
        "depth_min":    0.0,
        "depth_max":    1.0,
        "unit_offset":  0,          # deja en Celsius
        "domain":       [-2, 32],
    },
    "salinity": {
        "dataset_id":   "cmems_mod_glo_phy_my_0.083deg_P1M-m",
        "variable":     "so",
        "prefix":       "sal",
        "unit":         "PSU",
        "year_min":     1993,       # GLORYS12 depuis 1993
        "depth_min":    0.0,
        "depth_max":    1.0,
        "unit_offset":  0,
        "domain":       [30, 40],
    },
    "ph": {
        "dataset_id":   "cmems_mod_glo_bgc_my_0.25deg_P1M-m",
        "variable":     "ph",
        "prefix":       "ph",
        "unit":         "pH",
        "year_min":     1993,       # modèle PISCES depuis 1993
        "depth_min":    0.0,
        "depth_max":    1.0,
        "unit_offset":  0,
        "domain":       [7.75, 8.25],
    },
    "chlorophyll": {
        "dataset_id":   "cmems_mod_glo_bgc_my_0.25deg_P1M-m",
        "variable":     "chl",
        "prefix":       "chl",
        "unit":         "mg/m3",
        "year_min":     1993,       # modele PISCES depuis 1993
        "depth_min":    0.0,
        "depth_max":    1.0,
        "unit_offset":  0,
        "domain":       [0, 3],
    },
    "oxygen": {
        "dataset_id":   "cmems_mod_glo_bgc_my_0.25deg_P1M-m",
        "variable":     "o2",
        "prefix":       "o2",
        "unit":         "mmol/m3",
        "year_min":     1993,       # modele PISCES depuis 1993
        "depth_min":    0.0,
        "depth_max":    1.0,
        "unit_offset":  0,
        "domain":       [150, 350],
    },
    "seaice": {
        "dataset_id":   "cmems_mod_glo_phy_my_0.083deg_P1M-m",
        "variable":     "sithick",
        "prefix":       "ice",
        "unit":         "m",
        "year_min":     1993,       # GLORYS12 depuis 1993
        "depth_min":    None,
        "depth_max":    None,
        "unit_offset":  0,
        "domain":       [0, 4],
    },
    "sealevel": {
        "dataset_id":   "cmems_mod_glo_phy_my_0.083deg_P1M-m",
        "variable":     "zos",
        "prefix":       "ssl",
        "unit":         "m",
        "year_min":     1993,       # GLORYS12 depuis 1993
        "depth_min":    None,
        "depth_max":    None,
        "unit_offset":  0,
        "domain":       [-1.5, 1.5],
    },
}

# ─── HELPERS ─────────────────────────────────────────────────────────

def ensure(path):
    Path(path).mkdir(parents=True, exist_ok=True)

def write_json(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    kb = os.path.getsize(path) / 1024
    print(f"    -> {path}  ({kb:.0f} KB)")

def resample_to_grid(data_2d, src_lats, src_lons):
    """Rééchantillonne vers une grille régulière RESOLUTION°."""
    if src_lats[0] > src_lats[-1]:
        data_2d  = data_2d[::-1, :]
        src_lats = src_lats[::-1]

    if src_lons.max() > 180:
        split    = np.searchsorted(src_lons, 180)
        src_lons = np.concatenate([src_lons[split:] - 360, src_lons[:split]])
        data_2d  = np.concatenate([data_2d[:, split:], data_2d[:, :split]], axis=1)

    src_lons = np.append(src_lons, 180.0)
    data_2d  = np.concatenate([data_2d, data_2d[:, :1]], axis=1)

    out_lats = np.arange(-90  + RESOLUTION / 2, 90,  RESOLUTION)
    out_lons = np.arange(-180 + RESOLUTION / 2, 180, RESOLUTION)

    nan_mask = np.isnan(data_2d)
    filled   = np.where(nan_mask, 0.0, data_2d)
    mask_f   = nan_mask.astype(float)

    id_ = RegularGridInterpolator(
        (src_lats, src_lons), filled,
        method="linear", bounds_error=False, fill_value=np.nan,
    )
    im_ = RegularGridInterpolator(
        (src_lats, src_lons), mask_f,
        method="linear", bounds_error=False, fill_value=1.0,
    )

    gl, gla = np.meshgrid(out_lons, out_lats)
    pts     = np.column_stack([gla.ravel(), gl.ravel()])
    vals    = id_(pts).reshape(len(out_lats), len(out_lons))
    masks   = im_(pts).reshape(len(out_lats), len(out_lons))
    vals[masks > 0.5] = np.nan
    return out_lats, out_lons, vals

def to_points(lats, lons, data_2d):
    """Convertit un array 2D en liste [{lon, lat, v}] (sans NaN)."""
    pts = []
    for i, lat in enumerate(lats):
        for j, lon in enumerate(lons):
            v = data_2d[i, j]
            if not np.isnan(v):
                pts.append({
                    "lon": round(float(lon), 2),
                    "lat": round(float(lat), 2),
                    "v":   round(float(v),   3),
                })
    return pts

DOWNLOAD_SEASONS = ["spring", "summer", "fall", "winter"]

def missing_files(var_name, cfg, year_start):
    """Retourne la liste des (year, season) dont le JSON est absent (hors 'year')."""
    out  = OUT_DIR / var_name
    missing = []
    for year in range(year_start, YEAR_END + 1):
        for sname in DOWNLOAD_SEASONS:
            p = out / f"{cfg['prefix']}_{year}_{sname}.json"
            if not p.exists():
                missing.append((year, sname))
    return missing

def compute_year_from_seasons(var_name, cfg, year):
    """Calcule le JSON annuel comme moyenne des 4 saisons (sans téléchargement)."""
    out    = OUT_DIR / var_name
    prefix = cfg["prefix"]
    path_year = out / f"{prefix}_{year}_year.json"
    if path_year.exists():
        return

    season_files = [out / f"{prefix}_{year}_{s}.json" for s in DOWNLOAD_SEASONS]
    if not all(f.exists() for f in season_files):
        return  # pas encore toutes les saisons

    # Moyenne des v par (lon, lat) sur les 4 saisons
    totals, counts = {}, {}
    for sf in season_files:
        with open(sf) as f:
            data = json.load(f)
        for pt in data["points"]:
            key = (pt["lon"], pt["lat"])
            totals[key] = totals.get(key, 0.0) + pt["v"]
            counts[key] = counts.get(key, 0) + 1

    pts = [
        {"lon": lon, "lat": lat, "v": round(totals[(lon, lat)] / counts[(lon, lat)], 3)}
        for lon, lat in totals
    ]
    vals = [p["v"] for p in pts]
    write_json(path_year, {
        "variable":   var_name,
        "year":       year,
        "season":     "year",
        "unit":       cfg["unit"],
        "source":     cfg["dataset_id"],
        "global_min": round(min(vals), 3),
        "global_max": round(max(vals), 3),
        "points":     pts,
    })
    print(f"    -> Année {year} calculée localement depuis les 4 saisons")

# ─── PROBE ───────────────────────────────────────────────────────────

def probe(var_name=None):
    """Inspecte les datasets CMEMS pour vérifier IDs et noms de variables."""
    import copernicusmarine
    targets = {var_name: DATASETS[var_name]} if var_name else DATASETS
    for name, cfg in targets.items():
        print(f"\n{'='*60}")
        print(f"  {name.upper()}  —  {cfg['dataset_id']}")
        print(f"{'='*60}")
        try:
            kwargs = dict(
                dataset_id=cfg["dataset_id"],
                variables=[cfg["variable"]],
                minimum_longitude=-5, maximum_longitude=5,
                minimum_latitude=-5,  maximum_latitude=5,
                start_datetime="2020-01-01",
                end_datetime="2020-03-01",
            )
            if cfg["depth_min"] is not None:
                kwargs["minimum_depth"] = cfg["depth_min"]
                kwargs["maximum_depth"] = cfg["depth_max"]

            ds = copernicusmarine.open_dataset(**kwargs)
            print(f"  [OK] Dataset accessible")
            print(f"  Variables : {list(ds.data_vars)}")
            print(f"  Coords    : {list(ds.coords)}")
            print(f"  Dims      : {dict(ds.dims)}")
            for vname in ds.data_vars:
                vr = ds[vname]
                print(f"  [{vname}] shape={vr.shape}  dtype={vr.dtype}")
            ds.close()
        except Exception as e:
            print(f"  [ERR] Erreur : {e}")
            print(f"  -> Verifie l'ID sur https://data.marine.copernicus.eu")

# ─── CONVERSION ──────────────────────────────────────────────────────

def fetch_with_retry(sel, time_name, max_retries=5, base_delay=10):
    """Télécharge les données avec retry exponentiel en cas d'erreur réseau."""
    for attempt in range(max_retries):
        try:
            return sel.mean(dim=time_name).values.squeeze()
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait = base_delay * (2 ** attempt)
            print(f"\n  ! Erreur réseau (tentative {attempt+1}/{max_retries}), reprise dans {wait}s : {e}")
            time.sleep(wait)


def convert_variable(var_name, only_new=False, delay=2):
    import copernicusmarine

    cfg        = DATASETS[var_name]
    year_start = cfg["year_min"]
    out        = OUT_DIR / var_name
    ensure(out)

    to_do = missing_files(var_name, cfg, year_start)
    if not to_do:
        print(f"  [{var_name}] Tout est déjà à jour.")
        return

    if only_new:
        # Garde seulement les fichiers des 2 dernières années
        cutoff = YEAR_END - 1
        to_do  = [(y, s) for y, s in to_do if y >= cutoff]
        if not to_do:
            print(f"  [{var_name}] Aucun nouveau fichier.")
            return

    years_needed = sorted(set(y for y, _ in to_do))
    total = len(to_do)
    print(f"\n[{var_name}] {total} fichiers à générer ({years_needed[0]}–{years_needed[-1]})")

    # Ouvre le dataset lazily (rien téléchargé)
    print(f"  Connexion CMEMS ...")
    try:
        kwargs = dict(
            dataset_id=cfg["dataset_id"],
            variables=[cfg["variable"]],
        )
        if cfg["depth_min"] is not None:
            kwargs["minimum_depth"] = cfg["depth_min"]
            kwargs["maximum_depth"] = cfg["depth_max"]

        ds = copernicusmarine.open_dataset(**kwargs)
    except Exception as e:
        print(f"  [ERR] Impossible d'ouvrir le dataset : {e}")
        print(f"  -> Lance : python convert_nc.py --probe --var {var_name}")
        return

    var = ds[cfg["variable"]]

    # Détecte les noms de coordonnées (lat/lon/time varient selon les datasets)
    lat_name  = next((c for c in ["latitude",  "lat"]  if c in ds.coords), None)
    lon_name  = next((c for c in ["longitude", "lon"]  if c in ds.coords), None)
    time_name = next((c for c in ["time", "valid_time"] if c in ds.coords), None)

    if not lat_name or not lon_name:
        print(f"  [ERR] Coordonnees lat/lon introuvables : {list(ds.coords)}")
        ds.close(); return

    print(f"  Coords : time={time_name}, lat={lat_name}, lon={lon_name}\n")

    # Filtre depth si présente
    if "depth" in var.dims and cfg["depth_min"] is not None:
        var = var.isel(depth=0)

    done = 0
    bar = tqdm(total=total, unit="fichier", ncols=72,
               bar_format="  {l_bar}{bar}| {n}/{total} [{elapsed}<{remaining}]")

    for year in years_needed:
        seasons_for_year = [s for y, s in to_do if y == year]

        try:
            if time_name:
                year_data = var.sel(
                    {time_name: var[time_name].dt.year.isin([year - 1, year])}
                )
            else:
                year_data = var

            for sname in seasons_for_year:
                months = SEASONS[sname]
                bar.set_description(f"  {year} {sname:<6}")

                try:
                    if sname == "winter":
                        dec = year_data.sel(
                            {time_name: (year_data[time_name].dt.year == year - 1) &
                                        (year_data[time_name].dt.month == 12)}
                        )
                        jf  = year_data.sel(
                            {time_name: (year_data[time_name].dt.year == year) &
                                        (year_data[time_name].dt.month.isin([1, 2]))}
                        )
                        import xarray as xr
                        sel = xr.concat([dec, jf], dim=time_name) if len(dec[time_name]) > 0 else jf
                    else:
                        sel = year_data.sel(
                            {time_name: (year_data[time_name].dt.year == year) &
                                        (year_data[time_name].dt.month.isin(months))}
                        )

                    if len(sel[time_name]) == 0:
                        bar.write(f"  {year} {sname} ... pas de données")
                        bar.update(1)
                        continue

                    mean2d = fetch_with_retry(sel, time_name)
                    if mean2d.ndim > 2:
                        mean2d = mean2d[0]

                    offset = cfg.get("unit_offset", 0)
                    if offset:
                        mean2d = mean2d + offset

                    lats   = ds[lat_name].values
                    lons   = ds[lon_name].values

                    rlats, rlons, rdata = resample_to_grid(mean2d, lats, lons)
                    pts = to_points(rlats, rlons, rdata)

                    path = out / f"{cfg['prefix']}_{year}_{sname}.json"
                    write_json(path, {
                        "variable":   var_name,
                        "year":       year,
                        "season":     sname,
                        "unit":       cfg["unit"],
                        "source":     cfg["dataset_id"],
                        "global_min": round(float(np.nanmin(rdata)), 3),
                        "global_max": round(float(np.nanmax(rdata)), 3),
                        "points":     pts,
                    })
                    done += 1
                    bar.update(1)
                    if delay > 0:
                        time.sleep(delay)

                except Exception as e:
                    bar.write(f"  {year} {sname} ... ERREUR : {e}")
                    bar.update(1)

        except Exception as e:
            bar.write(f"  {year} ... ERREUR année : {e}")

        compute_year_from_seasons(var_name, cfg, year)

    bar.close()
    ds.close()
    print(f"\n[{var_name}] {done}/{total} fichiers générés.")

# ─── INDEX ───────────────────────────────────────────────────────────

def build_index():
    print("\n[Index] Mise à jour de index.json ...")
    idx = {}
    for var in DATASETS:
        d = OUT_DIR / var
        if d.exists():
            idx[var] = sorted(f.name for f in d.glob("*.json"))
    write_json(OUT_DIR / "index.json", idx)

# ─── MAIN ────────────────────────────────────────────────────────────

def main():
    p = argparse.ArgumentParser(description="Ocean Dashboard — CMEMS fetcher")
    p.add_argument("--var",      choices=list(DATASETS), help="Une seule variable")
    p.add_argument("--only-new", action="store_true",    help="Seulement les données récentes (cron)")
    p.add_argument("--probe",    action="store_true",    help="Inspecte les datasets sans générer")
    p.add_argument("--delay",    type=float, default=2,  help="Pause (secondes) entre chaque fichier (défaut: 2)")
    args = p.parse_args()

    if args.probe:
        probe(args.var)
        return

    print("=" * 60)
    print("  Ocean Health Dashboard — CMEMS Fetcher")
    print(f"  Résolution : {RESOLUTION}°   Jusqu'à : {YEAR_END}")
    if args.only_new:
        print("  Mode : only-new (cron)")
    print("=" * 60)

    ensure(OUT_DIR)
    targets = [args.var] if args.var else list(DATASETS)
    for var in targets:
        convert_variable(var, only_new=args.only_new, delay=args.delay)

    build_index()
    print("\n[OK] Termine.")

if __name__ == "__main__":
    main()
