/**
 * Engine field wrappers: pose/float/… link vs owned handle (`ref`).
 * Projection maps those onto canvas pin vs contain.
 */

import type { AnimFieldType } from './types'
import { isArrayFieldType, isRefFieldType, isWrefFieldType } from './fieldType'
import { getAnimTypeFields, structWrefNodeTarget } from './registry'

/** `animPoseLink` / `animFloatLink` / array of those — `node: wref`. */
export function isLinkFieldType(type: AnimFieldType): boolean {
  if (isArrayFieldType(type)) return isLinkFieldType(type.array)
  if (typeof type === 'string') return structWrefNodeTarget(type) != null
  return false
}

/** `{ ref: T }` / `{ wref: T }` / arrays of those — nested HandleId. */
export function isOwnedHandleFieldType(type: AnimFieldType): boolean {
  if (isArrayFieldType(type)) return isOwnedHandleFieldType(type.array)
  return isRefFieldType(type) || isWrefFieldType(type)
}

export function inferLinkFieldNames(typeName: string): string[] {
  const names: string[] = []
  for (const field of getAnimTypeFields(typeName)) {
    if (isLinkFieldType(field.type)) names.push(field.key)
  }
  return names
}

export function inferOwnedHandleFieldNames(typeName: string): string[] {
  const names: string[] = []
  for (const field of getAnimTypeFields(typeName)) {
    if (isOwnedHandleFieldType(field.type)) names.push(field.key)
  }
  return names
}
