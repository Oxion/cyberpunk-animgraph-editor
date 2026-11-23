/**
 * Projection resolve — canvas roles, extraPins, wrap, NodeInputHandler adapters.
 * AnimNodes has no pin concept; pin/extraPins live here.
 * Handler writes should go through animgraphMutation (setPinSlot / clearHandleRef).
 */

import {
  getAnimTypeFields,
  isLinkFieldType,
  isRefFieldType,
  isWrefFieldType,
  isArrayFieldType,
  inferLinkFieldNames,
} from '../animTypes'
import type { AnimFieldDef, AnimFieldType } from '../animTypes'
import type { NodeInputHandler } from '../animNodes/handlers'
import type { AnimgraphMutationCtx } from '../graph/animgraphMutation'
import {
  clearHandleRef,
  countPinSlots,
  getPinSlot,
  setPinSlot,
} from '../graph/animgraphMutation'
import { resolvePinStorage } from '../graph/animgraphMutation/pinStorage'
import { PROJECTION_DEFINITIONS } from './definitions'
import type { FieldRole, NestedPinSpec, ProjectionDef } from './types'

export { isLinkFieldType }

export function inferLinkPinNames(typeName: string): string[] {
  return inferLinkFieldNames(typeName)
}

export function getProjectionDef(typeName: string): ProjectionDef | undefined {
  return PROJECTION_DEFINITIONS[typeName]
}

/** Default canvas role from the engine field type. */
export function inferFieldRole(type: AnimFieldType): FieldRole | null {
  if (isArrayFieldType(type)) return inferFieldRole(type.array)
  if (isLinkFieldType(type)) return 'pin'
  if (isRefFieldType(type)) return 'contain'
  if (isWrefFieldType(type)) return 'pin'
  return null
}

export function getFieldRole(
  animFieldDef: AnimFieldDef,
  projectionDef?: ProjectionDef | null
): FieldRole | null {
  const override = projectionDef?.fields?.[animFieldDef.key]
  if (override) return override
  return inferFieldRole(animFieldDef.type)
}

export function getFieldRoleForType(
  ownerType: string,
  animFieldDef: AnimFieldDef
): FieldRole | null {
  return getFieldRole(animFieldDef, getProjectionDef(ownerType))
}

/** Diagram-native wrapper type for this $type, if any. */
export function getProjectedWrap(typeName: string): string | undefined {
  return getProjectionDef(typeName)?.wrap
}

export function getProjectedPinNames(typeName: string): string[] {
  const def = getProjectionDef(typeName)
  if (def?.pins) return [...def.pins]

  const names: string[] = []
  for (const field of getAnimTypeFields(typeName)) {
    if (getFieldRole(field, def) === 'pin') names.push(field.key)
  }

  if (def?.extraPins) {
    for (const pin of def.extraPins) {
      if (!names.includes(pin.name)) names.push(pin.name)
    }
  }
  return names
}

/** Field keys whose projection role is one of `roles`. */
export function getProjectedFieldNames(typeName: string, ...roles: FieldRole[]): string[] {
  if (roles.length === 0) return []
  const wanted = new Set(roles)
  const def = getProjectionDef(typeName)
  const names: string[] = []
  for (const field of getAnimTypeFields(typeName)) {
    const role = getFieldRole(field, def)
    if (role && wanted.has(role)) names.push(field.key)
  }
  return names
}

/** Diagram containment: PropertyGroup seeds from projection role `contain`. */
export function getProjectedContainFieldNames(typeName: string): string[] {
  return getProjectedFieldNames(typeName, 'contain')
}

export function listExtraPins(typeName: string): readonly NestedPinSpec[] {
  return getProjectionDef(typeName)?.extraPins ?? []
}

export function getExtraPinByName(
  typeName: string,
  pinName: string
): NestedPinSpec | undefined {
  return listExtraPins(typeName).find((p) => p.name === pinName)
}

/**
 * Read-oriented pin adapter (get/count). Prefer bindProjectedInputHandler for writes.
 */
export function getProjectedInputHandler(
  typeName: string,
  pinName: string
): NodeInputHandler {
  const storage = resolvePinStorage(typeName, pinName)
  if (!storage) {
    return {
      count: () => 0,
      get: () => null,
      set: () => {},
      delete: () => {},
    }
  }
  return {
    count: (node) => storage.count(node),
    get: (node, index) => storage.get(node, index),
    set: (node, data, index) => storage.set(node, data, index),
    delete: (node, index) => storage.delete(node, index),
    clearLink: storage.clearLink
      ? (node, index) => storage.clearLink!(node, index)
      : undefined,
  }
}

/** Projection pin adapter bound to animgraphMutation ctx — writes go through crud. */
export function bindProjectedInputHandler(
  typeName: string,
  pinName: string,
  ctx: AnimgraphMutationCtx
): NodeInputHandler {
  return {
    count: (node) => countPinSlots(ctx, node.HandleId, pinName),
    get: (node, index) => getPinSlot(ctx, node.HandleId, pinName, index ?? 0),
    set: (node, data, index) => {
      setPinSlot(ctx, node.HandleId, pinName, index ?? 0, data)
    },
    delete: (node, index) => {
      clearHandleRef(ctx, node.HandleId, pinName, index ?? 0)
    },
    clearLink: (node, index) => {
      const result = clearHandleRef(ctx, node.HandleId, pinName, index ?? 0)
      return result.linkCleared
    },
  }
}

export type { NestedPinSpec }
