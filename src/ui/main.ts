// Entry point: builds the page and runs the animation loop.
// All simulation logic lives in src/core; this file only wires UI to it.

import './styles.css'
import { Sim } from '../core/sim'
import { CircuitView } from './circuitView'
import { Controls } from './controls'
import { GridView } from './grid'
import { TimelineChart } from './chart'
import { MetricsView } from './metricsView'

const DEFAULT_SEED = 1337
/** Cap on real seconds per frame, so a backgrounded tab doesn't jump ahead. */
const MAX_FRAME_DT = 0.1

let sim = new Sim(DEFAULT_SEED)
const getSim = () => sim

// ---------- Theme ----------
const THEME_KEY = 'seuviz-theme'
function currentTheme(): 'light' | 'dark' {
  const forced = document.documentElement.dataset.theme
  if (forced === 'light' || forced === 'dark') return forced
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
try {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved
} catch {
  // Storage unavailable (private mode): fall back to the system theme.
}

// ---------- Views ----------
const circuitView = new CircuitView(getSim)
const grid = new GridView(getSim, (frame, bit) => sim.flipAt(frame, bit))
const metricsView = new MetricsView(getSim)
const chart = new TimelineChart(getSim)
const controls = new Controls({
  getSim,
  burst: () => sim.burst(),
  restart: (seed) => {
    sim = new Sim(seed)
    controls.apply(sim)
    grid.clearFlashes()
  },
})

function panel(title: string, ...children: HTMLElement[]): HTMLElement {
  const section = document.createElement('section')
  section.className = 'panel'
  const h = document.createElement('h2')
  h.textContent = title
  section.append(h, ...children)
  return section
}

function legend(): HTMLElement {
  const box = document.createElement('div')
  box.className = 'legend'
  const items: [string, string][] = [
    ['--bit-unused', 'Unused bit'],
    ['--bit-essential', 'Essential bit (LUT truth table)'],
    ['--bit-check', 'ECC check bit'],
    ['--bit-flipped', 'Flipped (faint = harmless)'],
    ['--bit-corrected', 'Just corrected'],
    ['--bit-reloaded', 'Reloaded from flash'],
  ]
  for (const [color, label] of items) {
    const item = document.createElement('span')
    const sw = document.createElement('i')
    sw.className = 'swatch'
    sw.style.background = `var(${color})`
    item.append(sw, document.createTextNode(label))
    box.append(item)
  }
  return box
}

function explainer(): HTMLElement {
  const box = document.createElement('div')
  box.className = 'explain'
  box.innerHTML = `
    <p>An FPGA's circuit is defined by its <b>configuration memory</b>. Here, 192 of the 1,248 bits are
    truth tables for 12 lookup tables that make up a counter and an LED pattern. The rest are unused bits
    and ECC check bits.</p>
    <p>A <b>single event upset</b> (SEU) is a particle strike that flips one of those bits. If it hits an
    essential bit, the circuit itself changes, and the LEDs go wrong.</p>
    <p>The <b>scrubber</b> reads memory frame by frame. ECC lets it fix any single flipped bit and detect
    two; a frame with two flips gets reloaded from boot flash. If flips arrive faster than the sweep,
    they pile up in the same frame. Three or more can fool ECC, so a CRC over all of memory catches
    what ECC missed and triggers a full reload.</p>
    <p>Scrubbing repairs configuration, <b>not state</b>. If the counter already jumped to a wrong value,
    it stays wrong until you reset it.</p>
    <p class="fine">Educational model only. This is not Efinix's scrubbing engine, memory layout, or timing.</p>`
  return box
}

const themeButton = document.createElement('button')
themeButton.className = 'icon-btn'
function syncThemeButton() {
  themeButton.textContent = currentTheme() === 'dark' ? 'Light mode' : 'Dark mode'
}
themeButton.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = next
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    // Ignore: theme just won't be remembered.
  }
})
// Re-read canvas colors whenever the theme changes, however it changed.
const onThemeChange = () => {
  syncThemeButton()
  grid.refreshPalette()
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onThemeChange)
new MutationObserver(onThemeChange).observe(document.documentElement, { attributeFilter: ['data-theme'] })
syncThemeButton()

const header = document.createElement('header')
const titleBox = document.createElement('div')
titleBox.innerHTML = `<h1>SEU Scrubbing Visualizer</h1>
  <p>Turn up the radiation, watch the LEDs go wrong, then turn on the scrubber and watch the circuit recover.</p>`
header.append(titleBox, themeButton)

const layout = document.createElement('div')
layout.className = 'layout'
const mainCol = document.createElement('div')
mainCol.className = 'main-col'
const sideCol = document.createElement('div')
sideCol.className = 'side-col'

mainCol.append(
  panel('Circuit', circuitView.element),
  panel('Configuration memory · 32 frames × (32 data + 7 ECC) bits', grid.element, legend()),
)
sideCol.append(panel('Controls', controls.element), panel('What am I looking at?', explainer()))
const metricsPanel = panel('Metrics · last 60 simulated seconds', metricsView.element, chart.element)
metricsPanel.classList.add('full-width')
layout.append(mainCol, sideCol, metricsPanel)

const app = document.getElementById('app')!
app.replaceChildren(header, layout)

// ---------- Animation loop ----------
let last = performance.now()
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, MAX_FRAME_DT)
  last = now
  const events = sim.tick(dt)
  grid.addEvents(events, now)
  grid.render(now)
  circuitView.render()
  metricsView.render()
  chart.render()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
