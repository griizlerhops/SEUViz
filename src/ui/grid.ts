// Configuration memory grid: 32 rows (frames) x 39 columns (32 data + 7 check).
// Drawn on a canvas because it redraws ~1,248 cells every animation frame.

import { FRAME_COUNT } from '../core/configMemory'
import { DATA_BITS, FRAME_BITS } from '../core/ecc'
import { isEssentialBit, lutEntryAt } from '../core/layout'
import type { Sim, TickEvents } from '../core/sim'

const FLASH_MS = 600 // how long corrected / reloaded highlights last (real time)
const GUTTER = 26 // left space for frame numbers
const CHECK_GAP = 6 // visual gap between data bits and check bits

interface Palette {
  unused: string
  essential: string
  check: string
  flipped: string
  corrected: string
  reloaded: string
  cursor: string
  muted: string
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    unused: v('--bit-unused'),
    essential: v('--bit-essential'),
    check: v('--bit-check'),
    flipped: v('--bit-flipped'),
    corrected: v('--bit-corrected'),
    reloaded: v('--bit-reloaded'),
    cursor: v('--cursor'),
    muted: v('--muted'),
  }
}

export class GridView {
  readonly element: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private info: HTMLElement
  private palette: Palette = readPalette()

  private cell = 12 // cell size in CSS pixels, recomputed on resize
  private cssWidth = 0

  // Flash expiry times (performance.now() ms), keyed by `${frame}:${bit}`.
  private correctedUntil = new Map<string, number>()
  private reloadedUntil: number[] = new Array(FRAME_COUNT).fill(0)

  constructor(
    private getSim: () => Sim,
    private onFlip: (frame: number, bit: number) => void,
  ) {
    this.element = document.createElement('div')
    this.element.className = 'grid-wrap'
    this.canvas = document.createElement('canvas')
    this.canvas.setAttribute('role', 'img')
    this.canvas.setAttribute('aria-label', 'Configuration memory: 32 frames by 39 bits. Click a bit to flip it.')
    this.ctx = this.canvas.getContext('2d')!
    this.info = document.createElement('div')
    this.info.className = 'hover-info'
    this.info.textContent = 'Hover a bit to see what it controls. Click to flip it.'
    this.element.append(this.canvas, this.info)

    this.canvas.addEventListener('click', (e) => {
      const hit = this.hitTest(e)
      if (hit) this.onFlip(hit.frame, hit.bit)
    })
    this.canvas.addEventListener('mousemove', (e) => this.describe(this.hitTest(e)))
    this.canvas.addEventListener('mouseleave', () => this.describe(null))

    new ResizeObserver(() => this.resize()).observe(this.element)
  }

  /** Re-read colors (after a light/dark switch). */
  refreshPalette(): void {
    this.palette = readPalette()
  }

  /** Clear all flashes (used when the simulation restarts). */
  clearFlashes(): void {
    this.correctedUntil.clear()
    this.reloadedUntil.fill(0)
  }

  /** Register scrubber activity so it can flash. */
  addEvents(events: TickEvents, now: number): void {
    for (const e of events.scrub) {
      if (e.type === 'corrected') this.correctedUntil.set(`${e.frame}:${e.bit}`, now + FLASH_MS)
      else if (e.type === 'reloaded') this.reloadedUntil[e.frame] = now + FLASH_MS
      else this.reloadedUntil.fill(now + FLASH_MS * 2)
    }
  }

  private resize(): void {
    const width = this.element.clientWidth
    if (width === 0 || width === this.cssWidth) return
    this.cssWidth = width
    this.cell = Math.max(4, (width - GUTTER - CHECK_GAP) / FRAME_BITS)
    const height = Math.ceil(this.cell * FRAME_COUNT)
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(height * dpr)
    this.canvas.style.height = `${height}px`
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  private colX(bit: number): number {
    return GUTTER + bit * this.cell + (bit >= DATA_BITS ? CHECK_GAP : 0)
  }

  private hitTest(e: MouseEvent): { frame: number; bit: number } | null {
    const rect = this.canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const frame = Math.floor(y / this.cell)
    let bit: number
    const checkStart = this.colX(DATA_BITS)
    if (x < GUTTER) return null
    if (x < GUTTER + DATA_BITS * this.cell) bit = Math.floor((x - GUTTER) / this.cell)
    else if (x >= checkStart) bit = DATA_BITS + Math.floor((x - checkStart) / this.cell)
    else return null // clicked in the gap
    if (frame < 0 || frame >= FRAME_COUNT || bit < 0 || bit >= FRAME_BITS) return null
    return { frame, bit }
  }

  private describe(hit: { frame: number; bit: number } | null): void {
    if (!hit) {
      this.info.textContent = 'Hover a bit to see what it controls. Click to flip it.'
      return
    }
    const { frame, bit } = hit
    const where = `Frame ${frame}, bit ${bit}`
    const entry = lutEntryAt(frame, bit)
    let what: string
    if (bit >= DATA_BITS) {
      what = `ECC check bit ${bit - DATA_BITS} (protects the frame, doesn't define logic)`
    } else if (entry) {
      const role = entry.lut < 4 ? `next-state bit ${entry.lut}` : `LED ${entry.lut - 4}`
      const input = entry.entry.toString(2).padStart(4, '0')
      what = `essential: LUT${entry.lut} (${role}), output when Q = ${input}`
    } else {
      what = 'unused bit (flipping it changes nothing)'
    }
    const flipped = this.getSim().memory.isFlipped(frame, bit) ? ' [currently flipped]' : ''
    this.info.textContent = `${where}: ${what}${flipped}`
  }

  render(now: number): void {
    if (this.cssWidth === 0) this.resize()
    const sim = this.getSim()
    const { ctx, cell, palette: p } = this
    const height = cell * FRAME_COUNT
    ctx.clearRect(0, 0, this.cssWidth, height)

    const pad = cell > 8 ? 1 : 0.5 // spacing between cells
    const size = cell - pad * 2

    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      const y = frame * cell
      const reloading = this.reloadedUntil[frame] > now

      // Frame number in the gutter (every other row when cells are small).
      if (cell >= 11 || frame % 4 === 0) {
        ctx.fillStyle = p.muted
        ctx.font = `${Math.min(10, cell * 0.8)}px ui-monospace, Menlo, monospace`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(frame), GUTTER - 6, y + cell / 2)
      }

      for (let bit = 0; bit < FRAME_BITS; bit++) {
        const x = this.colX(bit)
        let color: string
        let alpha = 1
        if (sim.memory.isFlipped(frame, bit)) {
          color = p.flipped
          // Flips in unused bits are real but harmless: show them fainter.
          if (bit < DATA_BITS && !isEssentialBit(frame, bit)) alpha = 0.55
        } else if ((this.correctedUntil.get(`${frame}:${bit}`) ?? 0) > now) {
          color = p.corrected
        } else if (reloading) {
          color = p.reloaded
        } else if (bit >= DATA_BITS) {
          color = p.check
        } else if (isEssentialBit(frame, bit)) {
          color = p.essential
        } else {
          color = p.unused
        }
        ctx.globalAlpha = alpha
        ctx.fillStyle = color
        ctx.fillRect(x + pad, y + pad, size, size)
        ctx.globalAlpha = 1
      }
    }

    // Scrubber cursor: outline the frame currently being read.
    if (sim.scrubber.enabled) {
      const y = sim.scrubber.cursorFrame * cell
      ctx.strokeStyle = sim.scrubber.isReloading ? p.reloaded : p.cursor
      ctx.lineWidth = 2
      ctx.strokeRect(GUTTER - 1, y, this.colX(FRAME_BITS - 1) + cell - GUTTER + 2, cell)
      // Arrow in the gutter.
      ctx.fillStyle = ctx.strokeStyle
      ctx.beginPath()
      ctx.moveTo(2, y + cell * 0.2)
      ctx.lineTo(8, y + cell / 2)
      ctx.lineTo(2, y + cell * 0.8)
      ctx.fill()
    }

    // Drop expired flashes so the map doesn't grow forever.
    for (const [key, until] of this.correctedUntil) if (until <= now) this.correctedUntil.delete(key)
  }
}
