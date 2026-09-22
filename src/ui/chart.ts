// Timeline chart: one bar per circuit clock tick over the last 60 simulated seconds.
//   - tall red bar   = outputs wrong
//   - short green bar = outputs correct
//   - shaded band    = scrubber was on
// Height encodes the same thing as color, so it still reads without color vision.

import { TIMELINE_SECONDS, type Sample } from '../core/metrics'
import type { Sim } from '../core/sim'

const HEIGHT = 120
const AXIS = 18 // space for the time labels under the plot

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export class TimelineChart {
  readonly element: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private tooltip: HTMLElement
  private width = 0
  private hoverX: number | null = null

  constructor(private getSim: () => Sim) {
    this.element = document.createElement('div')
    this.element.className = 'chart-wrap'
    this.canvas = document.createElement('canvas')
    this.canvas.setAttribute('role', 'img')
    this.canvas.setAttribute('aria-label', 'Timeline of whether the circuit output was correct over the last 60 seconds')
    this.ctx = this.canvas.getContext('2d')!
    this.tooltip = document.createElement('div')
    this.tooltip.className = 'chart-tip'

    const legend = document.createElement('div')
    legend.className = 'chart-legend'
    legend.innerHTML = `
      <span><i class="swatch" style="background:var(--ok);height:5px"></i>Correct output (short bar)</span>
      <span><i class="swatch" style="background:var(--bad)"></i>Wrong output (tall bar)</span>
      <span><i class="swatch" style="background:var(--chart-scrub);outline:1px solid var(--border)"></i>Scrubber on</span>`

    this.element.append(this.canvas, this.tooltip, legend)
    this.canvas.addEventListener('pointermove', (e) => {
      this.hoverX = e.clientX - this.canvas.getBoundingClientRect().left
    })
    this.canvas.addEventListener('pointerleave', () => {
      this.hoverX = null
    })
    new ResizeObserver(() => this.resize()).observe(this.element)
  }

  private resize(): void {
    const width = this.element.clientWidth
    if (width === 0 || width === this.width) return
    this.width = width
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(HEIGHT * dpr)
    this.canvas.style.height = `${HEIGHT}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  render(): void {
    if (this.width === 0) this.resize()
    const { ctx, width } = this
    const sim = this.getSim()
    const samples = sim.metrics.timeline()
    const now = sim.time
    const start = now - TIMELINE_SECONDS
    const plotH = HEIGHT - AXIS
    const x = (t: number) => ((t - start) / TIMELINE_SECONDS) * width

    const ok = cssVar('--ok')
    const bad = cssVar('--bad')
    const scrub = cssVar('--chart-scrub')
    const border = cssVar('--border')
    const muted = cssVar('--muted')

    ctx.clearRect(0, 0, width, HEIGHT)

    // Shaded bands where the scrubber was on (merge consecutive samples).
    ctx.fillStyle = scrub
    let bandStart: number | null = null
    for (let i = 0; i <= samples.length; i++) {
      const s = samples[i]
      if (s && s.scrubbing && bandStart === null) bandStart = i > 0 ? samples[i - 1].time : s.time
      if ((!s || !s.scrubbing) && bandStart !== null) {
        const end = s ? s.time : now
        ctx.fillRect(x(bandStart), 0, x(end) - x(bandStart), plotH)
        bandStart = null
      }
    }

    // Baseline.
    ctx.fillStyle = border
    ctx.fillRect(0, plotH - 1, width, 1)

    // One bar per tick: up to 3px wide, shrinking to 1px when ticks are dense (fast time speeds).
    const barW = Math.max(1, Math.min(3, width / Math.max(1, samples.length) - 1))
    for (const s of samples) {
      const h = s.match ? plotH * 0.22 : plotH * 0.85
      ctx.fillStyle = s.match ? ok : bad
      ctx.fillRect(x(s.time) - barW, plotH - 1 - h, barW, h)
    }

    // Time axis labels.
    ctx.fillStyle = muted
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textBaseline = 'bottom'
    ctx.textAlign = 'left'
    ctx.fillText('60 s ago', 0, HEIGHT)
    ctx.textAlign = 'center'
    ctx.fillText('30 s', width / 2, HEIGHT)
    ctx.textAlign = 'right'
    ctx.fillText('now', width, HEIGHT)

    this.renderHover(samples, start, plotH)
  }

  private renderHover(samples: readonly Sample[], start: number, plotH: number): void {
    if (this.hoverX === null || samples.length === 0) {
      this.tooltip.style.display = 'none'
      return
    }
    const t = start + (this.hoverX / this.width) * TIMELINE_SECONDS
    let nearest = samples[0]
    for (const s of samples) if (Math.abs(s.time - t) < Math.abs(nearest.time - t)) nearest = s
    const px = ((nearest.time - start) / TIMELINE_SECONDS) * this.width

    const ctx = this.ctx
    ctx.fillStyle = cssVar('--text')
    ctx.globalAlpha = 0.5
    ctx.fillRect(px - 0.5, 0, 1, plotH)
    ctx.globalAlpha = 1

    const ago = this.getSim().time - nearest.time
    this.tooltip.style.display = 'block'
    this.tooltip.textContent = `${ago.toFixed(1)} s ago · ${nearest.match ? 'output correct' : 'output wrong'} · scrubber ${nearest.scrubbing ? 'on' : 'off'}`
    const tipW = this.tooltip.offsetWidth
    this.tooltip.style.left = `${Math.min(Math.max(0, px - tipW / 2), this.width - tipW)}px`
  }
}
