// Metrics: running counters plus a timeline of recent circuit ticks.
//
// "Correctness" is measured once per circuit clock edge: did the faulty
// circuit's LEDs match the golden circuit's LEDs? We keep it split by whether
// the scrubber was on, so the benefit of scrubbing shows up as a number.

/** One circuit clock edge. */
export interface Sample {
  time: number // simulated seconds
  match: boolean // faulty LEDs == golden LEDs
  scrubbing: boolean // scrubber was enabled
}

/** How much history the timeline keeps, in simulated seconds. */
export const TIMELINE_SECONDS = 60

export class Metrics {
  flipsInjected = 0
  essentialFlips = 0
  errorsCorrected = 0
  framesReloaded = 0
  fullReloads = 0

  private ticks = { on: 0, off: 0 }
  private matches = { on: 0, off: 0 }
  private samples: Sample[] = []

  recordFlip(essential: boolean): void {
    this.flipsInjected++
    if (essential) this.essentialFlips++
  }

  recordCorrection(): void {
    this.errorsCorrected++
  }

  recordFrameReload(): void {
    this.framesReloaded++
  }

  recordFullReload(): void {
    this.fullReloads++
  }

  recordTick(sample: Sample): void {
    const key = sample.scrubbing ? 'on' : 'off'
    this.ticks[key]++
    if (sample.match) this.matches[key]++

    this.samples.push(sample)
    // Drop samples older than the window (they're in time order).
    const cutoff = sample.time - TIMELINE_SECONDS
    let drop = 0
    while (drop < this.samples.length && this.samples[drop].time < cutoff) drop++
    if (drop > 0) this.samples.splice(0, drop)
  }

  /** Percent of all ticks with correct output, or null before the first tick. */
  correctness(): number | null {
    const total = this.ticks.on + this.ticks.off
    return total === 0 ? null : (100 * (this.matches.on + this.matches.off)) / total
  }

  /** Percent correct over ticks where the scrubber was on (true) or off (false). */
  correctnessWhile(scrubbing: boolean): number | null {
    const key = scrubbing ? 'on' : 'off'
    return this.ticks[key] === 0 ? null : (100 * this.matches[key]) / this.ticks[key]
  }

  /** Samples from the last TIMELINE_SECONDS, oldest first. */
  timeline(): readonly Sample[] {
    return this.samples
  }
}
