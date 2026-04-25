// ================================================================
//  config.js  —  Central app configuration
//  Set VITE_MAPBOX_TOKEN in .env.local (dev) and Vercel (prod).
// ================================================================

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

export const YEAR_MIN     = 1993   // GLORYS12 reanalysis starts 1993
export const YEAR_MAX     = 2025
export const DEFAULT_YEAR = 2025

// Data origin. Dev: '/data' served by Vite from public/data.
// Prod: set VITE_DATA_BASE in Vercel to the R2 public URL.
export const DATA_BASE = (import.meta.env.VITE_DATA_BASE || '/data').replace(/\/$/, '')

export const MAP_CONFIG = {
  style:      'mapbox://styles/mapbox/dark-v11',
  center:     [0, 15],
  zoom:       1.7,
  minZoom:    1,
  maxZoom:    9,
  projection: 'globe',
}

// ── VARIABLE DEFINITIONS ──────────────────────────────────────
// Each entry drives the color scale, legend, panel, cursor and
// data file naming conventions simultaneously.

export const VARIABLES = {

  temperature: {
    label:      'Sea Surface Temperature',
    depthLevels: ['surface', '100m', '500m', '1000m'],
    unit:       '°C',
    filePrefix: 'sst',
    domain:     [-2, 32],
    midLabel:   '15°C',
    // Color stops: [data_value, css_color]  (anchored to 2024 range)
    colorStops: [
      [-2,  '#001e6e'],
      [ 4,  '#0050be'],
      [10,  '#00aad2'],
      [16,  '#50d2b4'],
      [22,  '#ffd732'],
      [28,  '#ff8200'],
      [32,  '#d21414'],
    ],
    // Difference color stops (symmetric, 0 = no change)
    compareRange: [-3, 3],
    diffStops: [
      [-3,  '#143cc8'],
      [-1,  '#3c8cdc'],
      [-0.3,'#a0d2e6'],
      [ 0,  '#f5f5f5'],
      [ 0.3,'#f0c878'],
      [ 1,  '#e66e14'],
      [ 3,  '#c81414'],
    ],
    gradient: 'linear-gradient(90deg,#001e6e,#0050be,#00aad2,#50d2b4,#ffd732,#ff8200,#d21414)',
    diffGrad: 'linear-gradient(90deg,#143cc8,#3c8cdc,#a0d2e6,#f5f5f5,#f0c878,#e66e14,#c81414)',
    accent: '#ff6b35',
    importance: 'Sea Surface Temperature (SST) is the primary engine of global climate systems. It drives evaporation, storm intensity, ocean stratification, and marine ecosystem dynamics. A single degree of warming above seasonal averages can trigger mass coral bleaching events and permanently disrupt fish migration routes.',
    interpret:  'Warm tones (orange → red) indicate waters above the long-term 2024 baseline. Deep blues mark colder zones: Arctic, Antarctic and coastal upwellings. In Compare mode, red = the ocean warmed between the selected years; blue = it cooled.',
    sources:    ['NOAA ERSSTv5', 'Copernicus Marine (CMEMS)', 'HadSST4', 'Argo Float Network'],
    stats: [
      { label: 'Global SST anomaly (2024)', value: '+1.44°C' },
      { label: 'Rate of warming',           value: '+0.13°C / decade' },
      { label: 'Warmest year on record',    value: '2024' },
      { label: 'Coral bleaching threshold', value: '+1°C above seasonal mean' },
    ],
  },

  salinity: {
    label:      'Sea Surface Salinity',
    depthLevels: ['surface', '100m', '500m', '1000m'],
    unit:       'PSU',
    filePrefix: 'sal',
    domain:     [30, 40],
    midLabel:   '35 PSU',
    colorStops: [
      [30, '#003ca0'],
      [32, '#0078c8'],
      [34, '#14c8a0'],
      [36, '#00d264'],
      [38, '#009650'],
      [40, '#006432'],
    ],
    compareRange: [-1.5, 1.5],
    diffStops: [
      [-1.5, '#143cc8'],
      [-0.4, '#3c8cdc'],
      [-0.1, '#a0d2e6'],
      [ 0,   '#f5f5f5'],
      [ 0.1, '#f0c878'],
      [ 0.4, '#e66e14'],
      [ 1.5, '#c81414'],
    ],
    gradient: 'linear-gradient(90deg,#003ca0,#0078c8,#14c8a0,#00d264,#009650,#006432)',
    diffGrad: 'linear-gradient(90deg,#143cc8,#3c8cdc,#a0d2e6,#f5f5f5,#f0c878,#e66e14,#c81414)',
    accent: '#00c9a7',
    importance: 'Salinity drives thermohaline circulation, the ocean "conveyor belt" that redistributes heat and oxygen globally. As polar ice melts, freshwater input is reducing salinity at high latitudes, threatening to slow or collapse this circulation with potentially catastrophic climate consequences for Europe and North America.',
    interpret:  'Deep blues signal low-salinity regions (polar meltwater, heavy rainfall zones). Greens mark saltier subtropical areas where evaporation exceeds precipitation. The widening contrast between poles and subtropics directly reflects acceleration of the global water cycle.',
    sources:    ['World Ocean Atlas 2023 (NOAA)', 'NASA Aquarius/SAC-D', 'ESA SMOS', 'Argo BGC Floats'],
    stats: [
      { label: 'Global mean salinity',      value: '34.72 PSU' },
      { label: 'Arctic freshening (60 yr)', value: '-0.5 PSU' },
      { label: 'Subtropical increase rate', value: '+0.02 PSU / yr' },
      { label: 'Water cycle amplification', value: '+4% per °C of warming' },
    ],
  },

  ph: {
    label:      'Ocean pH',
    depthLevels: ['surface', '100m', '500m', '1000m'],
    unit:       'pH',
    filePrefix: 'ph',
    domain:     [7.75, 8.25],
    midLabel:   '8.05',
    colorStops: [
      [7.75, '#a01414'],
      [7.90, '#d25a0f'],
      [7.98, '#c8be28'],
      [8.08, '#50b450'],
      [8.18, '#3c78d2'],
      [8.25, '#5037b4'],
    ],
    compareRange: [-0.15, 0.15],
    diffStops: [
      [-0.15, '#5037b4'],   // more alkaline in the past = improvement
      [-0.05, '#3c78d2'],
      [-0.01, '#a0d2e6'],
      [ 0,    '#f5f5f5'],
      [ 0.01, '#f0c878'],
      [ 0.05, '#e66e14'],
      [ 0.15, '#c81414'],   // more acidic = deterioration
    ],
    gradient: 'linear-gradient(90deg,#a01414,#d25a0f,#c8be28,#50b450,#3c78d2,#5037b4)',
    diffGrad: 'linear-gradient(90deg,#5037b4,#3c78d2,#a0d2e6,#f5f5f5,#f0c878,#e66e14,#c81414)',
    accent: '#a78bfa',
    importance: 'Ocean acidification, driven by absorption of atmospheric CO₂, dissolves the calcium carbonate structures of corals, mollusks, and plankton that form the base of marine food webs. Since 1750, ocean pH has dropped by 0.1 units, a 26% increase in hydrogen ion concentration. This rate is faster than any natural change in 55 million years.',
    interpret:  'Red/orange tones indicate more acidic water (lower pH = worse). Purple/blue marks relatively alkaline open-ocean water. Coastal upwelling zones and polar seas acidify fastest. In Compare mode, red = increasing acidity (deterioration); blue = relative improvement.',
    sources:    ['SOCAT v2023', 'GOA-ON Network', 'MBARI', 'Argo BGC Floats'],
    stats: [
      { label: 'Pre-industrial pH',       value: '8.18' },
      { label: 'Current mean pH (2024)',  value: '8.08' },
      { label: 'Total acidification',     value: '26% since 1850' },
      { label: 'Projected 2100 (RCP8.5)', value: '~7.95' },
    ],
  },

  chlorophyll: {
    label:      'Chlorophyll-a',
    unit:       'mg/m³',
    filePrefix: 'chl',
    domain:     [0, 3],
    midLabel:   '0.5 mg/m³',
    colorStops: [
      [0,    '#0b1d3a'],
      [0.1,  '#0a3d62'],
      [0.3,  '#0e6655'],
      [0.6,  '#1e8449'],
      [1.0,  '#52be80'],
      [1.8,  '#f4d03f'],
      [3.0,  '#e74c3c'],
    ],
    compareRange: [-1.5, 1.5],
    diffStops: [
      [-1.5, '#143cc8'],
      [-0.5, '#3c8cdc'],
      [-0.1, '#a0d2e6'],
      [ 0,   '#f5f5f5'],
      [ 0.1, '#b7e4a0'],
      [ 0.5, '#52be80'],
      [ 1.5, '#1e6020'],
    ],
    gradient: 'linear-gradient(90deg,#0b1d3a,#0a3d62,#0e6655,#1e8449,#52be80,#f4d03f,#e74c3c)',
    diffGrad: 'linear-gradient(90deg,#143cc8,#3c8cdc,#a0d2e6,#f5f5f5,#b7e4a0,#52be80,#1e6020)',
    accent: '#52be80',
    importance: 'Chlorophyll-a concentration is the primary indicator of phytoplankton abundance, the invisible foundation of marine food webs and a key driver of the biological carbon pump. These microscopic organisms produce half of the world\'s oxygen and absorb vast amounts of CO₂. Shifts in their distribution signal changes in ocean health, nutrient availability, and temperature stratification.',
    interpret:  'Dark blues indicate low-productivity open-ocean gyres (biological deserts). Greens and yellows mark nutrient-rich coastal upwellings, river plumes, and polar blooms. Reds signal very high concentrations, sometimes associated with harmful algal blooms. In Compare mode, green = increasing productivity; blue = decline.',
    sources:    ['Copernicus Marine (CMEMS)', 'NASA MODIS-Aqua', 'ESA OC-CCI', 'PISCES Biogeochemical Model'],
    stats: [
      { label: 'Global phytoplankton decline (50 yr)', value: '~40%' },
      { label: 'Ocean O₂ production share',            value: '~50%' },
      { label: 'Carbon sequestered annually',          value: '~10 Gt CO₂' },
      { label: 'Peak bloom season',                    value: 'Spring (polar regions)' },
    ],
  },

  oxygen: {
    label:      'Dissolved Oxygen',
    depthLevels: ['surface', '100m', '500m', '1000m'],
    unit:       'mmol/m³',
    filePrefix: 'o2',
    domain:     [150, 350],
    midLabel:   '250',
    colorStops: [
      [150, '#7f1d1d'],
      [200, '#c0392b'],
      [230, '#f39c12'],
      [260, '#f5f5f5'],
      [290, '#5dade2'],
      [320, '#1a5276'],
      [350, '#0d2137'],
    ],
    compareRange: [-50, 50],
    diffStops: [
      [-50, '#c81414'],
      [-15, '#e66e14'],
      [-4,  '#f0c878'],
      [  0, '#f5f5f5'],
      [  4, '#a0d2e6'],
      [ 15, '#3c8cdc'],
      [ 50, '#143cc8'],
    ],
    gradient: 'linear-gradient(90deg,#7f1d1d,#c0392b,#f39c12,#f5f5f5,#5dade2,#1a5276,#0d2137)',
    diffGrad: 'linear-gradient(90deg,#c81414,#e66e14,#f0c878,#f5f5f5,#a0d2e6,#3c8cdc,#143cc8)',
    accent: '#5dade2',
    importance: 'Ocean deoxygenation is one of the least-publicized consequences of climate change. As the ocean warms, it holds less dissolved oxygen, and stratification reduces mixing from the surface. Oxygen Minimum Zones (OMZs) are expanding, threatening fish habitats, accelerating denitrification, and releasing additional greenhouse gases. Over 700 coastal dead zones now exist worldwide.',
    interpret:  'Red tones mark low-oxygen zones: hypoxic or anoxic areas hostile to most marine life. Blues indicate well-oxygenated polar and upwelling waters. In Compare mode, blue = oxygen increase (improvement); red = depletion (deterioration). Coastal and tropical regions typically show the steepest declines.',
    sources:    ['Copernicus Marine (CMEMS)', 'World Ocean Atlas 2023 (NOAA)', 'Argo BGC Floats', 'PISCES Model'],
    stats: [
      { label: 'Global oxygen loss (50 yr)',   value: '~2%' },
      { label: 'OMZ volume increase rate',     value: '+3–8% per decade' },
      { label: 'Coastal dead zones (2024)',    value: '>700 worldwide' },
      { label: 'Hypoxia threshold',            value: '<60 mmol/m³' },
    ],
  },

  seaice: {
    label:      'Sea Ice Thickness',
    unit:       'm',
    filePrefix: 'ice',
    domain:     [0, 4],
    midLabel:   '2 m',
    colorStops: [
      [0,   '#0a0a2a'],
      [0.3, '#1a3a6e'],
      [0.8, '#2e86c1'],
      [1.5, '#85c1e9'],
      [2.5, '#d6eaf8'],
      [3.5, '#eaf4fb'],
      [4,   '#ffffff'],
    ],
    compareRange: [-2, 2],
    diffStops: [
      [-2,  '#c81414'],
      [-0.8,'#e66e14'],
      [-0.2,'#f0c878'],
      [ 0,  '#f5f5f5'],
      [ 0.2,'#a0d2e6'],
      [ 0.8,'#3c8cdc'],
      [ 2,  '#143cc8'],
    ],
    gradient: 'linear-gradient(90deg,#0a0a2a,#1a3a6e,#2e86c1,#85c1e9,#d6eaf8,#eaf4fb,#ffffff)',
    diffGrad: 'linear-gradient(90deg,#c81414,#e66e14,#f0c878,#f5f5f5,#a0d2e6,#3c8cdc,#143cc8)',
    accent: '#85c1e9',
    importance: 'Arctic sea ice has lost over 75% of its summer volume since the 1980s. This loss accelerates warming through the albedo feedback loop: white ice reflects 80–90% of sunlight, while dark open ocean absorbs 94%. Sea ice also regulates weather patterns across the Northern Hemisphere, and its decline is disrupting jet streams and enabling more extreme weather events.',
    interpret:  'Dark blues show thin or absent ice. White tones represent thick multiyear ice. The Arctic shows dramatic thinning trends; Antarctic seasonal ice is more variable. In Compare mode, blue = ice gain; red = ice loss. Polar regions with no data appear transparent where ice is absent.',
    sources:    ['Copernicus Marine (CMEMS GLORYS12)', 'NSIDC', 'ESA CryoSat-2', 'PIOMAS Model'],
    stats: [
      { label: 'Arctic summer ice volume loss (since 1980)', value: '>75%' },
      { label: 'Sea ice albedo vs open ocean',               value: '80–90% vs 6%' },
      { label: 'Arctic warming rate vs global average',      value: '4× faster' },
      { label: 'Projected ice-free Arctic summer',           value: 'Before 2050' },
    ],
  },

  sealevel: {
    label:      'Sea Surface Height',
    unit:       'm',
    filePrefix: 'ssl',
    domain:     [-1.5, 1.5],
    midLabel:   '0 m',
    colorStops: [
      [-1.5, '#1a0050'],
      [-0.8, '#2e4fa3'],
      [-0.2, '#74b9ff'],
      [ 0,   '#f5f5f5'],
      [ 0.2, '#fdcb6e'],
      [ 0.8, '#e17055'],
      [ 1.5, '#6c0000'],
    ],
    compareRange: [-0.3, 0.3],
    diffStops: [
      [-0.3, '#143cc8'],
      [-0.1, '#3c8cdc'],
      [-0.02,'#a0d2e6'],
      [ 0,   '#f5f5f5'],
      [ 0.02,'#f0c878'],
      [ 0.1, '#e66e14'],
      [ 0.3, '#c81414'],
    ],
    gradient: 'linear-gradient(90deg,#1a0050,#2e4fa3,#74b9ff,#f5f5f5,#fdcb6e,#e17055,#6c0000)',
    diffGrad: 'linear-gradient(90deg,#143cc8,#3c8cdc,#a0d2e6,#f5f5f5,#f0c878,#e66e14,#c81414)',
    accent: '#74b9ff',
    importance: 'Global mean sea level has risen ~20 cm since 1900, and the rate is accelerating, driven by thermal expansion of warming oceans (40%) and melting glaciers and ice sheets (60%). A 1-meter rise would threaten hundreds of millions of coastal inhabitants. The SSH map also reveals ocean circulation patterns: gyres, eddies, and currents leave distinct fingerprints on the sea surface.',
    interpret:  'Purple/blue tones mark depressed sea surface areas (cold dense water, downwelling zones). Orange/red indicates elevated areas: warm water expansion, convergence zones or regions near melting ice. The Mediterranean, tropics, and western Pacific typically sit higher. In Compare mode, red = rising sea level; blue = relative drop.',
    sources:    ['Copernicus Marine (CMEMS GLORYS12)', 'NASA/CNES TOPEX', 'Jason-1/2/3', 'Sentinel-6 Altimetry'],
    stats: [
      { label: 'Global rise since 1900',           value: '~21 cm' },
      { label: 'Current rate of rise',             value: '~3.7 mm / year' },
      { label: 'Projected rise by 2100 (RCP8.5)', value: '0.6–1.1 m' },
      { label: 'People at risk (1m scenario)',     value: '>300 million' },
    ],
  },

}
