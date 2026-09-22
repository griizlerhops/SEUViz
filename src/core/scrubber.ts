// Frame-by-frame scrubber: correct single-bit errors, detect double-bit errors, reload from boot flash

export class Scrubber {
  private currentFrame: number = 0
  private speed: number = 1
  private enabled: boolean = false

  constructor(private configMemory: any, private bootFlash: any, private decode: any) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  setSpeed(speed: number): void {
    this.speed = speed
  }

  getCurrentFrame(): number {
    return this.currentFrame
  }

  tick(dt: number): Array<{ frame: number; bit: number; type: 'corrected' | 'reloaded' }> {
    // Placeholder: to be implemented in M4
    return []
  }
}
