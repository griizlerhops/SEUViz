// Golden copy of configuration memory (read-only boot flash)

export class BootFlash {
  private frames: Array<{ data: number; check: number }> = []

  constructor() {
    for (let i = 0; i < 32; i++) {
      this.frames[i] = { data: 0, check: 0 }
    }
  }

  readFrame(frame: number): { data: number; check: number } {
    return { ...this.frames[frame] }
  }

  setFrame(frame: number, data: number, check: number): void {
    this.frames[frame] = { data, check }
  }
}
