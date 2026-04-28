// ─────────────────────────────────────────────────────────────
// main.js  —  Ocean Health Dashboard · Entry Point
// ─────────────────────────────────────────────────────────────

import './style.css'
import { DEFAULT_YEAR, VARIABLES } from './config.js'
import {
  initMap, setVariable, setYear, setSeason,
  setCompareMode, setCompareYears,
  setYearFraction,
  zoomIn, zoomOut, zoomReset,
  setProjection, setDepth,
  toggleGlobeRotation, onRotateChange, isGlobeRotating,
  onCursor, onLoading, onGlobalDiff,
  onMapClick, onDataReady, addPinMarker, removePinMarker, getValueAtCoord,
  setPeekMarker, removePeekMarker,
} from './map.js'
import {
  initTimeline, setCompareMode as tlSetCompare, getCompareYears
} from './timeline.js'
import {
  initTooltip, updateTooltip, setTooltipState,
  updateLegend, setLoading, initPanel, renderPanel,
  createPinEl, updatePinValue,
  createPeekEl, updatePeekValue,
} from './ui.js'

// ─────────────────────────────────────────
// APP STATE
// ─────────────────────────────────────────
const _pins = []
let _pinCounter = 0
let _peek = null  // { lon, lat, el } — mobile temporary point

const app = {
  variable:  'temperature',
  season:    'year',
  year:      DEFAULT_YEAR,
  compare:   false,
  yearA:     1993,
  yearB:     DEFAULT_YEAR,
  depth:     'surface',
}

// ─────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Welcome modal — show once
  const modal = document.getElementById('welcome-modal')
  const enterBtn = document.getElementById('welcome-enter')
  const lastSeen = parseInt(localStorage.getItem('ocean-last-seen') || '0', 10)
  if (Date.now() - lastSeen < 60 * 60 * 1000) {
    modal.style.display = 'none'
  }
  enterBtn?.addEventListener('click', () => {
    modal.style.opacity = '0'
    modal.style.transition = 'opacity 0.4s ease'
    setTimeout(() => { modal.style.display = 'none' }, 400)
    localStorage.setItem('ocean-last-seen', String(Date.now()))
  })

  // About modal
  const aboutModal = document.getElementById('about-modal')
  const aboutBtn   = document.getElementById('about-btn')
  const aboutClose = document.getElementById('about-close')

  const openAbout = () => {
    aboutModal.classList.remove('hidden')
    aboutModal.classList.add('flex')
    aboutModal.style.opacity = '0'
    requestAnimationFrame(() => {
      aboutModal.style.transition = 'opacity 0.3s ease'
      aboutModal.style.opacity = '1'
    })
  }
  const closeAbout = () => {
    aboutModal.style.opacity = '0'
    setTimeout(() => {
      aboutModal.classList.add('hidden')
      aboutModal.classList.remove('flex')
    }, 300)
  }

  aboutBtn?.addEventListener('click', openAbout)
  aboutClose?.addEventListener('click', closeAbout)
  aboutModal?.addEventListener('click', e => { if (e.target === aboutModal) closeAbout() })

  initMap('map')

  onCursor((value, unit, lon, lat, hasData) =>
    updateTooltip(value, unit, lon, lat, hasData)
  )
  onLoading(loading => setLoading(loading))
  onGlobalDiff(mean => _updateGlobalDiff(mean))
  onMapClick((lon, lat) => {
    if (window.innerWidth < 1024) _showPeek(lon, lat)
    else _addPin(lon, lat)
  })
  onDataReady(() => { _syncPins(); _syncPeek() })

  initTimeline({
    onYearFrac: frac => setYearFraction(frac),
    onYearChange: year => {
      app.year = year
      setYear(year)
      _sync()
    },
    onCompareChange: (yearA, yearB) => {
      app.yearA = yearA
      app.yearB = yearB
      setCompareYears(yearA, yearB)
      setTooltipState(app.variable, app.compare, yearA, yearB)
      _sync()
    },
  })

  initTooltip()
  initPanel()

  _bindTabs()
  _bindCompareToggle()
  _bindSeasonSelect()
  _bindDepthSelector()
  _bindZoomButtons()
  _bindProjectionToggle()
  _bindLeftPanelToggle()
  _bindTabsScrollArrows()

  _sync()
})

// ─────────────────────────────────────────
// UI BINDINGS
// ─────────────────────────────────────────
function _bindTabs() {
  document.querySelectorAll('.data-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.data-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      app.variable = tab.dataset.key
      setVariable(app.variable)
      setTooltipState(app.variable, app.compare, app.yearA, app.yearB)
      renderPanel(app.variable)
      _updateDepthVisibility()
      _sync()
    })
  })
}

function _updateDepthVisibility() {
  const sel = document.getElementById('depth-selector')
  if (!sel) return
  const hasDepth = VARIABLES[app.variable]?.depthLevels?.length > 1
  sel.classList.toggle('hidden', !hasDepth)
  if (!hasDepth && app.depth !== 'surface') {
    app.depth = 'surface'
    setDepth('surface')
    _applyDepthNotch('surface')
  }
}

function _applyDepthNotch(depth) {
  document.querySelectorAll('.depth-notch').forEach(btn => {
    const active = btn.dataset.depth === depth
    btn.style.background      = active ? '#0ea5e9' : 'transparent'
    btn.style.borderColor     = active ? '#0ea5e9' : 'rgba(255,255,255,0.3)'
    btn.style.boxShadow       = active ? '0 0 6px rgba(14,165,233,0.6)' : ''
  })
  document.querySelectorAll('.depth-label').forEach(lbl => {
    lbl.style.color = lbl.dataset.depth === depth ? '#0ea5e9' : 'rgba(255,255,255,0.45)'
  })
}

function _bindDepthSelector() {
  const depthLabels = { surface: 'Surface', '100m': '100 m', '500m': '500 m', '1000m': '1000 m' }

  const _select = depth => {
    app.depth = depth
    setDepth(depth)
    _applyDepthNotch(depth)
  }

  document.querySelectorAll('.depth-notch, .depth-label').forEach(el => {
    el.addEventListener('click', () => _select(el.dataset.depth))
  })

  // Initial visibility based on default variable (temperature)
  _updateDepthVisibility()
}

function _bindCompareToggle() {
  const btn   = document.getElementById('compare-toggle')
  const thumb = document.getElementById('toggle-thumb')
  const pill  = document.getElementById('compare-pill')

  btn.addEventListener('click', () => {
    app.compare = !app.compare
    btn.setAttribute('aria-checked', String(app.compare))

    if (app.compare) {
      btn.classList.add('!bg-ocean-accent', '!border-ocean-accent')
      thumb.style.transform = 'translateX(20px)'
      pill.classList.remove('hidden'); pill.classList.add('flex')
    } else {
      btn.classList.remove('!bg-ocean-accent', '!border-ocean-accent')
      thumb.style.transform = ''
      pill.classList.add('hidden'); pill.classList.remove('flex')
      _updateGlobalDiff(null)   // hide indicator when leaving compare mode
    }

    tlSetCompare(app.compare)
    setCompareYears(app.yearA, app.yearB)   // sync avant setCompareMode pour que le 1er rendu soit correct
    setCompareMode(app.compare)
    setTooltipState(app.variable, app.compare, app.yearA, app.yearB)
    _sync()
  })
}

function _bindSeasonSelect() {
  const trigger = document.getElementById('season-trigger')
  const options = document.getElementById('season-options')
  const label   = document.getElementById('season-label')
  const arrow   = document.getElementById('season-arrow')
  const labels  = { year: 'Full Year', spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' }

  let open = false

  const allOpts = document.querySelectorAll('.season-opt')

  const updateVisible = () => {
    allOpts.forEach(opt => {
      opt.style.display = opt.dataset.value === app.season ? 'none' : ''
    })
  }

  const close = () => {
    open = false
    options.style.maxHeight = '0'
    arrow.style.transform = ''
  }

  trigger.addEventListener('click', e => {
    e.stopPropagation()
    open = !open
    if (open) updateVisible()
    options.style.maxHeight = open ? '200px' : '0'
    arrow.style.transform = open ? 'rotate(180deg)' : ''
  })

  allOpts.forEach(opt => {
    opt.addEventListener('mouseenter', () => { opt.style.background = 'rgba(255,255,255,0.1)' })
    opt.addEventListener('mouseleave', () => { opt.style.background = '' })
    opt.addEventListener('click', e => {
      e.stopPropagation()
      app.season = opt.dataset.value
      label.textContent = labels[app.season]
      setSeason(app.season)
      _sync()
      close()
    })
  })

  updateVisible()
  document.addEventListener('click', close)
}

function _bindZoomButtons() {
  document.getElementById('btn-zoom-in')?.addEventListener('click',    zoomIn)
  document.getElementById('btn-zoom-out')?.addEventListener('click',   zoomOut)
  document.getElementById('btn-zoom-reset')?.addEventListener('click', zoomReset)

  const playBtn = document.getElementById('btn-play-rotate')
  if (playBtn) {
    playBtn.addEventListener('click', toggleGlobeRotation)
    onRotateChange(active => {
      playBtn.textContent = active ? '■' : '▶'
      playBtn.title = active ? 'Stop rotation' : 'Play globe rotation'
    })
  }
}

function _bindTabsScrollArrows() {
  const nav   = document.getElementById('data-tabs')
  const left  = document.getElementById('tabs-arrow-left')
  const right = document.getElementById('tabs-arrow-right')
  if (!nav || !left || !right) return

  const update = () => {
    if (window.innerWidth >= 1024) { left.style.display = 'none'; right.style.display = 'none'; return }
    const canLeft  = nav.scrollLeft > 4
    const canRight = nav.scrollLeft < nav.scrollWidth - nav.clientWidth - 4
    left.style.display  = canLeft  ? 'flex' : 'none'
    right.style.display = canRight ? 'flex' : 'none'
  }

  nav.addEventListener('scroll', update, { passive: true })
  window.addEventListener('resize', update)
  left.addEventListener('click',  () => { nav.scrollBy({ left: -140, behavior: 'smooth' }); setTimeout(update, 250) })
  right.addEventListener('click', () => { nav.scrollBy({ left:  140, behavior: 'smooth' }); setTimeout(update, 250) })

  requestAnimationFrame(update)
}

function _bindLeftPanelToggle() {
  const toggle = document.getElementById('left-panel-toggle')
  const panel  = document.getElementById('left-panel')
  if (!toggle || !panel) return
  toggle.addEventListener('click', e => {
    e.stopPropagation()
    panel.classList.toggle('is-open')
  })
}

function _bindProjectionToggle() {
  const toggles = [
    { btn: document.getElementById('projection-toggle'),   thumb: document.getElementById('proj-thumb') },
    { btn: document.getElementById('projection-toggle-m'), thumb: document.getElementById('proj-thumb-m') },
  ]
  let isGlobe = true

  const playBtn = document.getElementById('btn-play-rotate')

  const _update = () => {
    toggles.forEach(({ btn, thumb }) => {
      if (!btn) return
      btn.setAttribute('aria-checked', String(isGlobe))
      btn.style.background  = isGlobe ? '#0ea5e9' : '#bae6fd'
      btn.style.borderColor = isGlobe ? '#0ea5e9' : '#7dd3fc'
      if (thumb) thumb.style.transform = isGlobe ? 'translateX(20px)' : ''
    })
    if (!isGlobe && isGlobeRotating()) toggleGlobeRotation()
    setProjection(isGlobe ? 'globe' : 'mercator')
    if (playBtn) playBtn.style.visibility = isGlobe ? '' : 'hidden'
  }

  toggles.forEach(({ btn }) => {
    btn?.addEventListener('click', () => { isGlobe = !isGlobe; _update() })
  })
}

// ─────────────────────────────────────────
// GLOBAL DIFF INDICATOR
// ─────────────────────────────────────────
const DIFF_TEXT_COLORS = {
  // { positive change → color, negative change → color }
  salinity:    { pos: '#4ade80', neg: '#60a5fa' },   // saltier=green / fresher=blue
  ph:          { pos: '#60a5fa', neg: '#f87171' },   // less acidic=blue / more acidic=red
  chlorophyll: { pos: '#60a5fa', neg: '#f87171' },   // more chl=blue / less chl=red
  oxygen:      { pos: '#60a5fa', neg: '#f87171' },   // more O2=blue / less O2=red
  seaice:      { pos: '#60a5fa', neg: '#f87171' },   // ice gain=blue / ice loss=red
  // default (temperature, sealevel): warming=red / cooling=blue
}
function _diffTextColor(variable, mean, threshold) {
  if (Math.abs(mean) <= threshold) return '#f5f5f5'
  const r = DIFF_TEXT_COLORS[variable] || { pos: '#f87171', neg: '#60a5fa' }
  return mean > 0 ? r.pos : r.neg
}

function _updateGlobalDiff(mean) {
  const el       = document.getElementById('global-diff-indicator')
  const valEl    = document.getElementById('gdiff-value')
  const labelEl  = document.getElementById('gdiff-sublabel')
  const mWrap    = document.getElementById('gdiff-wrap-m')
  const mValEl   = document.getElementById('gdiff-value-m')

  const hide = mean === null || !app.compare
  if (hide) {
    el?.classList.add('hidden')
    mWrap?.classList.add('hidden')
    return
  }

  const unit      = VARIABLES[app.variable]?.unit || ''
  const sign      = mean >= 0 ? '+' : ''
  const decimals  = app.variable === 'ph' ? 3 : 2
  const text      = sign + mean.toFixed(decimals) + ' ' + unit
  const threshold = app.variable === 'ph' ? 0.005 : 0.02
  const color     = _diffTextColor(app.variable, mean, threshold)

  const { yearA, yearB } = getCompareYears()
  const seasonLabels = { year: 'Full Year', spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' }

  // Desktop: show in left panel
  if (window.innerWidth >= 1024) {
    if (valEl)   { valEl.textContent = text; valEl.style.color = color }
    if (labelEl) labelEl.textContent = `${yearA} → ${yearB} · ${seasonLabels[app.season] || app.season}`
    el?.classList.remove('hidden')
  } else {
    el?.classList.add('hidden')
  }

  // Mobile: show in legend-m box
  if (mValEl) { mValEl.textContent = text; mValEl.style.color = color }
  mWrap?.classList.remove('hidden')
}

// ─────────────────────────────────────────
// SYNC LEGEND + PANEL
// ─────────────────────────────────────────
function _sync() {
  const { yearA, yearB } = getCompareYears()
  updateLegend({
    variable: app.variable,
    compare:  app.compare,
    year:     app.year,
    season:   app.season,
    yearA, yearB,
  })
  renderPanel(app.variable)
}

// ─────────────────────────────────────────
// PEEK (mobile temporary point)
// ─────────────────────────────────────────
function _showPeek(lon, lat) {
  const { yearA, yearB } = getCompareYears()
  const value = getValueAtCoord(lon, lat)
  const unit  = VARIABLES[app.variable]?.unit || ''

  const el = createPeekEl(lon, lat, {
    variable: app.variable,
    compare:  app.compare,
    value, unit, yearA, yearB,
    onClose: () => { removePeekMarker(); _peek = null },
    onPin: () => { removePeekMarker(); _peek = null; _addPin(lon, lat) },
  })

  _peek = { lon, lat, el }
  setPeekMarker(lon, lat, el)
}

function _syncPeek() {
  if (!_peek) return
  const { yearA, yearB } = getCompareYears()
  updatePeekValue(_peek.el, {
    variable: app.variable,
    compare:  app.compare,
    value:    getValueAtCoord(_peek.lon, _peek.lat),
    unit:     VARIABLES[app.variable]?.unit || '',
    yearA, yearB,
  })
}

// ─────────────────────────────────────────
// PINNED POINTS
// ─────────────────────────────────────────
function _addPin(lon, lat) {
  if (_pins.length >= 20) return
  const id    = ++_pinCounter
  const value = getValueAtCoord(lon, lat)
  const { yearA, yearB } = getCompareYears()
  const el = createPinEl(id, lon, lat, {
    variable: app.variable,
    compare:  app.compare,
    value,
    unit:     VARIABLES[app.variable]?.unit || '',
    yearA, yearB,
    onRemove: () => _removePin(id),
  })
  _pins.push({ id, lon, lat, el })
  addPinMarker(id, lon, lat, el)
}

function _removePin(id) {
  const idx = _pins.findIndex(p => p.id === id)
  if (idx === -1) return
  _pins.splice(idx, 1)
  removePinMarker(id)
}

function _syncPins() {
  const { yearA, yearB } = getCompareYears()
  for (const pin of _pins) {
    updatePinValue(pin.el, {
      variable: app.variable,
      compare:  app.compare,
      value:    getValueAtCoord(pin.lon, pin.lat),
      unit:     VARIABLES[app.variable]?.unit || '',
      yearA, yearB,
    })
  }
}
