// Configuration memory: 32 frames x 39 bits (32 data + 7 check) = 1,248 bits.
//
// Frame bit numbering (same as ecc.ts):
//   bits 0..31  -> data word
//   bits 32..38 -> check bits 0..6
//
// The memory also keeps a copy of the "golden" image it was loaded with, so the
// UI can highlight which bits are currently wrong. That comparison is for
// visualization ONLY. The scrubber never calls isFlipped()/flippedCount(); it
// has to find errors the way real hardware does, through ECC.

import { DATA_BITS, FRAME_BITS } from './ecc'

export const FRAME_COUNT = 32
export const TOTAL_BITS = FRAME_COUNT * FRAME_BITS // 1,248

export interface Frame {
  data: number // 32-bit unsigned data word
  check: number // 7 check bits
}

function assertPosition(frame: number, bit: number): void {
  if (!Number.isInteger(frame) || frame < 0 || frame >= FRAME_COUNT) {
    throw new RangeError(`frame out of range: ${frame}`)
  }
  if (!Number.isInteger(bit) || bit < 0 || bit >= FRAME_BITS) {
    throw new RangeError(`bit out of range: ${bit}`)
  }
}

function bitOf(f: Frame, bit: number): number {
  return bit < DATA_BITS ? (f.data >>> bit) & 1 : (f.check >>> (bit - DATA_BITS)) & 1
}

export class ConfigMemory {
  private frames: Frame[]
  private readonly reference: Frame[]

  /** Load memory from an image (e.g. the boot flash contents). */
  constructor(image: Frame[]) {
    if (image.length !== FRAME_COUNT) {
      throw new RangeError(`expected ${FRAME_COUNT} frames, got ${image.length}`)
    }
    this.frames = image.map((f) => ({ data: f.data >>> 0, check: f.check & 0x7f }))
    this.reference = image.map((f) => ({ data: f.data >>> 0, check: f.check & 0x7f }))
  }

  getBit(frame: number, bit: number): number {
    assertPosition(frame, bit)
    return bitOf(this.frames[frame], bit)
  }

  /** Invert one bit. This is what an SEU does. */
  flipBit(frame: number, bit: number): void {
    assertPosition(frame, bit)
    const f = this.frames[frame]
    if (bit < DATA_BITS) {
      f.data = (f.data ^ (1 << bit)) >>> 0
    } else {
      f.check = f.check ^ (1 << (bit - DATA_BITS))
    }
  }

  /** Read a whole frame (returns a copy). */
  readFrame(frame: number): Frame {
    assertPosition(frame, 0)
    const f = this.frames[frame]
    return { data: f.data, check: f.check }
  }

  /** Overwrite a whole frame (used by the scrubber to write back fixes). */
  writeFrame(frame: number, data: number, check: number): void {
    assertPosition(frame, 0)
    this.frames[frame] = { data: data >>> 0, check: check & 0x7f }
  }

  // ---- Visualization helpers (never used by the scrubber) ----

  /** True if this bit differs from the image memory was loaded with. */
  isFlipped(frame: number, bit: number): boolean {
    assertPosition(frame, bit)
    return bitOf(this.frames[frame], bit) !== bitOf(this.reference[frame], bit)
  }

  /** How many bits in the whole memory currently differ from the loaded image. */
  flippedCount(): number {
    let count = 0
    for (let fr = 0; fr < FRAME_COUNT; fr++) {
      for (let b = 0; b < FRAME_BITS; b++) {
        if (this.isFlipped(fr, b)) count++
      }
    }
    return count
  }
}
