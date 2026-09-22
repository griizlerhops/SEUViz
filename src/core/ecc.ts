// Hamming SECDED (39,32): Single-Error Correction, Double-Error Detection.
//
// A frame stores 32 data bits plus 7 check bits:
//   - 6 Hamming parity bits (p1, p2, p4, p8, p16, p32)
//   - 1 overall parity bit covering all 38 other bits
//
// How Hamming works: imagine the 38 non-overall bits laid out at "codeword
// positions" 1..38. Parity bits sit at the power-of-two positions
// (1, 2, 4, 8, 16, 32) and data bits fill the rest (3, 5, 6, 7, 9, ...).
// The parity bits are chosen so that XOR-ing together the positions of every
// set bit gives 0. If one bit flips, that XOR (the "syndrome") equals the
// position of the flipped bit, which tells us exactly which bit to fix.
//
// The overall parity bit tells single errors (odd number of flips) apart from
// double errors (even number of flips, nonzero syndrome).
//
// Bit numbering used outside this file (matches configMemory):
//   bits 0..31  = data bits
//   bits 32..37 = Hamming parity bits p1, p2, p4, p8, p16, p32 (check bits 0..5)
//   bit  38     = overall parity bit (check bit 6)

export const DATA_BITS = 32
export const CHECK_BITS = 7
export const FRAME_BITS = DATA_BITS + CHECK_BITS // 39

const OVERALL_PARITY_CHECK_INDEX = 6

// DATA_POSITION[i] = codeword position (3..38) of data bit i.
// POSITION_TO_DATA_BIT[pos] = data bit index at that position, or -1.
const DATA_POSITION: number[] = []
const POSITION_TO_DATA_BIT: number[] = new Array(39).fill(-1)

for (let pos = 1; DATA_POSITION.length < DATA_BITS; pos++) {
  const isPowerOfTwo = (pos & (pos - 1)) === 0
  if (!isPowerOfTwo) {
    POSITION_TO_DATA_BIT[pos] = DATA_POSITION.length
    DATA_POSITION.push(pos)
  }
}

export type DecodeResult =
  | { status: 'ok' }
  | {
      status: 'corrected'
      data: number
      check: number
      /** Which frame bit (0..38) was flipped and has been fixed. */
      errorBit: number
    }
  | { status: 'uncorrectable' }

/** Number of set bits in a 32-bit value. */
function popcount(x: number): number {
  let count = 0
  x = x >>> 0
  while (x !== 0) {
    x &= x - 1
    count++
  }
  return count
}

/** XOR of the codeword positions of all set data bits. */
function dataPositionXor(data: number): number {
  let acc = 0
  for (let i = 0; i < DATA_BITS; i++) {
    if ((data >>> i) & 1) acc ^= DATA_POSITION[i]
  }
  return acc
}

/**
 * Compute the 7 check bits for a 32-bit data word.
 * Returns a 7-bit number: bits 0..5 are Hamming parity, bit 6 is overall parity.
 */
export function encode(data: number): number {
  data = data >>> 0
  // Parity bit p(2^j) is bit j of the XOR of data positions. Setting the
  // parity bits this way makes the XOR of all set positions equal zero.
  const hamming = dataPositionXor(data) & 0b111111
  const overall = (popcount(data) + popcount(hamming)) & 1
  return hamming | (overall << OVERALL_PARITY_CHECK_INDEX)
}

/**
 * Check a frame and, if possible, fix it.
 *   - ok:            no error detected
 *   - corrected:     exactly one bit was wrong (data or check); fixed values returned
 *   - uncorrectable: two bits wrong (or a pattern we can't locate)
 */
export function decode(data: number, check: number): DecodeResult {
  data = data >>> 0
  check = check & 0b1111111

  const storedHamming = check & 0b111111
  // Syndrome = XOR of positions of all set bits (data and parity).
  // Parity bit j lives at position 2^j, so its contribution is just its bit.
  const syndrome = dataPositionXor(data) ^ storedHamming
  // Overall parity across all 39 bits should be even (0) when clean.
  const overallParity = (popcount(data) + popcount(check)) & 1

  if (syndrome === 0 && overallParity === 0) {
    return { status: 'ok' }
  }

  if (overallParity === 0) {
    // Even number of flips but nonzero syndrome: a double error.
    return { status: 'uncorrectable' }
  }

  // Odd number of flips: assume exactly one, located by the syndrome.
  if (syndrome === 0) {
    // Only the overall parity bit itself is wrong.
    return {
      status: 'corrected',
      data,
      check: check ^ (1 << OVERALL_PARITY_CHECK_INDEX),
      errorBit: DATA_BITS + OVERALL_PARITY_CHECK_INDEX,
    }
  }

  const isPowerOfTwo = (syndrome & (syndrome - 1)) === 0
  if (isPowerOfTwo) {
    // A Hamming parity bit flipped. Position 2^j -> check bit j.
    const j = Math.log2(syndrome)
    return {
      status: 'corrected',
      data,
      check: check ^ (1 << j),
      errorBit: DATA_BITS + j,
    }
  }

  const dataBit = syndrome < POSITION_TO_DATA_BIT.length ? POSITION_TO_DATA_BIT[syndrome] : -1
  if (dataBit < 0) {
    // Syndrome points outside the codeword: must be 3+ flips. Can't fix.
    return { status: 'uncorrectable' }
  }

  return {
    status: 'corrected',
    data: (data ^ (1 << dataBit)) >>> 0,
    check,
    errorBit: dataBit,
  }
}
