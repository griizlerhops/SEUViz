// 4-bit counter with 12 LUTs driving an 8-LED bounce pattern

export class Circuit {
  private state: number = 0 // 4-bit state Q[3:0]

  constructor(private readConfigBit: (frame: number, bit: number) => number) {}

  setState(value: number): void {
    this.state = value & 0xf
  }

  getState(): number {
    return this.state
  }

  tick(): void {
    // Placeholder: to be implemented in M3
  }

  getLedOutput(): number[] {
    // Returns 8 LED states
    return [0, 0, 0, 0, 0, 0, 0, 0]
  }
}
