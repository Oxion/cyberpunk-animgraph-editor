/**
 * RED CName / slot hash helpers (engine red::CalculateHash64 + anim::CalcSlotNameHash).
 */

/** FNV-1a 64-bit offset basis / prime (redSystem hash.h). */
const FNV_OFFSET_BASIS64 = 14695981039346656037n
const FNV_PRIME64 = 1099511628211n
const U64_MASK = 0xffffffffffffffffn

/** Engine red::c_invalidNameHashValue — CName "None" / empty. */
export const INVALID_CNAME_HASH = 0n

/** Engine red::IsNameNone. */
export function isNameNone(name: string | null | undefined): boolean {
  if (name == null || name.length === 0) return true
  return name.length === 4 && name === 'None'
}

/**
 * Engine red::CalculateHash64WithLength — FNV-1a over AnsiChar bytes.
 * ASCII / Latin-1 code units (CName AnsiChar path).
 */
export function calculateHash64(name: string, baseHash: bigint = FNV_OFFSET_BASIS64): bigint {
  let hash = baseHash & U64_MASK
  for (let i = 0; i < name.length; i++) {
    hash ^= BigInt(name.charCodeAt(i) & 0xff)
    hash = (hash * FNV_PRIME64) & U64_MASK
  }
  return hash
}

/** Engine NameBuilder::CalculateHash / CName from string. */
export function cnameHash64(name: string | null | undefined): bigint {
  if (isNameNone(name)) return INVALID_CNAME_HASH
  return calculateHash64(name!)
}

/**
 * Engine anim::CalcSlotNameHash — fold 64→32 via hi^lo, as signed Int32.
 */
export function calcSlotNameHash(name: string | null | undefined): number {
  const hash = cnameHash64(name)
  const part1 = Number((hash >> 32n) & 0xffffffffn) >>> 0
  const part2 = Number(hash & 0xffffffffn) >>> 0
  return (part1 ^ part2) | 0
}
