// Configuration memory: 32 frames × 39 bits (32 data + 7 check)
// Total: 1,248 bits

export class ConfigMemory {
  private frames: Array<{ data: number; check: number }> = []
  private flipped: Set<string> = new Set()

  constructor() {
    for (let i = 0; i < 32; i++) {
      this.frames[i] = { data: 0, check: 0 }
    }
  }

  getBit(frame: number, bit: number): number {
    if (bit < 32) {
      return (this.frames[frame].data >> bit) & 1
    } else {
      return (this.frames[frame].check >> (bit - 32)) & 1
    }
  }

  flipBit(frame: number, bit: number): void {
    const key = `${frame},${bit}`
    if (this.flipped.has(key)) {
      this.flipped.delete(key)
    } else {
      this.flipped.add(key)
    }
    this._updateFrame(frame)
  }

  readFrame(frame: number): { data: number; check: number } {
    return { ...this.frames[frame] }
  }

  writeFrame(frame: number, data: number, check: number): void {
    this.frames[frame] = { data, check }
    this.flipped.clear()
  }

  private _updateFrame(frame: number): void {
    const f = this.frames[frame]
    for (const key of this.flipped) {
      const [fStr, bitStr] = key.split(',')
      if (parseInt(fStr) === frame) {
        const bit = parseInt(bitStr)
        if (bit < 32) {
          f.data ^= 1 << bit
        } else {
          f.check ^= 1 << (bit - 32)
        }
      }
    }
  }

  getFlippedBits(): Set<string> {
    return new Set(this.flipped)
  }
}
