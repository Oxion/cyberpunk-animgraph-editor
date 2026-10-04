/**
 * Shared pin-field enumeration for add UI, connect typing, and codegen.
 * Projection role `pin` (includes pin-override) + optional extraPins.
 */

import {
  fieldTypeName,
  getAnimTypeFields,
  isArrayFieldType,
  isLinkFieldType,
  structWrefNodeTarget,
  type AnimFieldDef,
  type AnimFieldType,
} from '../../animTypes'
import {
  getFieldRole,
  getProjectionDef,
  inferFieldRole,
  type NestedPinSpec,
} from '../../projection'

/** Which pin fields participate in a walk / gather. */
export type AnimgraphPinWalkMode =
  /** All projection `role === 'pin'` (includes pin-override). */
  | 'pin'
  /** Only pin-override: role pin + inferred contain. */
  | 'pin-override'

export function isPinOverrideField(ownerType: string, field: AnimFieldDef): boolean {
  const inferred = inferFieldRole(field.type)
  const role = getFieldRole(field, getProjectionDef(ownerType))
  return role === 'pin' && inferred === 'contain'
}

/** Link → wref target; otherwise unwrap field type name (ref/wref/array). */
export function pinSlotExpectedType(fieldType: AnimFieldType): string | null {
  if (isLinkFieldType(fieldType)) {
    const linkName = typeof fieldType === 'string' ? fieldType : fieldTypeName(fieldType)
    return structWrefNodeTarget(linkName)
  }
  const name = fieldTypeName(fieldType)
  return !name || name === 'unknown' ? null : name
}

export function expectedTypeFromExtraPin(spec: NestedPinSpec): string | null {
  if (spec.linkType) return structWrefNodeTarget(spec.linkType)
  return null
}

export function fieldContainerKind(fieldType: AnimFieldType): 'array' | 'scalar' {
  return isArrayFieldType(fieldType) ? 'array' : 'scalar'
}

/** Projection pin fields on `ownerType`, optionally restricted to pin-override. */
export function listPinFields(
  ownerType: string,
  mode: AnimgraphPinWalkMode = 'pin'
): AnimFieldDef[] {
  return getAnimTypeFields(ownerType).filter((field) => {
    const role = getFieldRole(field, getProjectionDef(ownerType))
    if (role !== 'pin') return false
    if (mode === 'pin-override') return isPinOverrideField(ownerType, field)
    return true
  })
}

export function listExtraPins(ownerType: string): readonly NestedPinSpec[] {
  return getProjectionDef(ownerType)?.extraPins ?? []
}
