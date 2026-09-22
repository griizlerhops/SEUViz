// Layout: where each LUT's truth table lives in configuration memory, and what
// the golden truth tables are.
//
// The design has 12 four-input LUTs. Each LUT's 16-entry truth table takes 16
// data bits, i.e. half a frame. We put one LUT per frame, in frames scattered
// across memory, alternating between the low half (bits 0..15) and the high
// half (bits 16..31) so the essential bits look spread out in the grid.
//
// 12 LUTs x 16 bits = 192 essential bits. Every other data bit is unused, and
// check bits are never "essential" (they protect the data but don't define logic).

import { FRAME_COUNT, type Frame } from './configMemory'
import { encode } from './ecc'

export const LUT_COUNT = 12
export const LUT_SIZE = 16 // 4 inputs -> 2^4 entries
export const LED_COUNT = 8

/** LUT0..LUT3 compute next-state bits; LUT4..LUT11 drive LED0..LED7. */
export const NEXT_STATE_LUTS = [0, 1, 2, 3]
export const LED_LUTS = [4, 5, 6, 7, 8, 9, 10, 11]

/** Frame holding each LUT's truth table (index = LUT number). */
export const LUT_FRAMES = [2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29, 31]

export interface BitPosition {
  frame: number
  bit: number
}

/** First data bit of the LUT's half-frame: even LUTs use 0..15, odd use 16..31. */
function lutBaseBit(lut: number): number {
  return lut % 2 === 0 ? 0 : 16
}

/** Where truth-table entry `entry` (0..15) of `lut` is stored. */
export function lutBitPosition(lut: number, entry: number): BitPosition {
  return { frame: LUT_FRAMES[lut], bit: lutBaseBit(lut) + entry }
}

/**
 * Reverse lookup: which LUT entry lives at (frame, bit)? null if the bit is not
 * essential. Used to explain flips ("this bit is LUT5, input 0110").
 */
export function lutEntryAt(frame: number, bit: number): { lut: number; entry: number } | null {
  const lut = LUT_FRAMES.indexOf(frame)
  if (lut < 0) return null
  const base = lutBaseBit(lut)
  if (bit < base || bit >= base + LUT_SIZE) return null
  return { lut, entry: bit - base }
}

export function isEssentialBit(frame: number, bit: number): boolean {
  return lutEntryAt(frame, bit) !== null
}

/** Which LED (0..7) is lit in counter state s: sweep right, then back left. */
export function litLedForState(s: number): number {
  return s < 8 ? s : 15 - s
}

/** Golden truth table for a LUT, as a 16-bit number (bit q = output for input q). */
export function goldenTruthTable(lut: number): number {
  let table = 0
  for (let q = 0; q < LUT_SIZE; q++) {
    let out: number
    if (lut < 4) {
      // Next-state LUT k outputs bit k of (q + 1) mod 16.
      out = (((q + 1) & 0xf) >> lut) & 1
    } else {
      // LED LUT for LED i is 1 only in states where LED i is lit.
      out = litLedForState(q) === lut - 4 ? 1 : 0
    }
    table |= out << q
  }
  return table
}

/** Build the full golden configuration image (data + ECC check bits). */
export function buildGoldenImage(): Frame[] {
  const image: Frame[] = []
  for (let f = 0; f < FRAME_COUNT; f++) image.push({ data: 0, check: 0 })

  for (let lut = 0; lut < LUT_COUNT; lut++) {
    const frame = LUT_FRAMES[lut]
    image[frame].data = (image[frame].data | (goldenTruthTable(lut) << lutBaseBit(lut))) >>> 0
  }
  for (const f of image) f.check = encode(f.data)
  return image
}
