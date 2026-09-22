# SEU Scrubbing Visualizer

An interactive browser demo of how radiation corrupts an FPGA's configuration memory, and how
configuration scrubbing repairs it. It's inspired by the hardware SEU scrubbing engine in Efinix's
Titanium Edge FPGA family.

**Try this:** turn the radiation up, watch the LEDs on "Your FPGA" go wrong, then switch on the
scrubber and watch the circuit recover.

> **Honesty note:** This is an educational model of scrubbing concepts. It is not a model of
> Efinix's actual scrubbing engine, memory layout, or timing.

## What you're looking at

- **Configuration memory** (the grid): 32 frames × 39 bits = 1,248 bits. Each frame is 32 data bits
  plus 7 ECC check bits.
- **Essential bits** (blue): 192 bits holding the truth tables of 12 four-input LUTs. They *are*
  the circuit. Every other data bit is unused, and flipping one does nothing (shown faint red).
- **The circuit**: a 4-bit counter (LUT0–3 compute Q+1) driving 8 LEDs in a bouncing sweep
  (LUT4–11). A golden copy runs from the boot flash image beside it, so errors are obvious.
- **The scrubber**: a cursor that reads one frame at a time, fixes single-bit errors with ECC
  (green flash), and reloads frames with double-bit errors from boot flash (amber flash).
- **Metrics**: correctness measured once per clock tick, split by scrubber on vs. off, plus a
  60-second timeline.

## Concepts

**Single event upset (SEU).** A charged particle (from cosmic rays, for example) strikes a memory
cell and flips a bit. In an FPGA, configuration memory defines the logic itself, so a flip in an
essential bit changes the circuit. This matters for aerospace, automotive, industrial and medical
systems, and for edge devices deployed in harsh environments without anyone around to reboot them.

**Why only essential bits matter.** A LUT's output is `truthTable[inputs]`, read from memory. A
flipped truth-table bit changes the output only when the circuit is in the one input state that
selects it. So a flip can sit harmlessly for a while and then suddenly corrupt the output. Hover
any bit in the grid to see exactly which LUT entry it controls.

**How SECDED ECC works (Hamming 39,32).** The 32 data bits and 6 parity bits are placed at
"codeword positions" 1–38, with parity bits at the powers of two. The parity bits are chosen so
that XOR-ing the positions of all set bits gives 0. When one bit flips, that XOR (the *syndrome*)
equals the flipped bit's position, so the decoder knows exactly what to fix. A 7th overall-parity
bit distinguishes one flip (odd parity) from two (even parity, nonzero syndrome), which can be
detected but not located.

**Why scrub speed matters.** ECC can only fix one flip per frame. If flips arrive faster than the
scrubber sweeps, two can land in the same frame before it's checked, and that frame has to be
reloaded from flash. Slide the scrub speed down with radiation up to see this happen.

**Scrubbing fixes configuration, not state.** If a corrupted next-state LUT makes the counter jump
to the wrong value, repairing the LUT doesn't bring the counter back. The design state stays
diverged ("State diverged" warning) until it's reset or resynchronized. **Reset state** copies the
golden state in. **Auto-resync** does it automatically once every frame passes ECC.

## Design decisions

- **The simulation core has no DOM access.** Everything in `src/core` is plain TypeScript driven
  by `tick(dt)`, fully deterministic for a given seed and sequence of `dt` values, and unit-tested
  in Node. The UI only reads state and forwards user actions.
- **The circuit really runs from the configuration bits.** Nothing is faked: LEDs and next-state
  logic are evaluated by reading LUT truth tables out of configuration memory on every clock.
- **The scrubber can't cheat.** Memory tracks which bits differ from the loaded image, but only
  for drawing the grid. The scrubber only sees ECC decode results, a stored CRC, and boot flash.
- **A CRC backstop for what SECDED can't see.** Three or more flips in one frame can fool SECDED:
  the decoder "corrects" the wrong bit, and from then on the frame decodes as clean. (This goes
  beyond the original plan, which only covered 1- and 2-bit errors.) After every sweep in which
  ECC found nothing, the scrubber compares a CRC-32 of live memory against the CRC stored in boot
  flash, and on a mismatch reloads all of memory. Without this, a heavy burst of radiation could
  leave permanent hidden corruption.
- **Essential bits are scattered on purpose.** Each LUT occupies half of one frame (frames 2, 5,
  7, 10, 13, 16, 18, 21, 24, 26, 29, 31), alternating low and high halves, so the grid shows that
  essential bits are a small, spread-out fraction of memory.

## What's simplified compared to a real FPGA

- No routing or interconnect: only LUT truth tables are modeled, and the flip-flop is ideal.
- The frame size, frame count and layout are invented. Real devices have millions of bits and
  vendor-specific frame formats.
- The timing is illustrative: a 4 Hz circuit clock, 1–64 frames/s scrubbing, and 0.25 s frame
  reloads.
- Radiation is uniform and Poisson-distributed; a real multi-bit upset hits physically adjacent
  cells, which real devices handle by interleaving bits across ECC words.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 40 unit tests (ECC, memory, circuit, scrubber, simulation, metrics)
npm run build    # static site in dist/
```

The site is fully static. Pushing to `main` runs the tests and deploys `dist/` to GitHub Pages
via `.github/workflows/deploy.yml`. To turn this on, go to repo Settings → Pages → Source and
choose "GitHub Actions".

## Project layout

```
src/core/            simulation (no DOM)
  ecc.ts             Hamming SECDED (39,32) encode / decode
  configMemory.ts    32 frames × 39 bits, flip / read / write
  layout.ts          LUT → (frame, bit) mapping, golden truth tables, essential-bit mask
  circuit.ts         LUT evaluation, 4-bit state register, LED outputs
  bootFlash.ts       golden image + CRC-32
  radiation.ts       seeded RNG, Poisson flips, manual flips, bursts
  scrubber.ts        frame-by-frame ECC scrub, frame reload, CRC full reload
  metrics.ts         counters, correctness, 60 s timeline
  sim.ts             wires it together; tick(dt)
src/ui/              DOM + canvas rendering
tests/               Vitest unit tests
```
