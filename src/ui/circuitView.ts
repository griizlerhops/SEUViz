// LED rows for the faulty ("Your FPGA") and golden circuits, their counter
// states, and the status badges (output mismatch, state diverged).

import { LED_COUNT } from '../core/layout'
import type { Sim } from '../core/sim'

interface Row {
  leds: HTMLElement[]
  state: HTMLElement
}

function stateText(q: number): string {
  return `Q = <b class="mono">${q.toString(2).padStart(4, '0')}</b> <span class="mono">(${String(q).padStart(2, ' ')})</span>`
}

export class CircuitView {
  readonly element: HTMLElement
  private faulty: Row
  private golden: Row
  private outputBadge: HTMLElement
  private memoryBadge: HTMLElement
  private divergedBadge: HTMLElement

  constructor(private getSim: () => Sim) {
    this.element = document.createElement('div')
    this.faulty = this.makeRow('Your FPGA')
    this.golden = this.makeRow('Golden reference')

    const status = document.createElement('div')
    status.className = 'status-line'
    this.outputBadge = document.createElement('span')
    this.memoryBadge = document.createElement('span')
    this.divergedBadge = document.createElement('span')
    this.divergedBadge.className = 'badge warn'
    status.append(this.outputBadge, this.memoryBadge, this.divergedBadge)
    this.element.append(status)
  }

  private makeRow(label: string): Row {
    const row = document.createElement('div')
    row.className = 'circuit-row'
    const name = document.createElement('div')
    name.className = 'label'
    name.textContent = label
    const ledBox = document.createElement('div')
    ledBox.className = 'leds'
    const leds: HTMLElement[] = []
    for (let i = 0; i < LED_COUNT; i++) {
      const led = document.createElement('div')
      led.className = 'led'
      ledBox.append(led)
      leds.push(led)
    }
    const state = document.createElement('div')
    state.className = 'state'
    row.append(name, ledBox, state)
    this.element.append(row)
    return { leds, state }
  }

  render(): void {
    const sim = this.getSim()
    const faultyLeds = sim.faulty.leds()
    const goldenLeds = sim.golden.leds()

    for (let i = 0; i < LED_COUNT; i++) {
      this.faulty.leds[i].classList.toggle('on', faultyLeds[i] === 1)
      this.faulty.leds[i].classList.toggle('wrong', faultyLeds[i] !== goldenLeds[i])
      this.golden.leds[i].classList.toggle('on', goldenLeds[i] === 1)
    }
    this.faulty.state.innerHTML = stateText(sim.faulty.getState())
    this.golden.state.innerHTML = stateText(sim.golden.getState())

    const match = sim.outputsMatch
    this.outputBadge.className = `badge ${match ? 'good' : 'bad'}`
    this.outputBadge.textContent = match ? 'Outputs match' : 'Outputs wrong'

    const flipped = sim.memory.flippedCount()
    this.memoryBadge.className = `badge ${flipped === 0 ? 'good' : 'bad'}`
    this.memoryBadge.textContent = flipped === 0 ? 'Memory clean' : `${flipped} bit${flipped === 1 ? '' : 's'} flipped`

    // Only call out divergence as its own lesson when memory is already clean.
    this.divergedBadge.style.display = sim.stateDiverged ? '' : 'none'
    this.divergedBadge.textContent =
      flipped === 0
        ? 'State diverged: memory is clean, but the counter is still wrong. Scrubbing fixes configuration, not state. Press Reset state.'
        : 'State diverged: the counter no longer matches the golden reference.'
  }
}
