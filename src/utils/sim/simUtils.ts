import { SimCompareFunc } from "./simTypes"

/** Normalize AGCF_Equal / Equal / equal → canonical key. */
export function normalizeCompareFunc(fn: unknown): string {
  return String(fn ?? 'equal')
    .replace(/^AGCF_/i, '')
    .toLowerCase()
}

export function compareNumber(a: number, b: number, fn: SimCompareFunc): boolean {
  const eps = Number.EPSILON * 8
  switch (normalizeCompareFunc(fn)) {
    case 'equal':
      return Math.abs(a - b) <= eps
    case 'notequal':
      return Math.abs(a - b) > eps
    case 'less':
      return a < b
    case 'lessequal':
      return a <= b
    case 'greater':
      return a > b
    case 'greaterequal':
      return a >= b
    default:
      return Math.abs(a - b) <= eps
  }
}