import { describe, it, expect } from 'vitest'
import { ConfigMemory, FRAME_COUNT, TOTAL_BITS, type Frame } from '../src/core/configMemory'
import { encode, decode, FRAME_BITS } from '../src/core/ecc'

function makeImage(): Frame[] {
  const image: Frame[] = []
  for (let i = 0; i < FRAME_COUNT; i++) {
    const data = (i * 0x9e3779b1) >>> 0
    image.push({ data, check: encode(data) })
  }
  return image
}

describe('ConfigMemory', () => {
  it('has 32 frames x 39 bits = 1,248 bits', () => {
    expect(FRAME_COUNT).toBe(32)
    expect(FRAME_BITS).toBe(39)
    expect(TOTAL_BITS).toBe(1248)
  })

  it('loads the image and reads bits back', () => {
    const image = makeImage()
    const mem = new ConfigMemory(image)
    for (let f = 0; f < FRAME_COUNT; f++) {
      expect(mem.readFrame(f)).toEqual(image[f])
      for (let b = 0; b < 32; b++) {
        expect(mem.getBit(f, b)).toBe((image[f].data >>> b) & 1)
      }
      for (let b = 32; b < 39; b++) {
        expect(mem.getBit(f, b)).toBe((image[f].check >>> (b - 32)) & 1)
      }
    }
    expect(mem.flippedCount()).toBe(0)
  })

  it('flipBit inverts a data bit and a check bit, and tracks flips', () => {
    const mem = new ConfigMemory(makeImage())
    const before = mem.getBit(3, 5)
    mem.flipBit(3, 5)
    expect(mem.getBit(3, 5)).toBe(1 - before)
    expect(mem.isFlipped(3, 5)).toBe(true)

    mem.flipBit(3, 36)
    expect(mem.isFlipped(3, 36)).toBe(true)
    expect(mem.flippedCount()).toBe(2)

    // Flipping again restores the bit.
    mem.flipBit(3, 5)
    expect(mem.isFlipped(3, 5)).toBe(false)
    expect(mem.flippedCount()).toBe(1)
  })

  it('a flipped frame is detected by ECC and write-back repairs it', () => {
    const mem = new ConfigMemory(makeImage())
    mem.flipBit(7, 20)
    const { data, check } = mem.readFrame(7)
    const r = decode(data, check)
    expect(r.status).toBe('corrected')
    if (r.status === 'corrected') mem.writeFrame(7, r.data, r.check)
    expect(mem.flippedCount()).toBe(0)
  })

  it('handles bit 31 without sign problems', () => {
    const mem = new ConfigMemory(makeImage())
    mem.flipBit(0, 31)
    expect(mem.readFrame(0).data).toBeGreaterThanOrEqual(0)
  })

  it('rejects out-of-range positions', () => {
    const mem = new ConfigMemory(makeImage())
    expect(() => mem.getBit(32, 0)).toThrow(RangeError)
    expect(() => mem.flipBit(0, 39)).toThrow(RangeError)
  })
})
