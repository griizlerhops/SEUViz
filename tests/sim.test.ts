import { describe, it, expect } from 'vitest'
import { Sim, CLOCK_HZ } from '../src/core/sim'
import { lutBitPosition } from '../src/core/layout'

describe('sim', () => {
  it('runs the counter at the clock rate', () => {
    const sim = new Sim(1)
    const events = sim.tick(1)
    expect(events.clockEdges).toBe(CLOCK_HZ)
    expect(sim.faulty.getState()).toBe(CLOCK_HZ % 16)
    expect(sim.outputsMatch).toBe(true)
  })

  it('timeScale speeds everything up', () => {
    const sim = new Sim(1)
    sim.timeScale = 4
    expect(sim.tick(1).clockEdges).toBe(4 * CLOCK_HZ)
  })

  it('is deterministic for a given seed and dt sequence', () => {
    const run = () => {
      const sim = new Sim(99)
      sim.radiation.rate = 8
      sim.scrubber.enabled = true
      for (let i = 0; i < 600; i++) sim.tick(1 / 60)
      return [sim.faulty.getState(), sim.memory.flippedCount(), sim.time]
    }
    expect(run()).toEqual(run())
  })

  it('with scrubbing on and moderate radiation, memory returns to clean', () => {
    const sim = new Sim(2024)
    sim.radiation.rate = 5
    sim.scrubber.enabled = true
    sim.scrubber.speed = 64
    let totalFlips = 0
    for (let i = 0; i < 60 * 30; i++) totalFlips += sim.tick(1 / 60).flips.length
    expect(totalFlips).toBeGreaterThan(50)

    sim.radiation.rate = 0
    for (let i = 0; i < 60 * 2; i++) sim.tick(1 / 60)
    expect(sim.memory.flippedCount()).toBe(0)
  })

  it('without scrubbing, flips accumulate', () => {
    const sim = new Sim(2024)
    sim.radiation.rate = 5
    for (let i = 0; i < 60 * 10; i++) sim.tick(1 / 60)
    expect(sim.memory.flippedCount()).toBeGreaterThan(20)
  })

  it('detects state divergence that survives scrubbing, and reset fixes it', () => {
    const sim = new Sim(1)
    // Corrupt LUT0 for Q=3 so the counter jumps 3 -> 5 instead of 3 -> 4.
    const { frame, bit } = lutBitPosition(0, 3)
    sim.flipAt(frame, bit)
    for (let i = 0; i < 4; i++) sim.tick(1 / CLOCK_HZ)
    expect(sim.stateDiverged).toBe(true)

    // Scrubber repairs configuration...
    sim.scrubber.enabled = true
    sim.scrubber.speed = 64
    sim.tick(1)
    expect(sim.memory.flippedCount()).toBe(0)
    expect(sim.memoryPassesEcc()).toBe(true)
    // ...but the state is still wrong.
    expect(sim.stateDiverged).toBe(true)
    expect(sim.outputsMatch).toBe(false)

    sim.resync()
    expect(sim.stateDiverged).toBe(false)
    expect(sim.outputsMatch).toBe(true)
  })

  it('auto-resync kicks in once memory passes ECC', () => {
    const sim = new Sim(1)
    sim.autoResync = true
    const { frame, bit } = lutBitPosition(0, 3)
    sim.flipAt(frame, bit)
    for (let i = 0; i < 4; i++) sim.tick(1 / CLOCK_HZ)
    // Memory is still corrupted, so auto-resync must wait.
    expect(sim.stateDiverged).toBe(true)

    sim.scrubber.enabled = true
    sim.scrubber.speed = 64
    sim.tick(1)
    expect(sim.stateDiverged).toBe(false)
  })
})

describe('sim recovery after a radiation storm', () => {
  it('heavy unscrubbed radiation, then scrubbing, ends with clean memory', () => {
    const sim = new Sim(1337)
    sim.radiation.rate = 20
    for (let i = 0; i < 60 * 10; i++) sim.tick(1 / 60)
    expect(sim.memory.flippedCount()).toBeGreaterThan(100)

    sim.radiation.rate = 0
    sim.scrubber.enabled = true
    sim.scrubber.speed = 64
    // ~20 frame reloads at 0.25 s each, then a CRC-triggered full reload.
    for (let i = 0; i < 60 * 10; i++) sim.tick(1 / 60)
    expect(sim.memory.flippedCount()).toBe(0)
  })
})

describe('metrics', () => {
  it('counts flips, essential flips, corrections and reloads', () => {
    const sim = new Sim(5)
    const { frame, bit } = lutBitPosition(4, 0) // essential
    sim.flipAt(frame, bit)
    sim.flipAt(0, 0) // unused
    sim.flipAt(1, 1)
    sim.flipAt(1, 2) // frame 1 now has a double error
    expect(sim.metrics.flipsInjected).toBe(4)
    expect(sim.metrics.essentialFlips).toBe(1)

    sim.scrubber.enabled = true
    sim.scrubber.speed = 64
    sim.tick(1)
    expect(sim.metrics.errorsCorrected).toBe(2)
    expect(sim.metrics.framesReloaded).toBe(1)
    expect(sim.memory.flippedCount()).toBe(0)
  })

  it('tracks correctness separately with the scrubber on and off', () => {
    const sim = new Sim(5)
    sim.tick(2)
    expect(sim.metrics.correctness()).toBe(100)
    expect(sim.metrics.correctnessWhile(false)).toBe(100)
    expect(sim.metrics.correctnessWhile(true)).toBeNull()

    // Corrupt LED0's LUT for every state: output is wrong on 14 of 16 states.
    for (let e = 0; e < 16; e++) {
      const { frame, bit } = lutBitPosition(4, e)
      sim.flipAt(frame, bit)
    }
    sim.tick(4) // 16 ticks
    expect(sim.metrics.correctnessWhile(false)!).toBeLessThan(100)
  })

  it('keeps only the last 60 simulated seconds of timeline', () => {
    const sim = new Sim(5)
    sim.timeScale = 16
    for (let i = 0; i < 60 * 10; i++) sim.tick(1 / 60) // 160 s simulated
    const tl = sim.metrics.timeline()
    expect(tl[tl.length - 1].time - tl[0].time).toBeLessThanOrEqual(60)
    expect(tl.length).toBeGreaterThan(200)
  })
})
