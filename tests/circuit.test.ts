import { describe, it, expect } from 'vitest'
import { ConfigMemory, FRAME_COUNT } from '../src/core/configMemory'
import { BootFlash } from '../src/core/bootFlash'
import { Circuit } from '../src/core/circuit'
import { decode, DATA_BITS } from '../src/core/ecc'
import {
  LUT_COUNT,
  LUT_SIZE,
  buildGoldenImage,
  isEssentialBit,
  litLedForState,
  lutBitPosition,
  lutEntryAt,
} from '../src/core/layout'

function expectedLeds(s: number): number[] {
  const leds = [0, 0, 0, 0, 0, 0, 0, 0]
  leds[litLedForState(s)] = 1
  return leds
}

function setup() {
  const flash = new BootFlash(buildGoldenImage())
  const mem = new ConfigMemory(flash.image())
  const circuit = new Circuit((f, b) => mem.getBit(f, b))
  return { flash, mem, circuit }
}

describe('layout', () => {
  it('has exactly 192 essential bits, all in data bits', () => {
    let count = 0
    for (let f = 0; f < FRAME_COUNT; f++) {
      for (let b = 0; b < 39; b++) {
        if (isEssentialBit(f, b)) {
          count++
          expect(b).toBeLessThan(DATA_BITS)
        }
      }
    }
    expect(count).toBe(192)
  })

  it('maps every LUT entry to a unique position and back', () => {
    const seen = new Set<string>()
    for (let lut = 0; lut < LUT_COUNT; lut++) {
      for (let e = 0; e < LUT_SIZE; e++) {
        const { frame, bit } = lutBitPosition(lut, e)
        const key = `${frame}:${bit}`
        expect(seen.has(key)).toBe(false)
        seen.add(key)
        expect(lutEntryAt(frame, bit)).toEqual({ lut, entry: e })
      }
    }
  })

  it('golden image has valid ECC in every frame', () => {
    for (const f of buildGoldenImage()) expect(decode(f.data, f.check).status).toBe('ok')
  })
})

describe('circuit', () => {
  it('a clean circuit cycles through all 16 states with the bounce pattern', () => {
    const { circuit } = setup()
    for (let s = 0; s < 32; s++) {
      expect(circuit.getState()).toBe(s % 16)
      expect(circuit.leds()).toEqual(expectedLeds(s % 16))
      circuit.clock()
    }
  })

  it('golden circuit reading from boot flash behaves identically', () => {
    const { flash, circuit } = setup()
    const golden = new Circuit((f, b) => flash.getBit(f, b))
    for (let s = 0; s < 16; s++) {
      expect(golden.leds()).toEqual(circuit.leds())
      golden.clock()
      circuit.clock()
    }
  })

  it('flipping an essential bit changes that LUT output for exactly one input', () => {
    for (let lut = 0; lut < LUT_COUNT; lut++) {
      for (let entry = 0; entry < LUT_SIZE; entry++) {
        const { mem, circuit } = setup()
        const before = Array.from({ length: 16 }, (_, q) => circuit.evalLut(lut, q))
        const { frame, bit } = lutBitPosition(lut, entry)
        mem.flipBit(frame, bit)
        const after = Array.from({ length: 16 }, (_, q) => circuit.evalLut(lut, q))
        const changed = before.map((v, q) => (v !== after[q] ? q : -1)).filter((q) => q >= 0)
        expect(changed).toEqual([entry])
      }
    }
  })

  it('flipping an LED LUT bit corrupts the LEDs only in that one state', () => {
    const { mem, circuit } = setup()
    const { frame, bit } = lutBitPosition(6, 9) // LED2's LUT, input state 9
    mem.flipBit(frame, bit)
    for (let s = 0; s < 16; s++) {
      const wrong = JSON.stringify(circuit.leds()) !== JSON.stringify(expectedLeds(s))
      expect(wrong).toBe(s === 9)
      circuit.clock()
    }
  })

  it('flipping every unused bit changes nothing', () => {
    const { mem, circuit } = setup()
    for (let f = 0; f < FRAME_COUNT; f++) {
      for (let b = 0; b < 39; b++) {
        if (!isEssentialBit(f, b)) mem.flipBit(f, b)
      }
    }
    for (let s = 0; s < 16; s++) {
      expect(circuit.getState()).toBe(s)
      expect(circuit.leds()).toEqual(expectedLeds(s))
      circuit.clock()
    }
  })

  it('a flipped next-state bit makes the counter jump', () => {
    const { mem, circuit } = setup()
    // LUT0 computes bit 0 of Q+1. Flip its entry for Q=3: next state becomes 5, not 4.
    const { frame, bit } = lutBitPosition(0, 3)
    mem.flipBit(frame, bit)
    circuit.setState(3)
    circuit.clock()
    expect(circuit.getState()).toBe(5)
  })
})
