// Maps LUT truth-table bits to (frame, bit) positions
// Scatters 12 LUTs across memory so essential bits are visibly distributed

export interface BitPosition {
  frame: number
  bit: number
}

// Placeholder: to be implemented in M3
export function getLutBitPosition(lut: number, truthTableBit: number): BitPosition {
  return { frame: 0, bit: 0 }
}

export function isEssentialBit(frame: number, bit: number): boolean {
  return false
}

export const essentialBitMask = new Set<string>()
