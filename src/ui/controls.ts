// Control panel: radiation, burst, scrubber, time speed, resync, seed.
//
// The panel keeps its own copy of the settings so they survive a restart
// (a restart builds a brand-new Sim and then calls apply()).

import { FRAME_COUNT } from '../core/configMemory'
import type { Sim } from '../core/sim'

export interface Settings {
  rate: number
  scrubEnabled: boolean
  scrubSpeed: number
  timeScale: number
  autoResync: boolean
}

export interface ControlActions {
  getSim(): Sim
  burst(): void
  restart(seed: number): void
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text) e.textContent = text
  return e
}

function slider(min: number, max: number, step: number, value: number): HTMLInputElement {
  const input = el('input')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.step = String(step)
  input.value = String(value)
  return input
}

function toggle(label: string, checked: boolean): { wrap: HTMLLabelElement; input: HTMLInputElement } {
  const wrap = el('label', 'toggle')
  const input = el('input')
  input.type = 'checkbox'
  input.checked = checked
  wrap.append(input, document.createTextNode(label))
  return { wrap, input }
}

function control(title: string, value: HTMLElement | null, ...body: HTMLElement[]): HTMLElement {
  const box = el('div', 'control')
  const head = el('div', 'control-head')
  head.append(el('span', '', title))
  if (value) head.append(value)
  box.append(head, ...body)
  return box
}

export class Controls {
  readonly element: HTMLElement
  readonly settings: Settings = {
    rate: 2,
    scrubEnabled: false,
    scrubSpeed: 8,
    timeScale: 1,
    autoResync: false,
  }
  private seedLabel: HTMLElement

  constructor(actions: ControlActions) {
    const s = this.settings
    this.element = el('div')

    // Radiation
    const rateValue = el('span', 'value mono')
    const rate = slider(0, 20, 0.5, s.rate)
    const burst = el('button', 'btn', 'Burst (multi-bit upset)')
    burst.addEventListener('click', () => actions.burst())
    const burstRow = el('div', 'row')
    burstRow.style.marginTop = '8px'
    burstRow.append(burst)
    this.element.append(
      control('Radiation', rateValue, rate, burstRow, el('div', 'hint', 'Burst flips 2 or 3 bits in one frame at once.')),
    )

    // Scrubber
    const scrub = toggle('Scrubber on', s.scrubEnabled)
    const speedValue = el('span', 'value mono')
    const speed = slider(1, 64, 1, s.scrubSpeed)
    const speedHint = el('div', 'hint')
    const scrubBox = control('Scrub speed', speedValue, speed, speedHint)
    const scrubToggleBox = el('div', 'control')
    scrubToggleBox.append(scrub.wrap)
    this.element.append(scrubToggleBox, scrubBox)

    // Time speed
    const seg = el('div', 'segmented')
    const speedButtons = [1, 4, 16].map((x) => {
      const b = el('button', '', `${x}×`)
      b.addEventListener('click', () => {
        s.timeScale = x
        update()
      })
      seg.append(b)
      return { b, x }
    })
    this.element.append(control('Time speed', null, seg))

    // State recovery
    const reset = el('button', 'btn', 'Reset state')
    reset.title = 'Copy the golden counter state into your FPGA (resync)'
    reset.addEventListener('click', () => actions.getSim().resync())
    const auto = toggle('Auto-resync when ECC is clean', s.autoResync)
    const resetRow = el('div', 'row')
    resetRow.append(reset, auto.wrap)
    this.element.append(
      control('State', null, resetRow, el('div', 'hint', 'Scrubbing repairs configuration bits, not the counter value.')),
    )

    // Seed
    this.seedLabel = el('span', 'seed mono')
    const restart = el('button', 'btn', 'Restart')
    restart.title = 'Reload everything from boot flash and replay with the same seed'
    restart.addEventListener('click', () => actions.restart(actions.getSim().seed))
    const newSeed = el('button', 'btn', 'New seed')
    newSeed.addEventListener('click', () => actions.restart(Math.floor(Math.random() * 1_000_000)))
    const seedRow = el('div', 'row')
    seedRow.append(restart, newSeed)
    this.element.append(control('Run', this.seedLabel, seedRow))

    const update = () => {
      s.rate = Number(rate.value)
      s.scrubEnabled = scrub.input.checked
      s.scrubSpeed = Number(speed.value)
      s.autoResync = auto.input.checked

      rateValue.textContent = `${s.rate.toFixed(1)} flips/s`
      speedValue.textContent = `${s.scrubSpeed} frames/s`
      const sweep = FRAME_COUNT / s.scrubSpeed
      speedHint.textContent = `One full sweep of memory every ${sweep < 10 ? sweep.toFixed(1) : sweep.toFixed(0)} s.`
      speed.disabled = !s.scrubEnabled
      scrubBox.style.opacity = s.scrubEnabled ? '1' : '0.5'
      for (const { b, x } of speedButtons) b.classList.toggle('active', x === s.timeScale)
      this.apply(actions.getSim())
    }

    for (const input of [rate, speed, scrub.input, auto.input]) input.addEventListener('input', update)
    update()
  }

  /** Push the current settings into a simulation. */
  apply(sim: Sim): void {
    sim.radiation.rate = this.settings.rate
    sim.scrubber.enabled = this.settings.scrubEnabled
    sim.scrubber.speed = this.settings.scrubSpeed
    sim.timeScale = this.settings.timeScale
    sim.autoResync = this.settings.autoResync
    this.seedLabel.textContent = `seed ${sim.seed}`
  }
}
