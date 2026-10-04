import {
  getAnimTypeFields,
  isLinkFieldType,
  isRefFieldType,
  isWrefFieldType,
  isArrayFieldType,
  inferLinkFieldNames,
} from '../animTypes'
import type { AnimFieldDef, AnimFieldType } from '../animTypes'
import { DefaultNodeInputsHandler } from '../extractors/DefaultNodeInputsHandler'
import type { NodeInputHandler } from '../animNodes/handlers'
import { PROJECTION_DEFINITIONS } from './definitions'
import { nestedLinkArrayHandler, nestedLinkScalarHandler } from './nestedLinkHandler'
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

export function getFieldRole(animFieldDef: AnimFieldDef, projectionDef?: ProjectionDef): FieldRole | null {
  const override = projectionDef?.fields?.[animFieldDef.key]
  if (override) return override

  return inferFieldRole(animFieldDef.type)
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

function extraPinByName(typeName: string, pinName: string): NestedPinSpec | undefined {
  return getProjectionDef(typeName)?.extraPins?.find((p) => p.name === pinName)
}

export function getProjectedInputHandler(
  typeName: string,
  pinName: string
): NodeInputHandler {
  const nested = extraPinByName(typeName, pinName)
  if (nested) {
    return nested.elementType
      ? nestedLinkArrayHandler(nested)
      : nestedLinkScalarHandler(nested)
  }
  return {
    count: (node) => DefaultNodeInputsHandler.count(pinName, node),
    get: (node, index) => DefaultNodeInputsHandler.get(pinName, node, index),
    set: (node, data, index) =>
      DefaultNodeInputsHandler.set(pinName, node, data, index),
    delete: (node, index) => DefaultNodeInputsHandler.delete(pinName, node, index),
  }
}
