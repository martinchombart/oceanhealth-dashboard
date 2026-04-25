// ─────────────────────────────────────────────────────────────
// dataLoader.js — binary .bin loader with JSON fallback
// ─────────────────────────────────────────────────────────────

const _cache = new Map()

export function loadData(variable, year, season, depth = 'surface') {
  const key = `${variable}:${year}:${season}:${depth}`
  if (_cache.has(key)) return _cache.get(key)
  const promise = _load(variable, year, season, depth).catch(() => null)
  _cache.set(key, promise)
  return promise
}

async function _load(variable, year, season, depth) {
  const { VARIABLES, DATA_BASE } = await import('./config.js')
  const meta        = VARIABLES[variable]
  const depthSuffix = depth === 'surface' ? '' : `_${depth}m`
  const base        = `${DATA_BASE}/${variable}/${meta.filePrefix}_${year}_${season}${depthSuffix}`
  // Try binary first; fall back to legacy JSON at surface during migration
  let data = await _fetchBin(base + '.bin')
  if (!data && depth === 'surface') data = await _fetchJson(base + '.json')
  return data
}

// ── Binary parser ─────────────────────────────────────────────
// Header (32 bytes, little-endian):
//   float32 lon_min  float32 lon_step  int32 lon_n
//   float32 lat_min  float32 lat_step  int32 lat_n
//   float32 global_min  float32 global_max
// Data: float32[lon_n × lat_n], row-major (lat outer), NaN = no data
async function _fetchBin(url) {
  const res = await fetch(url)
  if (!res.ok) return null
  const buf = await res.arrayBuffer()
  const dv  = new DataView(buf)
  return {
    lonMin:    dv.getFloat32(0,  true),
    lonStep:   dv.getFloat32(4,  true),
    lonN:      dv.getInt32  (8,  true),
    latMin:    dv.getFloat32(12, true),
    latStep:   dv.getFloat32(16, true),
    latN:      dv.getInt32  (20, true),
    globalMin: dv.getFloat32(24, true),
    globalMax: dv.getFloat32(28, true),
    grid:      new Float32Array(buf, 32),  // zero-copy view
  }
}

// ── JSON fallback (legacy surface files) ─────────────────────
async function _fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) return null
  const obj  = await res.json()
  const pts  = obj.points
  // Reconstruct a 0.5° grid from points array
  const GS   = 0.5
  const LON0 = -179.75, LAT0 = -89.75
  const LON_N = 720,    LAT_N = 360
  const grid = new Float32Array(LON_N * LAT_N).fill(NaN)
  for (const p of pts) {
    const li = Math.round((p.lon - LON0) / GS)
    const ai = Math.round((p.lat - LAT0) / GS)
    if (li >= 0 && li < LON_N && ai >= 0 && ai < LAT_N)
      grid[ai * LON_N + li] = p.v
  }
  return {
    lonMin: LON0, lonStep: GS, lonN: LON_N,
    latMin: LAT0, latStep: GS, latN: LAT_N,
    globalMin: obj.global_min ?? NaN,
    globalMax: obj.global_max ?? NaN,
    grid,
  }
}
