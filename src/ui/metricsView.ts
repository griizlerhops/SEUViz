// Metric tiles: correctness and scrubber activity counters.

import type { Sim } from '../core/sim'

function pct(v: number | null): string {
  return v === null ? '–' : `${v.toFixed(1)}%`
}

export class MetricsView {
  readonly element: HTMLElement
  private values = new Map<string, HTMLElement>()

  constructor(private getSim: () => Sim) {
    this.element = document.createElement('div')
    this.element.className = 'metrics'
    const tiles: [string, string][] = [
      ['correct', 'Output correct (all time)'],
      ['correctOn', 'Correct, scrubber on'],
      ['correctOff', 'Correct, scrubber off'],
      ['flips', 'Flips injected'],
      ['essential', 'Hit essential bits'],
      ['corrected', 'Errors corrected (ECC)'],
      ['reloaded', 'Frames reloaded'],
      ['current', 'Uncorrected flips now'],
    ]
    for (const [key, label] of tiles) {
      const tile = document.createElement('div')
      tile.className = 'metric'
      const v = document.createElement('div')
      v.className = 'v mono'
      const k = document.createElement('div')
      k.className = 'k'
      k.textContent = label
      tile.append(v, k)
      this.element.append(tile)
      this.values.set(key, v)
    }
  }

  render(): void {
    const sim = this.getSim()
    const m = sim.metrics
    const set = (key: string, text: string) => {
      const el = this.values.get(key)!
      if (el.textContent !== text) el.textContent = text
    }
    set('correct', pct(m.correctness()))
    set('correctOn', pct(m.correctnessWhile(true)))
    set('correctOff', pct(m.correctnessWhile(false)))
    set('flips', String(m.flipsInjected))
    set('essential', String(m.essentialFlips))
    set('corrected', String(m.errorsCorrected))
    set('reloaded', String(m.framesReloaded))
    const reloadLabel = this.values.get('reloaded')!.nextElementSibling!
    const label = m.fullReloads > 0 ? `Frames reloaded (+${m.fullReloads} full)` : 'Frames reloaded'
    if (reloadLabel.textContent !== label) reloadLabel.textContent = label
    set('current', String(sim.memory.flippedCount()))
  }
}
