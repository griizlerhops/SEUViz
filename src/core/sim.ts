// Main simulation loop: wires everything together

export class Sim {
  private timeScale: number = 1

  constructor(
    private radiation: any,
    private scrubber: any,
    private faulty: any,
    private golden: any,
    private configMemory: any,
    private metrics: any
  ) {}

  setTimeScale(scale: number): void {
    this.timeScale = scale
  }

  tick(dt: number): void {
    const scaledDt = dt * this.timeScale

    // Radiation injection
    // Scrubber tick
    // Circuit clock ticks
    // Compare outputs
    // Update metrics
  }

  getState() {
    return {
      faultyClock: 0,
      goldenClock: 0,
      faultyState: 0,
      goldenState: 0,
      faultyLeds: [0, 0, 0, 0, 0, 0, 0, 0],
      goldenLeds: [0, 0, 0, 0, 0, 0, 0, 0],
    }
  }
}
