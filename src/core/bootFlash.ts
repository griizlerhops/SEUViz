// Boot flash: the read-only golden copy of the configuration image.
//
// Real FPGAs load their configuration from external flash at power-up. Here the
// boot flash is also what the scrubber reloads a frame from when ECC can't fix
// it, and what the golden reference circuit reads its LUTs from.

import { type Frame } from './configMemory'
import { DATA_BITS } from './ecc'

export class BootFlash {
  private readonly frames: readonly Frame[]

  constructor(image: Frame[]) {
    this.frames = image.map((f) => ({ data: f.data >>> 0, check: f.check & 0x7f }))
  }

  readFrame(frame: number): Frame {
    const f = this.frames[frame]
    return { data: f.data, check: f.check }
  }

  getBit(frame: number, bit: number): number {
    const f = this.frames[frame]
    return bit < DATA_BITS ? (f.data >>> bit) & 1 : (f.check >>> (bit - DATA_BITS)) & 1
  }

  /** A fresh copy of the whole image (used to load configuration memory). */
  image(): Frame[] {
    return this.frames.map((f) => ({ data: f.data, check: f.check }))
  }
}
