# SEU Scrubbing Visualizer

An interactive browser demo showing how radiation can corrupt an FPGA and how configuration memory scrubbing protects it.

## Concepts

- **SEU (Single Event Upset)**: A charged particle flips a bit in memory, corrupting the circuit definition.
- **Configuration Memory**: Defines an FPGA's circuit. Each bit controls logic or connections.
- **Essential Bits**: Only some bits matter. Flips in unused bits do nothing.
- **SECDED ECC**: Corrects single-bit errors and detects double-bit errors.
- **Scrubbing**: Continuously reads memory, detects errors, and repairs them before they cascade.

## Running the Demo

```bash
npm install
npm run dev
npm test
```

Visit `http://localhost:5173` to see the visualizer.

## Honesty Note

This is an educational model of scrubbing concepts. It is **not** a model of Efinix's actual scrubbing engine, memory layout, or timing.

## Architecture

- **Simulation Core** (`src/core/`): Pure TypeScript, no DOM access. Testable in isolation.
  - `ecc.ts`: Hamming SECDED (39,32) encoding/decoding
  - `configMemory.ts`: 32 frames × 39 bits with flip tracking
  - `layout.ts`: Maps LUT bits to memory positions
  - `circuit.ts`: 4-bit counter + 12 LUTs driving 8 LEDs
  - `radiation.ts`: Random flips with seeded RNG
  - `scrubber.ts`: Frame-by-frame error correction
  - `bootFlash.ts`: Golden reference copy
  - `metrics.ts`: Counters and timeline data
  - `sim.ts`: Main tick loop

- **UI** (`src/ui/`): DOM and canvas rendering
  - `main.ts`: Entry point
  - `grid.ts`: Configuration memory grid
  - `circuitView.ts`: LED and state display
  - `controls.ts`: Sliders, buttons, toggles
  - `chart.ts`: Timeline chart
  - `styles.css`: Styling

## Build Status

**M1: Scaffold** — Vite + TypeScript + Vitest structure in place. npm test passes.
