// renderer.worker.js — pixel rendering off the main thread
// Receives pre-built Float32Array grids — no JSON parsing here.

self.onmessage = ({ data: { id, payload } }) => {
  const px = _renderFrame(payload)
  self.postMessage({ id, px }, [px.buffer])
}

// ── BFS multi-source gap fill ─────────────────────────────────
function _fillGaps(g, LON_N, LAT_N) {
  const out   = g.slice()
  const vis   = new Uint8Array(out.length)
  const queue = new Int32Array(out.length)
  let h = 0, t = 0

  for (let i = 0; i < out.length; i++) {
    if (!isNaN(out[i])) { vis[i] = 1; queue[t++] = i }
  }

  while (h < t) {
    const idx = queue[h++]
    const v   = out[idx]
    const li  = idx % LON_N
    const ai  = (idx / LON_N) | 0

    if (ai > 0)          { const n = idx - LON_N; if (!vis[n]) { vis[n]=1; out[n]=v; queue[t++]=n } }
    if (ai < LAT_N - 1) { const n = idx + LON_N; if (!vis[n]) { vis[n]=1; out[n]=v; queue[t++]=n } }
    { const n = ai*LON_N + (li > 0 ? li-1 : LON_N-1); if (!vis[n]) { vis[n]=1; out[n]=v; queue[t++]=n } }
    { const n = ai*LON_N + (li < LON_N-1 ? li+1 : 0); if (!vis[n]) { vis[n]=1; out[n]=v; queue[t++]=n } }
  }
  return out
}

// ── Color LUT ─────────────────────────────────────────────────
function _buildLUT(colorStops, dMin, dMax, size) {
  const range  = dMax - dMin || 1
  const parsed = colorStops.map(([v, h]) => [
    Math.max(0, Math.min(1, (v - dMin) / range)),
    parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16),
  ])
  const lut  = new Uint8Array(size * 3)
  const last = parsed.length - 1
  for (let i = 0; i < size; i++) {
    const n = i / (size - 1)
    let r, g, b
    if      (n <= parsed[0][0])    { [,r,g,b] = parsed[0] }
    else if (n >= parsed[last][0]) { [,r,g,b] = parsed[last] }
    else {
      for (let j = 0; j < last; j++) {
        const [n0,r0,g0,b0] = parsed[j]
        const [n1,r1,g1,b1] = parsed[j+1]
        if (n >= n0 && n <= n1) {
          const t = n1>n0 ? (n-n0)/(n1-n0) : 0
          r=(r0+(r1-r0)*t+.5)|0; g=(g0+(g1-g0)*t+.5)|0; b=(b0+(b1-b0)*t+.5)|0
          break
        }
      }
    }
    lut[i*3]=r; lut[i*3+1]=g; lut[i*3+2]=b
  }
  return lut
}

// ── Bilinear interpolation ────────────────────────────────────
function _bilinear(g, lon, lat, GS, LON0, LAT0, LON_N, LAT_N) {
  const liF = Math.floor((lon - LON0) / GS)
  const aiF = Math.floor((lat - LAT0) / GS)
  const tx  = (lon - (LON0 + liF * GS)) / GS
  const ty  = (lat - (LAT0 + aiF * GS)) / GS
  const liW = ((liF % LON_N) + LON_N) % LON_N
  const liE = (liW + 1) % LON_N
  const aiS = Math.max(0, Math.min(LAT_N-1, aiF))
  const aiN = Math.min(LAT_N-1, aiF+1)
  const vSW=g[aiS*LON_N+liW], vSE=g[aiS*LON_N+liE]
  const vNW=g[aiN*LON_N+liW], vNE=g[aiN*LON_N+liE]
  const eSW=!isNaN(vSW), eSE=!isNaN(vSE), eNW=!isNaN(vNW), eNE=!isNaN(vNE)
  if (!eSW&&!eSE&&!eNW&&!eNE) return NaN
  let s=0,c=0
  if(eSW){s+=vSW;c++} if(eSE){s+=vSE;c++} if(eNW){s+=vNW;c++} if(eNE){s+=vNE;c++}
  const fb=s/c
  return ((eSW?vSW:fb)*(1-tx)+(eSE?vSE:fb)*tx)*(1-ty)
       + ((eNW?vNW:fb)*(1-tx)+(eNE?vNE:fb)*tx)*ty
}

// ── Main render ───────────────────────────────────────────────
function _renderFrame({
  mode, gridB, gridA,
  dMin, dMax, colorStops,
  CW, CH, Y_MAX,
  GS, LON0, LAT0, LON_N, LAT_N,
  skipFill,
}) {
  const LUT_N  = 1024
  const lut    = _buildLUT(colorStops, dMin, dMax, LUT_N)
  const lutMax = LUT_N - 1
  const range  = dMax - dMin || 1

  let grid
  if (mode === 'diff' && gridA) {
    const diff = new Float32Array(LON_N * LAT_N).fill(NaN)
    for (let i = 0; i < diff.length; i++) {
      if (!isNaN(gridB[i]) && !isNaN(gridA[i])) diff[i] = gridB[i] - gridA[i]
    }
    grid = skipFill ? diff : _fillGaps(diff, LON_N, LAT_N)
  } else {
    grid = skipFill ? gridB : _fillGaps(gridB, LON_N, LAT_N)
  }

  const px = new Uint8ClampedArray(CW * CH * 4)
  for (let y = 0; y < CH; y++) {
    const yMerc = Y_MAX - y * (2 * Y_MAX) / (CH - 1)
    const lat   = (2 * Math.atan(Math.exp(yMerc)) - Math.PI / 2) * 180 / Math.PI
    const row   = y * CW * 4
    for (let x = 0; x < CW; x++) {
      const lon  = -180 + (x / (CW-1)) * 360
      const raw  = _bilinear(grid, lon, lat, GS, LON0, LAT0, LON_N, LAT_N)
      if (isNaN(raw)) continue
      const norm = Math.max(0, Math.min(1, (raw-dMin)/range))
      const li   = (norm * lutMax + .5) | 0
      const i    = row + x * 4
      px[i]=lut[li*3]; px[i+1]=lut[li*3+1]; px[i+2]=lut[li*3+2]; px[i+3]=242
    }
  }
  return px
}
