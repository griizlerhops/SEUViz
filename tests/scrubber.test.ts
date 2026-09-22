import { describe, it, expect } from 'vitest'
import { BootFlash } from '../src/core/bootFlash'
import { ConfigMemory, FRAME_COUNT } from '../src/core/configMemory'
import { FRAME_BITS } from '../src/core/ecc'
import { buildGoldenImage } from '../src/core/layout'
import { RadiationInjector, mulberry32, poisson } from '../src/core/radiation'
import { RELOAD_DELAY, Scrubber } from '../src/core/scrubber'

function setup() {
  const flash = new BootFlash(buildGoldenImage())
  const mem = new ConfigMemory(flash.image())
  const scrubber = new Scrubber(mem, flash)
  scrubber.enabled = true
  return { flash, mem, scrubber }
}

describe('scrubber', () => {
  it('corrects a single flip at any bit of any frame', () => {
    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      for (let bit = 0; bit < FRAME_BITS; bit++) {
        const { mem, scrubber } = setup()
        mem.flipBit(frame, bit)
        expect(scrubber.scanFrame(frame)).toEqual({ type: 'corrected', frame, bit })
        expect(mem.flippedCount()).toBe(0)
      }
    }
  })

  it('reloads a frame with a double flip from boot flash', () => {
    const { mem, scrubber } = setup()
    mem.flipBit(10, 3)
    mem.flipBit(10, 35)
    expect(scrubber.scanFrame(10)).toEqual({ type: 'reloaded', frame: 10 })
    expect(mem.flippedCount()).toBe(0)
    expect(scrubber.isReloading).toBe(true)
  })

  it('sweeps frames in order at the configured speed and wraps', () => {
    const { scrubber } = setup()
    scrubber.speed = 32
    scrubber.tick(0.5) // 16 frames
    expect(scrubber.cursorFrame).toBe(16)
    scrubber.tick(0.5) // 16 more -> wraps to 0
    expect(scrubber.cursorFrame).toBe(0)
  })

  it('stalls for RELOAD_DELAY after a reload', () => {
    const { mem, scrubber } = setup()
    scrubber.speed = 10 // 0.1 s per frame
    mem.flipBit(0, 1)
    mem.flipBit(0, 2)
    scrubber.tick(0.1) // scans frame 0 -> reload + stall
    expect(scrubber.cursorFrame).toBe(1)
    scrubber.tick(RELOAD_DELAY)
    expect(scrubber.cursorFrame).toBe(1) // still stalled, nothing new scanned
    scrubber.tick(0.1)
    expect(scrubber.cursorFrame).toBe(2)
  })

  it('does nothing while disabled', () => {
    const { mem, scrubber } = setup()
    scrubber.enabled = false
    mem.flipBit(0, 0)
    expect(scrubber.tick(10)).toEqual([])
    expect(mem.flippedCount()).toBe(1)
  })
})

describe('radiation', () => {
  it('poisson draws average to lambda', () => {
    const rng = mulberry32(7)
    let total = 0
    for (let i = 0; i < 20000; i++) total += poisson(0.5, rng)
    expect(total / 20000).toBeCloseTo(0.5, 1)
  })

  it('is reproducible for the same seed', () => {
    const run = (seed: number) => {
      const mem = new ConfigMemory(buildGoldenImage())
      const rad = new RadiationInjector(mem, seed)
      rad.rate = 10
      const hits = []
      for (let i = 0; i < 100; i++) hits.push(...rad.tick(0.05))
      return hits
    }
    expect(run(42)).toEqual(run(42))
    expect(run(42)).not.toEqual(run(43))
  })

  it('burst flips 2-3 distinct bits in one frame', () => {
    const mem = new ConfigMemory(buildGoldenImage())
    const rad = new RadiationInjector(mem, 1)
    for (let i = 0; i < 50; i++) {
      const hits = rad.burst()
      expect(hits.length === 2 || hits.length === 3).toBe(true)
      expect(new Set(hits.map((h) => h.frame)).size).toBe(1)
      expect(new Set(hits.map((h) => h.bit)).size).toBe(hits.length)
      for (const h of hits) mem.flipBit(h.frame, h.bit) // undo
    }
    expect(mem.flippedCount()).toBe(0)
  })
})

describe('scrubber CRC backstop', () => {
  it('a triple flip can fool ECC, and the end-of-sweep CRC catches it', () => {
    const { flash, mem, scrubber } = setup()
    // Bits 0, 1, 2 sit at codeword positions 3, 5, 6: 3 ^ 5 ^ 6 = 0, so the
    // syndrome is 0 and ECC blames the overall parity bit. A miscorrection.
    mem.flipBit(4, 0)
    mem.flipBit(4, 1)
    mem.flipBit(4, 2)
    const first = scrubber.scanFrame(4)
    expect(first?.type).toBe('corrected')
    expect(mem.flippedCount()).toBeGreaterThan(0) // ECC made it look clean, but it isn't
    expect(scrubber.scanFrame(4)).toBeNull()

    scrubber.speed = 64
    const events = scrubber.tick(1) // two full sweeps
    expect(events.some((e) => e.type === 'fullReload')).toBe(true)
    expect(mem.flippedCount()).toBe(0)
    expect(flash.crc).toBeGreaterThan(0)
  })

  it('does not full-reload clean memory', () => {
    const { scrubber } = setup()
    scrubber.speed = 64
    expect(scrubber.tick(5)).toEqual([])
  })
})
