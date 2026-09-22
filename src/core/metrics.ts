// Counters and timeline samples for metrics display

export interface Metrics {
  flipsInjected: number
  flipsOnEssentialBits: number
  errorsCorrected: number
  framesReloaded: number
  currentUncorrectedFlips: number
  correctnessPercent: number
}

export class MetricsCollector {
  private metrics: Metrics = {
    flipsInjected: 0,
    flipsOnEssentialBits: 0,
    errorsCorrected: 0,
    framesReloaded: 0,
    currentUncorrectedFlips: 0,
    correctnessPercent: 100,
  }

  private timeline: number[] = []

  getMetrics(): Metrics {
    return { ...this.metrics }
  }

  getTimeline(): number[] {
    return [...this.timeline]
  }

  recordFlip(isEssential: boolean): void {
    this.metrics.flipsInjected++
    if (isEssential) this.metrics.flipsOnEssentialBits++
  }

  recordCorrection(): void {
    this.metrics.errorsCorrected++
  }

  recordReload(): void {
    this.metrics.framesReloaded++
  }

  recordCorrectness(isCorrect: boolean): void {
    this.timeline.push(isCorrect ? 1 : 0)
    if (this.timeline.length > 6000) this.timeline.shift()
    const sum = this.timeline.reduce((a, b) => a + b, 0)
    this.metrics.correctnessPercent = (sum / this.timeline.length) * 100
  }
}
