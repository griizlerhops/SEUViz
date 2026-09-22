// Radiation injector: flips random configuration bits the way particle strikes do.
//
// Everything random goes through a seeded RNG, so the same seed plus the same
// sequence of tick(dt) calls always produces the same flips. That makes runs
// reproducible and testable.

import { ConfigMemory, FRAME_COUNT, TOTAL_BITS } from './configMemory'
import { FRAME_BITS } from './ecc'
import { type BitPosition } from './layout'

/** mulberry32: a tiny, fast, seedable PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Number of events in an interval where `lambda` events are expected
 * (Knuth's method: multiply uniforms until the product drops below e^-lambda).
 */
export function poisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0
  const limit = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng()
  } while (p > limit)
  return k - 1
}

export class RadiationInjector {
  /** Expected flips per second of simulated time. */
  rate = 0
  private readonly rng: () => number

  constructor(
    private readonly memory: ConfigMemory,
    seed: number,
  ) {
    this.rng = mulberry32(seed)
  }

  /** Advance dt seconds: a Poisson number of flips, each at a uniformly random bit. */
  tick(dt: number): BitPosition[] {
    const n = poisson(this.rate * dt, this.rng)
    const hits: BitPosition[] = []
    for (let i = 0; i < n; i++) {
      const index = Math.floor(this.rng() * TOTAL_BITS)
      hits.push(this.flipAt(Math.floor(index / FRAME_BITS), index % FRAME_BITS))
    }
    return hits
  }

  /** Flip one specific bit (a manual click in the UI). */
  flipAt(frame: number, bit: number): BitPosition {
    this.memory.flipBit(frame, bit)
    return { frame, bit }
  }

  /** Multi-bit upset: flip 2 or 3 distinct bits within one random frame. */
  burst(): BitPosition[] {
    const frame = Math.floor(this.rng() * FRAME_COUNT)
    const count = this.rng() < 0.5 ? 2 : 3
    const bits = new Set<number>()
    while (bits.size < count) bits.add(Math.floor(this.rng() * FRAME_BITS))
    return [...bits].map((bit) => this.flipAt(frame, bit))
  }
}
