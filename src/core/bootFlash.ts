// Boot flash: the read-only golden copy of the configuration image.
//
// Real FPGAs load their configuration from external flash at power-up. Here the
// boot flash is also what the scrubber reloads a frame from when ECC can't fix
// it, and what the golden reference circuit reads its LUTs from.

import { type Frame } from './configMemory'
import { DATA_BITS } from './ecc'

/**
 * Standard CRC-32 over every frame's data word (4 bytes) and check bits (1 byte).
 * Real bitstreams carry a CRC like this so the device can verify its whole
 * configuration, not just one frame at a time.
 */
export function imageCrc32(frames: Frame[]): number {
  let crc = 0xffffffff
  const feed = (byte: number) => {
    crc ^= byte & 0xff
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  for (const f of frames) {
    feed(f.data)
    feed(f.data >>> 8)
    feed(f.data >>> 16)
    feed(f.data >>> 24)
    feed(f.check)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export class BootFlash {
  private readonly frames: readonly Frame[]
  /** CRC-32 of the golden image, stored alongside it in flash. */
  readonly crc: number

  constructor(image: Frame[]) {
    this.frames = image.map((f) => ({ data: f.data >>> 0, check: f.check & 0x7f }))
    this.crc = imageCrc32(this.image())
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
