// Simulation: wires the pieces together and advances time.
//
//   radiation -> configuration memory <- scrubber (repairs from ECC / boot flash)
//                       |
//                faulty circuit      golden circuit (reads boot flash)
//
// tick(dt) runs, in order: radiation, scrubber, then the circuit clock.
// Large dt values are split into small sub-steps so the ordering stays
// realistic even at 16x speed. Given the same seed and the same dt sequence,
// the simulation is fully deterministic.

import { BootFlash } from './bootFlash'
import { Circuit } from './circuit'
import { ConfigMemory, FRAME_COUNT } from './configMemory'
import { decode } from './ecc'
import { buildGoldenImage, isEssentialBit, type BitPosition } from './layout'
import { Metrics } from './metrics'
import { RadiationInjector } from './radiation'
import { Scrubber, type ScrubEvent } from './scrubber'

/** Circuit clock rate in Hz (slow enough to watch the LEDs move). */
export const CLOCK_HZ = 4
/** Largest slice of simulated time processed in one sub-step. */
const MAX_STEP = 1 / 60

/** What happened during one tick, so the UI can animate it. */
export interface TickEvents {
  flips: BitPosition[]
  scrub: ScrubEvent[]
  clockEdges: number
}

export class Sim {
  readonly flash: BootFlash
  readonly memory: ConfigMemory
  readonly radiation: RadiationInjector
  readonly scrubber: Scrubber
  /** The circuit running from (possibly corrupted) configuration memory. */
  readonly faulty: Circuit
  /** The reference circuit running from the boot flash image. */
  readonly golden: Circuit
  readonly metrics = new Metrics()

  /** Multiplier on real time (1x, 4x, 16x). */
  timeScale = 1
  /** Automatically resync state once ECC reports clean memory. */
  autoResync = false
  /** Simulated seconds elapsed. */
  time = 0

  private clockPhase = 0 // seconds since the last clock edge

  constructor(readonly seed: number) {
    this.flash = new BootFlash(buildGoldenImage())
    this.memory = new ConfigMemory(this.flash.image())
    this.radiation = new RadiationInjector(this.memory, seed)
    this.scrubber = new Scrubber(this.memory, this.flash)
    this.faulty = new Circuit((f, b) => this.memory.getBit(f, b))
    this.golden = new Circuit((f, b) => this.flash.getBit(f, b))
  }

  /** Advance by dt seconds of real time (scaled by timeScale). */
  tick(dt: number): TickEvents {
    const events: TickEvents = { flips: [], scrub: [], clockEdges: 0 }
    let remaining = dt * this.timeScale
    while (remaining > 1e-12) {
      const step = Math.min(MAX_STEP, remaining)
      remaining -= step
      this.step(step, events)
    }
    return events
  }

  private step(dt: number, events: TickEvents): void {
    this.time += dt
    const flips = this.radiation.tick(dt)
    this.recordFlips(flips)
    events.flips.push(...flips)

    const scrub = this.scrubber.tick(dt)
    for (const e of scrub) {
      if (e.type === 'corrected') this.metrics.recordCorrection()
      else if (e.type === 'reloaded') this.metrics.recordFrameReload()
      else this.metrics.recordFullReload()
    }
    events.scrub.push(...scrub)

    this.clockPhase += dt
    const period = 1 / CLOCK_HZ
    // Small tolerance: summing many float sub-steps lands a hair under the period.
    while (this.clockPhase >= period - 1e-9) {
      this.clockPhase -= period
      this.clockEdge()
      events.clockEdges++
    }
  }

  private clockEdge(): void {
    this.faulty.clock()
    this.golden.clock()
    if (this.autoResync && this.stateDiverged && this.memoryPassesEcc()) this.resync()
    this.metrics.recordTick({ time: this.time, match: this.outputsMatch, scrubbing: this.scrubber.enabled })
  }

  private recordFlips(flips: BitPosition[]): void {
    for (const f of flips) this.metrics.recordFlip(isEssentialBit(f.frame, f.bit))
  }

  // ---- User actions ----

  flipAt(frame: number, bit: number): BitPosition {
    const hit = this.radiation.flipAt(frame, bit)
    this.recordFlips([hit])
    return hit
  }

  burst(): BitPosition[] {
    const hits = this.radiation.burst()
    this.recordFlips(hits)
    return hits
  }

  /** Copy the golden state into the faulty circuit (a design reset / resync). */
  resync(): void {
    this.faulty.setState(this.golden.getState())
  }

  // ---- Status ----

  /** The state registers disagree, regardless of what memory looks like. */
  get stateDiverged(): boolean {
    return this.faulty.getState() !== this.golden.getState()
  }

  /** LED outputs currently differ between the faulty and golden circuits. */
  get outputsMatch(): boolean {
    const a = this.faulty.leds()
    const b = this.golden.leds()
    return a.every((v, i) => v === b[i])
  }

  /**
   * Does every frame pass an ECC check? This is what a real system could know
   * without a golden copy, so auto-resync uses it instead of the UI-only flip
   * tracking.
   */
  memoryPassesEcc(): boolean {
    for (let f = 0; f < FRAME_COUNT; f++) {
      const { data, check } = this.memory.readFrame(f)
      if (decode(data, check).status !== 'ok') return false
    }
    return true
  }
}
