// ─────────────────────────────────────────────────────────────
// timeline.js  —  Year scrubber + compare handle drag
// ─────────────────────────────────────────────────────────────

import { YEAR_MIN, YEAR_MAX, DEFAULT_YEAR } from './config.js'

const MARKS = [1993, 1995, 2000, 2005, 2010, 2015, 2020, 2025]

let _compare = false
let _year    = DEFAULT_YEAR
let _yearA   = 1993
let _yearB   = DEFAULT_YEAR
let _onYear, _onCompare, _onYearFrac

// DOM
let track, fill, hdlA, hdlB, cursor, cursorYr

export function initTimeline({ onYearChange, onCompareChange, onYearFrac }) {
  _onYear    = onYearChange
  _onCompare = onCompareChange
  _onYearFrac = onYearFrac

  track    = document.getElementById('tl-track')
  fill     = document.getElementById('tl-fill')
  hdlA     = document.getElementById('hdl-a')
  hdlB     = document.getElementById('hdl-b')
  cursor   = document.getElementById('tl-cursor')
  cursorYr = document.getElementById('tl-cursor-yr')

  _buildMarks()
  requestAnimationFrame(_updateMarkLabels)
  window.addEventListener('resize', _updateMarkLabels)

  _makeDraggable(hdlA, 'a')
  _makeDraggable(hdlB, 'b')
  _makeCursorDraggable()

  _render()
}

function _buildMarks() {
  const container = document.getElementById('tl-marks')
  container.innerHTML = ''
  MARKS.forEach(y => {
    const el = document.createElement('div')
    el.className = 'tl-mark' + (y === _year ? ' active' : '')
    el.style.left = _y2p(y) + '%'
    el.innerHTML  = `<div class="tl-dot"></div><span class="tl-yr">${y}</span>`
    el.addEventListener('click', () => { if (!_compare) _setYear(y) })
    container.appendChild(el)
  })
}

function _makeDraggable(handle, which) {
  let drag = false
  handle.addEventListener('mousedown', e => { drag = true; e.stopPropagation(); e.preventDefault() })
  document.addEventListener('mousemove', e => {
    if (!drag) return
    const y = _evtToYear(e)
    if (which === 'a') _yearA = Math.min(y, _yearB - 1)
    else               _yearB = Math.max(y, _yearA + 1)
    _render()
    _onCompare?.(_yearA, _yearB)
  })
  document.addEventListener('mouseup', () => { drag = false })
  handle.addEventListener('touchstart', e => { drag = true; e.stopPropagation() }, { passive: true })
  document.addEventListener('touchmove', e => {
    if (!drag) return
    const y = _evtToYear(e.touches[0])
    if (which === 'a') _yearA = Math.min(y, _yearB - 1)
    else               _yearB = Math.max(y, _yearA + 1)
    _render()
    _onCompare?.(_yearA, _yearB)
  }, { passive: true })
  document.addEventListener('touchend', () => { drag = false })
}

function _makeCursorDraggable() {
  let drag = false
  let _debounce = null

  const onMove = clientX => {
    const r = track.getBoundingClientRect()
    const rawPct  = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100))
    const rawFrac = YEAR_MIN + (rawPct / 100) * (YEAR_MAX - YEAR_MIN)
    _year = _p2y(rawPct)
    cursor.style.left    = rawPct + '%'
    fill.style.width     = rawPct + '%'
    cursorYr.textContent = _year
    _onYearFrac?.(rawFrac)
    clearTimeout(_debounce)
    _debounce = setTimeout(() => _onYear?.(_year), 120)
  }

  const startDrag = (clientX, e) => {
    if (_compare) return
    if (e.target === hdlA || e.target === hdlB) return
    drag = true
    e.preventDefault()
    cursor.style.cursor = 'grabbing'
    onMove(clientX)
  }

  const onRelease = () => {
    if (!drag) return
    drag = false
    cursor.style.cursor = ''
    clearTimeout(_debounce)
    _onYear?.(_year)
  }

  // Mousedown anywhere on the track starts drag immediately
  track.addEventListener('mousedown', e => startDrag(e.clientX, e))
  document.addEventListener('mousemove', e => { if (drag && !_compare) onMove(e.clientX) })
  document.addEventListener('mouseup', onRelease)

  track.addEventListener('touchstart', e => {
    if (_compare || e.target === hdlA || e.target === hdlB) return
    drag = true; onMove(e.touches[0].clientX)
  }, { passive: true })
  document.addEventListener('touchmove', e => { if (drag && !_compare) onMove(e.touches[0].clientX) }, { passive: true })
  document.addEventListener('touchend', onRelease)
}

function _renderVisual() {
  cursor.style.left    = _y2p(_year) + '%'
  cursorYr.textContent = _year
  fill.style.width     = _y2p(_year) + '%'
}

function _render() {
  if (_compare) {
    hdlA.classList.remove('hidden')
    hdlB.classList.remove('hidden')
    document.getElementById('tl-cmp-hint').classList.remove('hidden')
    cursor.classList.add('hidden')

    const pA = _y2p(_yearA), pB = _y2p(_yearB)
    hdlA.style.left  = pA + '%'
    hdlB.style.left  = pB + '%'
    fill.style.left  = pA + '%'
    fill.style.width = (pB - pA) + '%'
  } else {
    hdlA.classList.add('hidden')
    hdlB.classList.add('hidden')
    document.getElementById('tl-cmp-hint').classList.add('hidden')
    cursor.classList.remove('hidden')
    cursor.style.left  = _y2p(_year) + '%'
    cursorYr.textContent = _year

    fill.style.left  = '0%'
    fill.style.width = _y2p(_year) + '%'
  }

  // Sync mark active state (decade marks no longer need active styling)
  document.querySelectorAll('.tl-mark').forEach(el => {
    el.classList.remove('active')
  })

  _updateMarkLabels()
}

// ─────────────────────────────────────────
function _updateMarkLabels() {
  const marks = Array.from(document.querySelectorAll('.tl-mark'))
  const trackWidth = track.getBoundingClientRect().width
  if (!trackWidth) return

  const isMobile = window.innerWidth < 1024
  const MIN_GAP = 40
  const CURSOR_HALF_W = 22 // approx half-width of selected year text on mobile

  // On mobile (normal mode), the cursor year label sits below the bar and may overlap marks
  const cursorX = (isMobile && !_compare)
    ? (_y2p(_year) / 100) * trackWidth
    : null

  let lastX = Infinity

  // Right to left: recent years take priority over older ones
  ;[...marks].reverse().forEach(el => {
    const x  = (parseFloat(el.style.left) / 100) * trackWidth
    const yr = el.querySelector('.tl-yr')
    if (!yr) return

    const markYear = parseInt(yr.textContent || '0')
    const hiddenByCursor = cursorX !== null && markYear !== YEAR_MAX && Math.abs(x - cursorX) < CURSOR_HALF_W + MIN_GAP / 2
    const hiddenByNeighbour = lastX - x < MIN_GAP

    yr.style.visibility = (!hiddenByCursor && !hiddenByNeighbour) ? '' : 'hidden'
    if (!hiddenByCursor && !hiddenByNeighbour) lastX = x
  })
}

// ─────────────────────────────────────────
function _y2p(y)  { return ((y - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100 }
function _p2y(p)  { return Math.round(Math.max(YEAR_MIN, Math.min(YEAR_MAX, YEAR_MIN + (p / 100) * (YEAR_MAX - YEAR_MIN)))) }
function _evtToYear(e) {
  const r = track.getBoundingClientRect()
  return _p2y(((e.clientX - r.left) / r.width) * 100)
}
function _setYear(y) { _year = y; _render(); _onYear?.(y) }

export function setCompareMode(v) { _compare = v; _render() }
export function setYear(y)        { _year = y;    _render() }
export function getCompareYears() { return { yearA: _yearA, yearB: _yearB } }
