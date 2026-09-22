// The user design: a 4-bit counter driving 8 LEDs in a bouncing pattern,
// built entirely out of 4-input LUTs whose truth tables live in configuration
// memory.
//
// Each LUT output is looked up in memory at evaluation time:
//     output = truthTable[Q]   where Q is the 4-bit state
// so a flipped truth-table bit only matters when the circuit is in the one
// state that selects it. That's why a flip may sit harmlessly for a while and
// then suddenly corrupt the output.

import { LED_COUNT, LED_LUTS, NEXT_STATE_LUTS, lutBitPosition } from './layout'

/** Anything the circuit can read configuration bits from (memory or boot flash). */
export type BitReader = (frame: number, bit: number) => number

export class Circuit {
  /** The 4-bit state register Q[3:0]. This is state, NOT configuration. */
  private q = 0

  constructor(private readonly readBit: BitReader) {}

  getState(): number {
    return this.q
  }

  setState(value: number): void {
    this.q = value & 0xf
  }

  /** Evaluate one LUT for a given 4-bit input. */
  evalLut(lut: number, input: number): number {
    const { frame, bit } = lutBitPosition(lut, input & 0xf)
    return this.readBit(frame, bit)
  }

  /** Next value of Q, computed by LUT0..LUT3 (should be Q + 1 mod 16). */
  nextState(): number {
    let next = 0
    for (const k of NEXT_STATE_LUTS) next |= this.evalLut(k, this.q) << k
    return next
  }

  /** One rising clock edge: the register loads whatever the next-state LUTs say. */
  clock(): void {
    this.q = this.nextState()
  }

  /** Current LED outputs from LUT4..LUT11 (1 = lit). */
  leds(): number[] {
    const out: number[] = []
    for (let i = 0; i < LED_COUNT; i++) out.push(this.evalLut(LED_LUTS[i], this.q))
    return out
  }
}
