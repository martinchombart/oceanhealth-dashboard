// ─────────────────────────────────────────────────────────────
// ui.js  —  All DOM UI updates: legend, badge, tooltip, panel
// ─────────────────────────────────────────────────────────────

import { VARIABLES, DEFAULT_YEAR } from './config.js'

// ─────────────────────────────────────────
// LEGEND
// ─────────────────────────────────────────
export function updateLegend({ variable, compare, year, season, yearA, yearB }) {
  const meta = VARIABLES[variable]
  if (!meta) return

  const seasonLabel = document.getElementById('season-label')?.textContent?.trim() || season

  // Update both desktop ('') and mobile ('-m') legend instances
  for (const sfx of ['', '-m']) {
    const titleEl = document.getElementById('leg-title' + sfx)
    const barEl   = document.getElementById('leg-bar'   + sfx)
    const minEl   = document.getElementById('leg-min'   + sfx)
    const midEl   = document.getElementById('leg-mid'   + sfx)
    const maxEl   = document.getElementById('leg-max'   + sfx)
    const modeEl  = document.getElementById('leg-mode'  + sfx)
    if (!barEl) continue

    if (titleEl) titleEl.textContent = meta.label

    if (compare) {
      barEl.style.background = meta.diffGrad
      if (minEl)  minEl.textContent  = meta.compareRange[0] + ' ' + meta.unit
      if (midEl)  midEl.textContent  = '± 0'
      if (maxEl)  maxEl.textContent  = '+' + meta.compareRange[1] + ' ' + meta.unit
      if (modeEl) modeEl.innerHTML   = `<span style="color:#fbbf24">Δ</span> Difference ${yearA} → ${yearB}`
    } else {
      barEl.style.background = meta.gradient
      if (minEl)  minEl.textContent  = meta.domain[0] + ' ' + meta.unit
      if (midEl)  midEl.textContent  = meta.midLabel
      if (maxEl)  maxEl.textContent  = meta.domain[1] + ' ' + meta.unit
      if (modeEl) modeEl.textContent = ''
    }
  }

  // Badge
  const badge = document.getElementById('badge-text')
  if (badge) {
    badge.textContent = compare
      ? `Compare Mode · ${yearA} → ${yearB} · ${seasonLabel}`
      : `Normal Mode · ${year} · ${seasonLabel}`
  }
}

// ─────────────────────────────────────────
// CURSOR TOOLTIP
// ─────────────────────────────────────────
let _tooltipVariable = 'temperature'
let _tooltipCompare  = false
let _tooltipYearA    = 1993
let _tooltipYearB    = DEFAULT_YEAR

export function initTooltip() {
  if (window.innerWidth < 1024) return  // no hover tooltip on mobile
  const wrap = document.getElementById('map-wrap')
  const tt   = document.getElementById('tooltip')
  wrap.addEventListener('mousemove', e => {
    tt.style.left = (e.clientX + 14) + 'px'
    tt.style.top  = (e.clientY + 14) + 'px'
  })
  wrap.addEventListener('mouseleave', () => tt.classList.add('hidden'))
}

export function updateTooltip(value, unit, lon, lat, hasData) {
  if (window.innerWidth < 1024) return  // no tooltip on mobile
  const tt   = document.getElementById('tooltip')
  const meta = VARIABLES[_tooltipVariable]

  document.getElementById('tt-label').textContent = meta?.label || ''

  const latStr = lat >= 0 ? lat.toFixed(2) + '°N' : Math.abs(lat).toFixed(2) + '°S'
  const lonStr = lon >= 0 ? lon.toFixed(2) + '°E' : Math.abs(lon).toFixed(2) + '°W'
  document.getElementById('tt-coord').textContent = `${latStr},  ${lonStr}`

  if (!hasData || value === null || value === undefined) {
    tt.classList.add('hidden')
    return
  } else if (_tooltipCompare) {
    const sign = value >= 0 ? '+' : ''
    document.getElementById('tt-value').textContent = sign + value.toFixed(3)
    document.getElementById('tt-unit').textContent  =
      `${unit} change  (${_tooltipYearA} → ${_tooltipYearB})`
  } else {
    document.getElementById('tt-value').textContent = value.toFixed(2)
    document.getElementById('tt-unit').textContent  = unit || ''
  }

  tt.classList.remove('hidden')
}

export function setTooltipState(variable, compare, yearA, yearB) {
  _tooltipVariable = variable
  _tooltipCompare  = compare
  _tooltipYearA    = yearA
  _tooltipYearB    = yearB
}

// ─────────────────────────────────────────
// LOADING OVERLAY
// ─────────────────────────────────────────
export function setLoading(on) {
  const el = document.getElementById('loading')
  if (!el) return
  if (on) {
    el.style.opacity = '1'
    el.style.pointerEvents = 'auto'
  } else {
    el.style.opacity = '0'
    el.style.pointerEvents = 'none'
  }
}

// ─────────────────────────────────────────
// INFO OVERLAY + HOW TO READ
// ─────────────────────────────────────────
export function initPanel() {
  const overlay   = document.getElementById('info-overlay')
  const closeBtn  = document.getElementById('info-overlay-close')
  const openBtn   = document.getElementById('info-overlay-open')
  const howBtn    = document.getElementById('how-to-read-btn')
  const howPop    = document.getElementById('how-to-read-pop')

  const isDesktop = () => window.innerWidth >= 1024

  const _open = () => {
    overlay.style.opacity = '0'
    if (isDesktop()) overlay.style.transform = 'translateY(-6px)'
    overlay.classList.remove('hidden')
    overlay.classList.add('flex')
    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay.style.opacity = '1'
      if (isDesktop()) overlay.style.transform = ''
    }))
    if (isDesktop()) {
      openBtn.style.display = 'none'
    } else {
      openBtn?.classList.add('is-active')
    }
  }

  const _close = () => {
    overlay.style.opacity = '0'
    if (isDesktop()) overlay.style.transform = 'translateY(-6px)'
    setTimeout(() => {
      overlay.classList.add('hidden')
      overlay.classList.remove('flex')
      overlay.style.opacity = ''
      if (isDesktop()) overlay.style.transform = ''
    }, 250)
    if (isDesktop()) {
      openBtn.style.display = ''
      openBtn.classList.remove('is-appearing')
      void openBtn.offsetWidth // force reflow to restart animation
      openBtn.classList.add('is-appearing')
    } else {
      openBtn?.classList.remove('is-active')
    }
  }

  closeBtn?.addEventListener('click', _close)
  openBtn?.addEventListener('click', () => overlay.classList.contains('hidden') ? _open() : _close())

  // Auto-open on desktop
  if (isDesktop()) _open()

  let howOpen = false
  howBtn?.addEventListener('click', e => {
    e.stopPropagation()
    howOpen = !howOpen
    howPop.classList.toggle('hidden', !howOpen)
  })

  document.addEventListener('click', () => {
    if (howOpen) {
      howOpen = false
      howPop.classList.add('hidden')
    }
  })
}

// ─────────────────────────────────────────
// PINNED POINT WINDOWS
// ─────────────────────────────────────────
function _pinValueContent(value, unit, compare, yearA, yearB, variable) {
  if (value === null) {
    return `<div class="pin-val" style="color:rgba(255,255,255,0.25);">—</div>`
  }
  const decimals = variable === 'ph' ? 3 : 2
  if (compare) {
    const sign  = value >= 0 ? '+' : ''
    const thr   = variable === 'ph' ? 0.005 : 0.02
    const color = value > thr ? '#f87171' : value < -thr ? '#60a5fa' : '#f5f5f5'
    return `
      <span class="pin-val" style="color:${color};">${sign}${value.toFixed(decimals)}</span>
      <span class="pin-unit">${unit}</span>
      <div class="pin-ctx">${yearA} → ${yearB}</div>`
  }
  return `
    <span class="pin-val" style="color:#f5f5f5;">${value.toFixed(decimals)}</span>
    <span class="pin-unit">${unit}</span>`
}

// ─────────────────────────────────────────
// PEEK CARD (mobile temporary point)
// ─────────────────────────────────────────
export function createPeekEl(lon, lat, { variable, compare, value, unit, yearA, yearB, onClose, onPin }) {
  const meta   = VARIABLES[variable]
  const latStr = lat >= 0 ? lat.toFixed(1) + '°N' : Math.abs(lat).toFixed(1) + '°S'
  const lonStr = lon >= 0 ? lon.toFixed(1) + '°E' : Math.abs(lon).toFixed(1) + '°W'

  const wrap = document.createElement('div')
  wrap.className = 'peek-marker'

  wrap.innerHTML = `
    <div class="peek-dot"></div>
    <div class="peek-card">
      <button class="peek-close" aria-label="Close">×</button>
      <div class="peek-card-label">${meta?.label || variable}</div>
      <div class="pin-val-wrap">${_pinValueContent(value, unit, compare, yearA, yearB, variable)}</div>
      <div class="peek-card-coord">${latStr},&nbsp;${lonStr}</div>
      <button class="peek-pin" aria-label="Pin">📍</button>
    </div>`

  wrap.querySelector('.peek-close').addEventListener('click', e => { e.stopPropagation(); onClose() })
  wrap.querySelector('.peek-pin').addEventListener('click',  e => { e.stopPropagation(); onPin() })
  return wrap
}

export function updatePeekValue(el, { variable, compare, value, unit, yearA, yearB }) {
  const meta    = VARIABLES[variable]
  const labelEl = el.querySelector('.peek-card-label')
  const valWrap = el.querySelector('.pin-val-wrap')
  if (labelEl) labelEl.textContent = meta?.label || variable
  if (valWrap)  valWrap.innerHTML  = _pinValueContent(value, unit, compare, yearA, yearB, variable)
}

export function createPinEl(id, lon, lat, { variable, compare, value, unit, yearA, yearB, onRemove }) {
  const meta   = VARIABLES[variable]
  const latStr = lat >= 0 ? lat.toFixed(1) + '°N' : Math.abs(lat).toFixed(1) + '°S'
  const lonStr = lon >= 0 ? lon.toFixed(1) + '°E' : Math.abs(lon).toFixed(1) + '°W'

  const wrap = document.createElement('div')
  wrap.className = 'pin-marker'

  wrap.innerHTML = `
    <div class="pin-dot"></div>
    <div class="pin-card">
      <button class="pin-remove" aria-label="Remove pin">✕</button>
      <div class="pin-card-label" style="color:${meta?.accent || '#60a5fa'};">${meta?.label || variable}</div>
      <div class="pin-card-coord">${latStr},&nbsp;${lonStr}</div>
      <div class="pin-val-wrap">
        ${_pinValueContent(value, unit, compare, yearA, yearB, variable)}
      </div>
    </div>`

  wrap.querySelector('.pin-remove').addEventListener('click', e => {
    e.stopPropagation()
    onRemove()
  })
  return wrap
}

export function updatePinValue(el, { variable, compare, value, unit, yearA, yearB }) {
  const meta    = VARIABLES[variable]
  const labelEl = el.querySelector('.pin-card-label')
  const valWrap = el.querySelector('.pin-val-wrap')
  if (labelEl) { labelEl.textContent = meta?.label || variable; labelEl.style.color = meta?.accent || '#60a5fa' }
  if (valWrap)   valWrap.innerHTML = _pinValueContent(value, unit, compare, yearA, yearB, variable)
}

export function renderPanel(variable) {
  const content = document.getElementById('info-overlay-content')
  const title   = document.getElementById('overlay-title')
  const howText = document.getElementById('how-to-read-text')
  const meta    = VARIABLES[variable]
  if (!content || !meta) return

  if (title)   title.textContent = meta.label
  if (howText) howText.textContent = meta.interpret

  const statsHtml = meta.stats.map(s => `
    <p class="text-[12px] leading-snug mb-1" style="color:rgba(255,255,255,0.6)">
      ${s.label}: <strong style="color:${meta.accent}">${s.value}</strong>
    </p>`).join('')

  const importanceHtml = meta.importance
    .split(/\n\s*\n/)
    .map(p => `<p class="text-[13px] leading-relaxed mb-3" style="color:rgba(255,255,255,0.7)">${p.trim()}</p>`)
    .join('')

  content.innerHTML = `
    ${importanceHtml}

    <div class="mb-3 py-1" style="border-top:1px solid rgba(255,255,255,0.08);border-bottom:1px solid rgba(255,255,255,0.08)">
      <div class="font-display font-extrabold text-[11px] uppercase tracking-wide mt-2 mb-1" style="color:${meta.accent}">📊 Key Statistics</div>
      ${statsHtml}
    </div>

    <p class="text-center text-[11px] pt-2 leading-relaxed" style="color:rgba(255,255,255,0.35);border-top:1px solid rgba(255,255,255,0.08)">
      ${(meta.sources || []).join(' · ')}
    </p>`
}
