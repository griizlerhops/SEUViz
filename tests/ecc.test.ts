import { describe, it, expect } from 'vitest'
import { encode, decode, DATA_BITS, FRAME_BITS } from '../src/core/ecc'

// Flip frame bit `bit` (0..38) in a (data, check) pair.
function flip(data: number, check: number, bit: number): [number, number] {
  if (bit < DATA_BITS) return [(data ^ (1 << bit)) >>> 0, check]
  return [data, check ^ (1 << (bit - DATA_BITS))]
}

// Small deterministic RNG so the tests are reproducible.
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0)
  }
}

const rng = makeRng(1234)
const samples = [0x00000000, 0xffffffff, 0xdeadbeef, 0x12345678, 0x80000001]
for (let i = 0; i < 20; i++) samples.push(rng())

describe('ECC encode', () => {
  it('produces 7 check bits', () => {
    for (const d of samples) {
      const c = encode(d)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThan(128)
    }
  })

  it('clean frames decode as ok', () => {
    for (const d of samples) {
      expect(decode(d, encode(d))).toEqual({ status: 'ok' })
    }
  })
})

describe('ECC single-bit errors', () => {
  it('corrects every single-bit flip across all 39 positions', () => {
    for (const d of samples) {
      const c = encode(d)
      for (let bit = 0; bit < FRAME_BITS; bit++) {
        const [bd, bc] = flip(d, c, bit)
        const r = decode(bd, bc)
        expect(r.status).toBe('corrected')
        if (r.status === 'corrected') {
          expect(r.data).toBe(d >>> 0)
          expect(r.check).toBe(c)
          expect(r.errorBit).toBe(bit)
        }
      }
    }
  })
})

describe('ECC double-bit errors', () => {
  it('detects every double-bit flip pattern as uncorrectable', () => {
    for (const d of samples) {
      const c = encode(d)
      for (let a = 0; a < FRAME_BITS; a++) {
        for (let b = a + 1; b < FRAME_BITS; b++) {
          let [bd, bc] = flip(d, c, a)
          ;[bd, bc] = flip(bd, bc, b)
          expect(decode(bd, bc).status).toBe('uncorrectable')
        }
      }
    }
  })
})
