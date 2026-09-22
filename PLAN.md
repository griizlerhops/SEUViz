# SEU Scrubbing Visualizer

## How to use this file

Put this file at the root of a new, empty project folder in VS Code and name it PLAN.md. Give your AI coding assistant the kickoff prompt at the bottom. Work through the milestones in order. After each one, run the app and tests yourself and read the code until you understand it.

## 1. What this project is

An interactive browser demo showing how radiation can corrupt an FPGA, and how configuration memory scrubbing protects it. It's inspired by the hardware SEU scrubbing engine in Efinix's Titanium Edge FPGA family (announced June 2026).

### Background (the concepts the demo teaches)
- An FPGA's circuit is defined by its configuration memory: bits that set what each lookup table (LUT) computes and how things connect. Change a bit and you change the circuit.
- A single event upset (SEU) happens when a charged particle (from cosmic rays, for example) strikes a memory cell and flips a bit. It's a real concern for aerospace, automotive, industrial, and medical systems.
- Scrubbing means continuously reading configuration memory, detecting errors with error-correcting codes (ECC), and writing back the corrected value before errors pile up.
- Only some bits matter. Flips in unused configuration bits do nothing. The bits that actually affect the design are called essential bits.
- Scrubbing repairs configuration memory, but it doesn't repair state. If a flip corrupted a counter's value while the circuit was broken, the counter stays wrong until the design is reset or resynchronized.

### Honesty note (keep this in the README)
This is an educational model of scrubbing concepts. It is not a model of Efinix's actual scrubbing engine, memory layout, or timing.

## 2. What the user sees and does
- A grid of configuration memory bits. Essential bits are visually distinct from unused bits.
- A small circuit (a 4-bit counter driving 8 LEDs in a sweeping pattern), running live.
- A "golden" reference copy of the same circuit running beside it, so errors are obvious.
- A radiation slider that randomly flips bits. The user can also click any bit to flip it by hand, or press Burst to flip 2–3 bits in one frame (a multi-bit upset).
- A scrubber toggle and scrub speed slider. When on, a cursor sweeps through memory frame by frame, fixing errors. Corrected bits briefly flash green.
- A metrics panel and timeline chart showing how often the circuit's output is correct, with scrubbing on versus off.

The payoff moment: turn up radiation, watch the LEDs go wrong, turn on the scrubber, and watch the circuit recover.

## 3. Goals
- A correct, unit-tested model of configuration memory with SECDED ECC per frame.
- A circuit whose behavior truly comes from the configuration bits (flipping a bit really changes the logic).
- Radiation injection, manual flips, and multi-bit bursts.
- A frame-by-frame scrubber that corrects single-bit errors, detects double-bit errors, and reloads those frames from a "boot flash" golden image.
- Clear visuals and metrics that make the concepts obvious in 10 seconds.
- Works on laptop and phone; deploys as a static site.

### Non-goals
- Modeling routing, real bitstream formats, or real FPGA frame layouts.
- Modeling Efinix-specific hardware or timing.
- Any backend.

## 4. Tech stack
- Vite + TypeScript, no UI framework.
- Vitest for unit tests.
- HTML `<canvas>` or plain DOM for the bit grid (canvas recommended for performance).
- No other dependencies unless approved.

## 5. Architecture
```
Radiation injector ──► Configuration memory (frames + ECC) ◄── Scrubber
                                │                                  │
                                ▼                                  ▼
                     Circuit (LUTs read config bits)       Boot flash (golden image)
                                │
                                ▼
                  Compare with golden circuit ──► Metrics + timeline
```

### Folder structure
```
src/
  core/
    ecc.ts            # Hamming SECDED (39,32): encode, decode, syndrome
    configMemory.ts   # frames of 32 data bits + 7 check bits; flip, read, write
    layout.ts         # maps LUT truth-table bits to (frame, bit) positions; essential-bit mask
    circuit.ts        # LUT evaluation, 4-bit state register, LED outputs
    radiation.ts      # random flips, manual flips, bursts (seeded RNG)
    scrubber.ts       # frame-by-frame scan, correct / detect / reload
    bootFlash.ts      # golden copy of configuration memory
    metrics.ts        # counters and timeline samples
    sim.ts            # wires everything together; tick(dt)
  ui/
    main.ts
    grid.ts           # configuration memory grid rendering
    circuitView.ts    # LEDs (faulty vs golden) and counter state
    controls.ts       # sliders, toggles, buttons
    chart.ts          # timeline chart (canvas)
    styles.css
tests/
  ecc.test.ts
  configMemory.test.ts
  circuit.test.ts
  scrubber.test.ts
  sim.test.ts
```

## 6. Component specifications

### 6.1 ECC: Hamming SECDED (39,32)
- Each frame holds 32 data bits plus 7 check bits (6 Hamming parity bits + 1 overall parity bit) = 39 bits.
- `encode(data: number): checkBits`
- `decode(data, check)` returns one of:
  - `ok` — no error
  - `corrected` — single-bit error; returns the corrected data and check bits, plus the bit position (a flip in a check bit also counts as correctable)
  - `uncorrectable` — double-bit error detected
- Tests: every single-bit flip across all 39 positions is corrected; every double-bit flip pattern (or a large random sample) is detected as uncorrectable.

### 6.2 Configuration memory
- 32 frames × 39 bits (32 data + 7 check) = 1,248 bits total.
- API: `getBit(frame, bit)`, `flipBit(frame, bit)`, `readFrame(frame)`, `writeFrame(frame, data, check)`.
- Tracks which bits are currently flipped relative to the golden image (for visualization only; the scrubber must NOT use this — it must rely on ECC).

### 6.3 Layout and the circuit

The circuit is built entirely from 4-input LUTs whose truth tables live in configuration memory.

- State: a 4-bit register Q[3:0], updated once per circuit clock tick.
- Next-state logic: 4 LUTs (LUT0–LUT3). Each takes Q[3:0] as input and produces one bit of Q + 1 mod 16.
- Output logic: 8 LUTs (LUT4–LUT11). Each takes Q[3:0] and drives one LED. The pattern is a "bounce" sweep: a single lit LED moving left to right across 8 LEDs, then right to left, over the 16 states. (For state s, the lit LED index is s if s < 8, else 15 - s.)
- 12 LUTs × 16 truth-table bits = 192 essential bits. All other data bits are unused.
- Layout: LUT truth tables are stored in frames spread across memory (e.g., each LUT occupies half a frame, placed in frames 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29, 31) so essential bits are visibly scattered, not clumped.
- Evaluation: a LUT's output = bit number Q of its 16-bit truth table, read from configuration memory at evaluation time. So a flipped bit changes the output only when that specific input combination occurs — this is realistic and worth showing.
- Golden circuit: an identical circuit that reads from the boot flash image instead, so it's always correct.

### 6.4 Radiation injector
- Seeded RNG so runs are reproducible (show the seed; allow reset).
- rate = expected flips per second (slider, 0–20). Each tick, the number of flips follows a Poisson draw for rate × dt; each flip hits a uniformly random bit among all 1,248.
- `flipAt(frame, bit)` for manual clicks.
- `burst()` flips 2–3 distinct bits in one random frame (models a multi-bit upset).

### 6.5 Scrubber
- Toggle on/off. speed = frames scanned per second (slider, 1–64).
- Scans frames in order, wrapping around. For each frame, reads data + check bits, runs decode:
  - `ok` → nothing
  - `corrected` → write back corrected frame; bit flashes green in the UI
  - `uncorrectable` → reload the frame from boot flash (takes an extra delay, e.g., 250 ms of simulated time, during which the scrubber pauses); frame flashes amber
- The scrubber must only use ECC results and boot flash, never the "flipped bits" tracking in configMemory.

### 6.6 State divergence and resync
- If the faulty circuit's state Q differs from the golden circuit's Q, show a "State diverged" warning even if configuration memory is clean.
- A Reset button resynchronizes the faulty circuit's state to the golden state. An optional Auto-resync toggle does this automatically when memory is clean but state differs.
- This teaches that scrubbing fixes configuration, not state.

### 6.7 Simulation loop
- `tick(dt)` advances simulated time: radiation, scrubber, then the circuit clock.
- Circuit clock: 4 Hz (so LED movement is visible). A Time speed control (1×, 4×, 16×) scales everything.
- Uses requestAnimationFrame in the UI; the core stays deterministic given the seed and dt values.

### 6.8 Metrics
- Flips injected, flips landing on essential bits, errors corrected, frames reloaded, current uncorrected flips.
- Output correctness %: share of circuit ticks where faulty LEDs match golden LEDs.
- Timeline chart: last 60 seconds, green when outputs match, red when they don't, with shading where the scrubber was on.

### 6.9 UI layout
- Top: two LED rows labeled "Your FPGA" and "Golden reference", plus counter state for each and the "State diverged" warning.
- Middle: configuration memory grid, 32 rows (frames) × 39 columns. Colors: unused data bit (muted), essential bit (accented), check bits (separate tint), currently flipped bit (red), just-corrected bit (green flash), reloaded frame (amber flash). Scrubber cursor highlights the current row. Clicking a bit flips it.
- Controls: radiation slider, Burst button, scrubber toggle, scrub speed slider, time speed, Reset, Auto-resync, seed display.
- Bottom: metrics and timeline chart.
- A short "What am I looking at?" panel with 3–4 sentences explaining SEUs and scrubbing.
- Responsive: on a phone, sections stack vertically and the grid scales to fit.
- Light and dark mode.

## 7. Milestones (build in this order)

**Commit to git after each milestone.**

### M1 — Scaffold (10 min)
Vite + TypeScript + Vitest, folder structure, placeholder layout. npm run dev and npm test work.

### M2 — ECC and configuration memory (30 min)
ecc.ts and configMemory.ts with full tests from 6.1.

### M3 — Layout and circuit (30 min)
LUT truth tables for the counter and bounce pattern, layout mapping, evaluation from memory, golden circuit. Tests: a clean circuit cycles through all 16 states with the correct LED pattern; flipping an essential bit changes output for exactly one input state; flipping an unused bit changes nothing.

### M4 — Radiation, scrubber, resync (40 min)
Tests: scrubber corrects single flips in every frame; double flips trigger a reload; with scrubbing on and moderate radiation, memory returns to clean; divergence is detected and reset works.

### M5 — UI (45–60 min)
Grid, LEDs, controls, cursor, flashes, click-to-flip, explanation panel.

### M6 — Metrics and chart (20 min)
Counters, correctness %, timeline.

### M7 — Polish and deploy (20 min)
README with the honesty note and design explanation, static deploy, phone test.

### Stretch goals (only after M7)
- "blind scrubbing" mode (rewrite every frame from flash without ECC) to compare with readback scrubbing
- a TMR (triple modular redundancy) toggle that triplicates the next-state LUTs with a majority voter
- a chart of correctness vs. scrub speed at a fixed radiation rate

## 8. Rules for the AI assistant
- Follow the milestones in order. Stop after each one, summarize what was built, and wait for my confirmation.
- Keep the simulation core free of DOM code.
- Write tests alongside the code; a milestone isn't done until npm test passes.
- Prefer clear, commented code over clever code. I need to explain every part of it.
- Don't add dependencies without asking.
- If something in this plan is ambiguous or wrong, say so instead of guessing.
- After each milestone, give me 2–3 sentences on the key design decision so I can talk about it.

## 9. Things I must be able to explain
- What an SEU is and why it matters for edge devices in harsh environments.
- How configuration memory defines an FPGA's circuit, and why only essential bits matter.
- How SECDED ECC corrects one flipped bit and detects two.
- Why scrub speed matters: if errors arrive faster than the scrubber sweeps, two flips can land in one frame and become uncorrectable.
- Why scrubbing fixes configuration but not state, and what a reset or resync does.
- What's simplified compared to real FPGAs (no routing, invented layout, illustrative timing).

## 10. Kickoff prompt
Read PLAN.md in the project root. It describes a browser-based SEU scrubbing visualizer for FPGA configuration memory. Follow the plan exactly, including the rules in section 8. Start with Milestone 1 only: scaffold the Vite + TypeScript + Vitest project with the folder structure in section 5. When M1 is done, summarize what you built, confirm npm run dev and npm test work, and wait for me before starting Milestone 2.
