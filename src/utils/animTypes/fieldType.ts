/**
 * Runtime helpers for AnimFieldType wrappers (`array` / `ref` / `wref`).
 */

import type { AnimFieldType } from './types'

export function isArrayFieldType(
  type: AnimFieldType
): type is { array: AnimFieldType } {
  return typeof type === 'object' && type !== null && 'array' in type
}

export function isRefFieldType(type: AnimFieldType): type is { ref: string } {
  return typeof type === 'object' && type !== null && 'ref' in type
}

export function isWrefFieldType(type: AnimFieldType): type is { wref: string } {
  return typeof type === 'object' && type !== null && 'wref' in type
}

/** Innermost registry name (`{ array: { wref: 'Foo' } }` → `Foo`). */
export function fieldTypeName(type: AnimFieldType): string {
  if (typeof type === 'string') return type
  if (isArrayFieldType(type)) return fieldTypeName(type.array)
  if (isRefFieldType(type)) return type.ref
  if (isWrefFieldType(type)) return type.wref
  return 'unknown'
}
