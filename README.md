# Ocean Health Dashboard

## Setup in 5 steps

### 1. Extract this ZIP into your project folder
Replace everything in `C:\Users\marti\Documents\OceanDashboard\ocean-dashboard\`

### 2. Add your Mapbox token
Open `src/config.js` → replace `YOUR_MAPBOX_TOKEN_HERE` with your token.
Get one free at https://account.mapbox.com

### 3. Download data files (place them exactly here)

| File | Download URL | Save to |
|------|-------------|---------|
| Temperature | https://downloads.psl.noaa.gov/Datasets/noaa.ersst.v5/sst.mnmean.nc | `data/raw/temperature/sst.mnmean.nc` |
| Salinity | https://www.ncei.noaa.gov/thredds-ocean/fileServer/ncei/woa/salinity/decav/1.00/woa23_decav_s00_01.nc | `data/raw/salinity/woa23_salinity_annual.nc` |
| pH (SOCAT) | https://socat.info/socat_files/v2023/SOCATv2023_tracks_gridded_monthly.nc.zip → unzip → rename | `data/raw/ph/socat_gridded_2023.nc` |

### 4. Convert data (run once in terminal)
```
pip install xarray netCDF4 numpy scipy
python convert_nc.py
```
Takes ~5–10 min. Creates `public/data/` with one JSON per year/season.

### 5. Run the app
```
npm install
npm run dev
```
Open http://localhost:5173

---
## Tip — smaller files to test faster
In `convert_nc.py`, set `RESOLUTION = 2.0` for a quick test run (~25 MB total),
then switch to `1.0` for the final version.
