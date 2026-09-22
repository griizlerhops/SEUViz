// Scrubber: walks configuration memory one frame at a time, forever.
//
// For each frame it reads data + check bits and runs the ECC decoder:
//   ok            -> nothing to do
//   corrected     -> write the fixed frame back (single-bit error repaired)
//   uncorrectable -> reload the frame from boot flash, which takes extra time
//
// SECDED has a blind spot: 3 or more flips in one frame can look like a single
// flip (so ECC "corrects" the wrong bit) or like no error at all. To catch
// that, after every full sweep in which ECC found nothing to fix, the scrubber
// computes a CRC-32 of all of memory and compares it with the CRC stored in
// boot flash. A mismatch means errors are hiding from ECC, so the whole
// configuration is reloaded from flash.
//
// Important: the scrubber only knows what ECC and the CRC tell it. It never
// looks at the memory's "which bits are flipped" bookkeeping; that exists
// only for the UI.

import { ConfigMemory, FRAME_COUNT } from './configMemory'
import { BootFlash, imageCrc32 } from './bootFlash'
import { decode } from './ecc'

/** Simulated seconds the scrubber stalls while reloading one frame from flash. */
export const RELOAD_DELAY = 0.25
/** Simulated seconds the scrubber stalls while reloading all of memory. */
export const FULL_RELOAD_DELAY = 1.0

export type ScrubEvent =
  | { type: 'corrected'; frame: number; bit: number }
  | { type: 'reloaded'; frame: number }
  | { type: 'fullReload' }

export class Scrubber {
  enabled = false
  /** Frames scanned per second of simulated time. */
  speed = 8

  private cursor = 0 // frame to be scanned next
  private progress = 0 // fraction (0..1) of the way through reading the cursor frame
  private pause = 0 // seconds left in a reload stall
  private sweepScanned = 0 // frames scanned in the current sweep
  private sweepFoundErrors = false // did ECC flag anything this sweep?

  constructor(
    private readonly memory: ConfigMemory,
    private readonly flash: BootFlash,
  ) {}

  /** Frame the scrubber is currently reading. */
  get cursorFrame(): number {
    return this.cursor
  }

  get isReloading(): boolean {
    return this.pause > 0
  }

  /** Advance dt seconds of simulated time; returns what the scrubber did. */
  tick(dt: number): ScrubEvent[] {
    const events: ScrubEvent[] = []
    if (!this.enabled) return events

    let remaining = dt
    while (remaining > 0) {
      if (this.pause > 0) {
        const used = Math.min(this.pause, remaining)
        this.pause -= used
        remaining -= used
        continue
      }
      const timeToFinishFrame = (1 - this.progress) / this.speed
      if (remaining < timeToFinishFrame) {
        this.progress += remaining * this.speed
        break
      }
      remaining -= timeToFinishFrame
      this.progress = 0

      const event = this.scanFrame(this.cursor)
      if (event) {
        events.push(event)
        this.sweepFoundErrors = true
      }
      this.sweepScanned++
      this.cursor = (this.cursor + 1) % FRAME_COUNT

      if (this.cursor === 0) {
        const full = this.endOfSweep()
        if (full) events.push(full)
      }
    }
    return events
  }

  /**
   * At the end of a complete sweep that ECC thought was clean, verify the
   * whole image against the CRC in boot flash.
   */
  private endOfSweep(): ScrubEvent | null {
    const complete = this.sweepScanned >= FRAME_COUNT
    const eccSawNothing = !this.sweepFoundErrors
    this.sweepScanned = 0
    this.sweepFoundErrors = false
    if (!complete || !eccSawNothing) return null

    const live = Array.from({ length: FRAME_COUNT }, (_, f) => this.memory.readFrame(f))
    if (imageCrc32(live) === this.flash.crc) return null

    for (let f = 0; f < FRAME_COUNT; f++) {
      const golden = this.flash.readFrame(f)
      this.memory.writeFrame(f, golden.data, golden.check)
    }
    this.pause = FULL_RELOAD_DELAY
    return { type: 'fullReload' }
  }

  /** Check one frame with ECC and repair it if needed. */
  scanFrame(frame: number): ScrubEvent | null {
    const { data, check } = this.memory.readFrame(frame)
    const result = decode(data, check)

    if (result.status === 'corrected') {
      this.memory.writeFrame(frame, result.data, result.check)
      return { type: 'corrected', frame, bit: result.errorBit }
    }
    if (result.status === 'uncorrectable') {
      const golden = this.flash.readFrame(frame)
      this.memory.writeFrame(frame, golden.data, golden.check)
      this.pause = RELOAD_DELAY
      return { type: 'reloaded', frame }
    }
    return null
  }
}
