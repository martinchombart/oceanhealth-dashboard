import mapboxgl    from 'mapbox-gl/dist/mapbox-gl.js'
import { feature } from 'topojson-client'
import landTopo    from 'world-atlas/land-50m.json'
import { MAPBOX_TOKEN, MAP_CONFIG, VARIABLES, YEAR_MIN, YEAR_MAX, DATA_BASE } from './config.js'
import { loadData } from './dataLoader.js'

const SRC_OCEAN = 'ocean-img'
const L_OCEAN   = 'layer-ocean'
const SRC_LAND  = 'land-src'
const L_LAND    = 'layer-land-mask'

const CW = 1080, CH = 720
const LAT_MAX = 89
const Y_MAX   = Math.log(Math.tan(Math.PI / 4 + LAT_MAX * Math.PI / 360))

// Grid parameters — set dynamically from the binary header on first load
// Defaults match 1° binary output; JSON fallback may override to 0.5°
let _GS   = 1.0
let _LON0 = -179.5
let _LAT0 = -89.5
let _LON_N = 360
let _LAT_N = 180
let _gridParamsSet = false

function _setGridParams(d) {
  if (_gridParamsSet) return
  _GS   = d.lonStep
  _LON0 = d.lonMin
  _LAT0 = d.latMin
  _LON_N = d.lonN
  _LAT_N = d.latN
  _gridParamsSet = true
}

// ── Web Worker for heavy pixel rendering ─────────────────────
const _worker = new Worker(new URL('./renderer.worker.js', import.meta.url), { type: 'module' })
const _workerPending = new Map()
let   _workerId = 0

_worker.onmessage = ({ data: { id, px } }) => {
  const resolve = _workerPending.get(id)
  if (resolve) { _workerPending.delete(id); resolve(px) }
}

function _workerRender(payload, transferables) {
  return new Promise(resolve => {
    const id = ++_workerId
    _workerPending.set(id, resolve)
    _worker.postMessage({ id, payload }, transferables)
  })
}

// ── Background worker for silent pre-rendering ────────────────
const _bgWorker = new Worker(new URL('./renderer.worker.js', import.meta.url), { type: 'module' })
const _bgPending = new Map()
let   _bgWorkerId = 0

_bgWorker.onmessage = ({ data: { id, px } }) => {
  const cb = _bgPending.get(id)
  if (cb) { _bgPending.delete(id); cb(px) }
}

function _bgWorkerRender(payload, transferables) {
  return new Promise(resolve => {
    const id = ++_bgWorkerId
    _bgPending.set(id, resolve)
    _bgWorker.postMessage({ id, payload }, transferables)
  })
}

// ── Cursor grid from binary data (grid is already pre-built) ──
// Returns the grid directly — no rebuild needed.
function _buildCursorGrid(data) {
  return data.grid
}

// Returns { grid: Float32Array, mean: number|null }
function _buildDiffCursorGrid(dB, dA) {
  const gA  = dA.grid
  const gB  = dB.grid
  const N   = _LON_N * _LAT_N
  const d   = new Float32Array(N).fill(NaN)
  let wSum = 0, wTot = 0
  for (let ai = 0; ai < _LAT_N; ai++) {
    const lat = _LAT0 + ai * _GS
    const w   = Math.cos(lat * Math.PI / 180)
    for (let li = 0; li < _LON_N; li++) {
      const i = ai * _LON_N + li
      if (!isNaN(gA[i]) && !isNaN(gB[i])) {
        d[i]  = gB[i] - gA[i]
        wSum += d[i] * w
        wTot += w
      }
    }
  }
  return { grid: d, mean: wTot > 0 ? wSum / wTot : null }
}

// ── Land geometry ─────────────────────────────────────────────
let _land = feature(landTopo, landTopo.objects.land)

fetch(`${DATA_BASE}/ne_10m_land.geojson`)
  .then(r => r.ok ? r.json() : null)
  .then(d => { if (d) { _land = d; map?.getSource(SRC_LAND)?.setData(d) } })
  .catch(() => {})

// ── State ─────────────────────────────────────────────────────
let map
let _oceanCanvas = null
let _cursorGrid  = null                  // Float32Array for cursor hover
const _pixelCache = new Map()            // "variable:season:year" → Uint8ClampedArray

let _ready       = false
let _initialLoad = true
let _renderSeq   = 0
let _variable = 'temperature'
let _season   = 'year'
let _year     = 2024
let _compare  = false
let _yearA    = YEAR_MIN
let _yearB    = YEAR_MAX
let _depth    = 'surface'
let _onCursor     = null
let _onLoading    = null
let _onGlobalDiff = null
let _onDataReady  = null
let _onMapClick   = null
const _pinMarkers = new Map()   // id -> mapboxgl.Marker

const MAX_PIXEL_CACHE = 20  // ~60 MB cap
function _cachePixels(key, px) {
  if (_pixelCache.size >= MAX_PIXEL_CACHE)
    _pixelCache.delete(_pixelCache.keys().next().value)
  _pixelCache.set(key, px)
}

const _FOG_GLOBE = {
  'range':           [0.5, 10],
  'color':           '#082f49',
  'high-color':      '#00060f',
  'space-color':     '#000008',
  'horizon-blend':   0.04,
  'star-intensity':  0.15,
}

// ── Init ──────────────────────────────────────────────────────
export function initMap(containerId) {
  mapboxgl.accessToken = MAPBOX_TOKEN
  map = new mapboxgl.Map({
    container: containerId, style: MAP_CONFIG.style,
    center: MAP_CONFIG.center, zoom: MAP_CONFIG.zoom,
    minZoom: MAP_CONFIG.minZoom, maxZoom: MAP_CONFIG.maxZoom,
    projection: MAP_CONFIG.projection, attributionControl: { compact: true },
  })
  map.on('load', () => {
    try { _styleMap()  } catch(_){}
    try { _addLayers() } catch(e){ console.error('[map]', e) }
    map.setFog(_FOG_GLOBE)
    _bindCursor()
    _bindClick()
    _ready = true
    loadAndRender()
  })
  return map
}

function _addLayers() {
  const sym = map.getStyle().layers.find(l => l.type === 'symbol')?.id

  map.addSource('mapbox-dem', {
    type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
    tileSize: 512, maxzoom: 14,
  })

  _oceanCanvas = document.createElement('canvas')
  _oceanCanvas.width = CW; _oceanCanvas.height = CH

  map.addSource(SRC_OCEAN, {
    type: 'canvas', canvas: _oceanCanvas, animate: false,
    coordinates: [[-180, LAT_MAX], [180, LAT_MAX], [180, -LAT_MAX], [-180, -LAT_MAX]],
  })
  map.addLayer({
    id: L_OCEAN, type: 'raster', source: SRC_OCEAN,
    paint: { 'raster-opacity': 0.95, 'raster-resampling': 'linear' },
  }, sym)

  const _makePolarCap = (latEdge, latPole) => {
    const ring = []
    for (let lon = -180; lon <= 180; lon++) ring.push([lon, latEdge])
    ring.push([180, latPole], [-180, latPole], [-180, latEdge])
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] } }
  }
  map.addSource('polar-cap-n', { type: 'geojson', data: _makePolarCap(LAT_MAX,  90) })
  map.addSource('polar-cap-s', { type: 'geojson', data: _makePolarCap(-LAT_MAX, -90) })
  map.addLayer({ id: 'polar-cap-n', type: 'fill', source: 'polar-cap-n',
    paint: { 'fill-color': '#00060f' } }, sym)
  map.addLayer({ id: 'polar-cap-s', type: 'fill', source: 'polar-cap-s',
    paint: { 'fill-color': '#6b7280' } }, sym)

  map.addSource(SRC_LAND, { type: 'geojson', data: _land })
  map.addLayer({
    id: L_LAND, type: 'fill', source: SRC_LAND,
    paint: { 'fill-color': '#6b7280', 'fill-antialias': true },
  }, sym)

  map.addLayer({
    id: 'hillshading', type: 'hillshade', source: 'mapbox-dem',
    paint: {
      'hillshade-exaggeration': 0.8,
      'hillshade-shadow-color': '#3d4d5e',
      'hillshade-highlight-color': '#ffffff',
      'hillshade-illumination-direction': 335,
      'hillshade-illumination-anchor': 'map',
    },
  }, sym)


  map.getStyle().layers.forEach(({ id }) => {
    if (id.includes('admin') || id.includes('country-label'))
      try { map.moveLayer(id) } catch(_){}
  })
}

function _styleMap() {
  map.getStyle().layers.forEach(({ id, type }) => {
    try {
      if (type === 'background') { map.setPaintProperty(id,'background-color','#001e3c'); return }
      if (type === 'fill') {
        if (['land','landuse','park','airport','pitch','snow','glacier','sand','scrub','wood','grass','crop','building','national','residential'].some(k=>id.includes(k)))
          map.setPaintProperty(id,'fill-color','#6b7280')
        else if (id==='water'||id.includes('water'))
          map.setPaintProperty(id,'fill-color','#00060f')
      }
      if (type === 'line') {
        if (['road','bridge','tunnel','rail','ferry'].some(k=>id.includes(k)))
          map.setLayoutProperty(id,'visibility','none')
        else if (id.includes('admin-0-boundary')&&!id.includes('disputed'))
          { map.setPaintProperty(id,'line-color','rgba(255,255,255,0.45)'); map.setPaintProperty(id,'line-width',0.75) }
        else if (id.includes('admin-1'))
          map.setPaintProperty(id,'line-color','rgba(255,255,255,0.15)')
      }
      if (type==='symbol'&&id.includes('country-label'))
        { map.setPaintProperty(id,'text-color','rgba(255,255,255,0.8)'); map.setPaintProperty(id,'text-halo-color','rgba(0,0,0,0.9)') }
    } catch(_){}
  })
}

// ── Apply pixels to canvas ────────────────────────────────────
function _canvasUpdate() {
  const src = map?.getSource(SRC_OCEAN)
  if (!src) return
  src.play()
  requestAnimationFrame(() => src.pause())
}

function _applyPixels(px) {
  const ctx = _oceanCanvas.getContext('2d')
  const img = ctx.createImageData(CW, CH)
  img.data.set(px)
  ctx.putImageData(img, 0, 0)
  _canvasUpdate()
}

function _clearCanvas() {
  if (!_oceanCanvas) return
  _oceanCanvas.getContext('2d').clearRect(0, 0, CW, CH)
  _canvasUpdate()
}

// ── Blend two cached pixel arrays (timeline scrub animation) ─
function _blendPixels(pxA, pxB, t) {
  const t1  = 1 - t
  const out = new Uint8ClampedArray(pxA.length)
  for (let i = 0; i < pxA.length; i += 4) {
    const aA = pxA[i+3], aB = pxB[i+3]
    if (aA === 0 && aB === 0) continue
    if (aA === 0) { out[i]=pxB[i]; out[i+1]=pxB[i+1]; out[i+2]=pxB[i+2]; out[i+3]=aB; continue }
    if (aB === 0) { out[i]=pxA[i]; out[i+1]=pxA[i+1]; out[i+2]=pxA[i+2]; out[i+3]=aA; continue }
    out[i]   = (t1*pxA[i]   + t*pxB[i]   + 0.5) | 0
    out[i+1] = (t1*pxA[i+1] + t*pxB[i+1] + 0.5) | 0
    out[i+2] = (t1*pxA[i+2] + t*pxB[i+2] + 0.5) | 0
    out[i+3] = 242
  }
  return out
}

// ── Cursor ────────────────────────────────────────────────────
function _bindCursor() {
  let _lastMoveEvent = null
  let _moveRafPending = false

  map.on('mousemove', e => {
    _lastMoveEvent = e
    if (_moveRafPending) return
    _moveRafPending = true
    requestAnimationFrame(() => {
      _moveRafPending = false
      const ev = _lastMoveEvent
      if (!_onCursor || !_cursorGrid) {
        _onCursor?.(null, null, ev.lngLat.lng, ev.lngLat.lat, false); return
      }
      if (map.queryRenderedFeatures(ev.point, { layers: [L_LAND] }).length > 0) {
        _onCursor(null, null, ev.lngLat.lng, ev.lngLat.lat, false); return
      }
      const li = Math.max(0, Math.min(_LON_N - 1, Math.round((ev.lngLat.lng - _LON0) / _GS)))
      const ai = Math.max(0, Math.min(_LAT_N - 1, Math.round((ev.lngLat.lat - _LAT0) / _GS)))
      const raw = _cursorGrid[ai * _LON_N + li]
      if (!isNaN(raw)) _onCursor(raw, VARIABLES[_variable].unit, ev.lngLat.lng, ev.lngLat.lat, true)
      else             _onCursor(null, null, ev.lngLat.lng, ev.lngLat.lat, false)
    })
  })
  map.getCanvas().addEventListener('mouseleave', () => _onCursor?.(null, null, 0, 0, false))
}

// ── Click → pin ───────────────────────────────────────────────
function _bindClick() {
  map.on('click', e => {
    if (!_onMapClick) return
    if (map.queryRenderedFeatures(e.point, { layers: [L_LAND] }).length > 0) return
    _onMapClick(e.lngLat.lng, e.lngLat.lat)
  })

  // Pointer finger at rest → grabbing hand while dragging
  const container = map.getContainer().querySelector('.mapboxgl-canvas-container')
  map.getCanvas().addEventListener('mousedown', () => container.classList.add('map-grabbing'))
  document.addEventListener('mouseup', () => container.classList.remove('map-grabbing'))
}

export function getValueAtCoord(lon, lat) {
  if (!_cursorGrid) return null
  const li = Math.max(0, Math.min(_LON_N - 1, Math.round((lon - _LON0) / _GS)))
  const ai = Math.max(0, Math.min(_LAT_N - 1, Math.round((lat - _LAT0) / _GS)))
  const v  = _cursorGrid[ai * _LON_N + li]
  return isNaN(v) ? null : v
}

export function addPinMarker(id, lon, lat, el) {
  if (!map) return
  const m = new mapboxgl.Marker({ element: el, anchor: 'center' })
    .setLngLat([lon, lat])
    .addTo(map)
  _pinMarkers.set(id, m)
}

export function removePinMarker(id) {
  const m = _pinMarkers.get(id)
  if (m) { m.remove(); _pinMarkers.delete(id) }
}

let _peekMarker = null
export function setPeekMarker(lon, lat, el) {
  if (!map) return
  if (_peekMarker) _peekMarker.remove()
  _peekMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
    .setLngLat([lon, lat])
    .addTo(map)
}
export function removePeekMarker() {
  if (_peekMarker) { _peekMarker.remove(); _peekMarker = null }
}

// ── Pre-fetch + pre-render pixels for adjacent years ──────────
async function _prefetchAdjacent() {
  const variable = _variable
  const season   = _season
  const depth    = _depth
  const meta     = VARIABLES[variable]

  // Pre-load ±3
  const nearYears = [-3,-2,-1,1,2,3].map(d => _year + d).filter(y => y >= YEAR_MIN && y <= YEAR_MAX)
  nearYears.forEach(y => loadData(variable, y, season, depth))

  // Pixel pre-render ±2 sequentially on background worker
  const renderYears = [-2,-1,1,2].map(d => _year + d).filter(y => y >= YEAR_MIN && y <= YEAR_MAX)
  for (const y of renderYears) {
    if (_variable !== variable || _season !== season || _depth !== depth || _compare) break
    const key = `${variable}:${season}:${y}:${depth}`
    if (_pixelCache.has(key)) continue
    const d = await loadData(variable, y, season, depth)
    if (!d || _variable !== variable || _season !== season || _depth !== depth || _compare) break
    _setGridParams(d)
    const gridB = d.grid.slice()
    const px = await _bgWorkerRender({
      mode: 'normal', gridB, gridA: null,
      dMin: meta.domain[0], dMax: meta.domain[1], colorStops: meta.colorStops,
      CW, CH, Y_MAX, GS: _GS, LON0: _LON0, LAT0: _LAT0, LON_N: _LON_N, LAT_N: _LAT_N,
      skipFill: variable === 'seaice',
    }, [gridB.buffer])
    if (!_pixelCache.has(key)) _cachePixels(key, px)
  }
}

// ── Main render ───────────────────────────────────────────────
export async function loadAndRender() {
  if (!_ready) return
  const seq = ++_renderSeq
  if (_initialLoad) _onLoading?.(true)
  const meta = VARIABLES[_variable]

  try {
    map.setLayoutProperty(L_OCEAN, 'visibility', 'visible')

    // ── Canvas rendering via Web Worker ──────────────────────
      const cacheKey = _compare ? null : `${_variable}:${_season}:${_year}:${_depth}`

      // Fetch data (instant after first load — cached in dataLoader)
      let dB, dA
      if (_compare) {
        ;[dB, dA] = await Promise.all([
          loadData(_variable, _yearB, _season, _depth),
          loadData(_variable, _yearA, _season, _depth),
        ])
      } else {
        dB = await loadData(_variable, _year, _season, _depth)
      }
      if (seq !== _renderSeq) return

      // Either dataset missing → clear canvas, no crash
      if (!dB || (_compare && !dA)) {
        _cursorGrid = null
        _clearCanvas()
        _onGlobalDiff?.(null)
        return
      }

      // Set grid parameters from data header (once, on first load)
      _setGridParams(dB)

      // Build cursor grid (the binary grid is pre-built — O(1))
      if (_compare) {
        const { grid, mean } = _buildDiffCursorGrid(dB, dA)
        _cursorGrid = grid
        _onGlobalDiff?.(mean)
      } else {
        _cursorGrid = _buildCursorGrid(dB)
        _onGlobalDiff?.(null)
      }

      // Check pixel cache (non-compare only)
      if (cacheKey && _pixelCache.has(cacheKey)) {
        _applyPixels(_pixelCache.get(cacheKey))
      } else {
        // Copy grids for zero-copy transfer to worker (original stays in cache)
        const gridB = dB.grid.slice()
        const gridA = dA ? dA.grid.slice() : null

        const colorStops = _compare ? meta.diffStops : meta.colorStops
        const [dMin, dMax] = _compare ? meta.compareRange : meta.domain

        const transfer = [gridB.buffer]
        if (gridA) transfer.push(gridA.buffer)

        const px = await _workerRender({
          mode: _compare ? 'diff' : 'normal',
          gridB, gridA,
          dMin, dMax, colorStops,
          CW, CH, Y_MAX,
          GS: _GS, LON0: _LON0, LAT0: _LAT0, LON_N: _LON_N, LAT_N: _LAT_N,
          skipFill: _variable === 'seaice',
        }, transfer)

        if (seq !== _renderSeq) return

        if (cacheKey) _cachePixels(cacheKey, px)
        _applyPixels(px)

        if (!_compare) _prefetchAdjacent()
      }
  } catch(e) { console.error('[map]', e) }
  finally {
    if (seq === _renderSeq) {
      if (_initialLoad) { _onLoading?.(false); _initialLoad = false }
      _onDataReady?.()
    }
  }
}

// ── Timeline scrub (blend cached frames) ─────────────────────
let _rafPending  = false
let _pendingFrac = null

export function setYearFraction(frac) {
  if (!_ready || _compare) return
  _pendingFrac = frac
  if (_rafPending) return
  _rafPending = true
  requestAnimationFrame(() => {
    _rafPending = false
    const f      = _pendingFrac
    const yearLo = Math.max(YEAR_MIN, Math.floor(f))
    const yearHi = Math.min(YEAR_MAX, yearLo + 1)
    const t      = f - yearLo
    const pxLo   = _pixelCache.get(`${_variable}:${_season}:${yearLo}:${_depth}`)
    const pxHi   = _pixelCache.get(`${_variable}:${_season}:${yearHi}:${_depth}`)
    if (!pxLo && !pxHi) return
    if (!pxLo || !pxHi || t < 0.01) { _applyPixels(pxLo || pxHi); return }
    _applyPixels(_blendPixels(pxLo, pxHi, t))
  })
}

export const setVariable     = v => { _variable = v; loadAndRender() }
export const setYear         = y => { _year = y; if (!_compare) loadAndRender() }
export const setSeason       = s => { _season = s; loadAndRender() }
export const setCompareMode  = c => { _compare = c; loadAndRender() }
export const setCompareYears = (a, b) => { _yearA = a; _yearB = b; if (_compare) loadAndRender() }
export const setDepth        = d => { _depth = d; _pixelCache.clear(); loadAndRender() }
export const zoomIn    = () => map?.zoomIn()
export const zoomOut   = () => map?.zoomOut()
export const zoomReset = () => map?.flyTo({ center: MAP_CONFIG.center, zoom: MAP_CONFIG.zoom })
export const setProjection = proj => {
  if (!map) return
  map.setProjection(proj)
  map.setFog(proj === 'globe' ? _FOG_GLOBE : null)
}
export const onCursor     = fn => { _onCursor     = fn }
export const onLoading    = fn => { _onLoading    = fn }
export const onGlobalDiff = fn => { _onGlobalDiff = fn }
export const onDataReady  = fn => { _onDataReady  = fn }
export const onMapClick   = fn => { _onMapClick   = fn }
