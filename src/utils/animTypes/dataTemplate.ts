/**
 * Blank Data payload from the type registry.
 * Node catalog `dataTemplate` overlays this (special defaults only).
 */

import type { AnimFieldType } from './types'
import {
  fieldTypeName,
  isArrayFieldType,
  isRefFieldType,
  isWrefFieldType,
} from './fieldType'
import {
  getAnimTypeFields,
  resolveAnimType,
  structWrefNodeTarget,
} from './registry'

export type DataTemplateObject = {
  $type: string
  [key: string]: unknown
}

const UNSET_NODE_ID = 4294967295

const CNAME_NONE: DataTemplateObject = {
  $type: 'CName',
  $storage: 'string',
  $value: 'None',
}

const RESOURCE_PATH_EMPTY: DataTemplateObject = {
  $type: 'ResourcePath',
  $storage: 'uint64',
  $value: '0',
}

function cloneTemplate(value: DataTemplateObject): DataTemplateObject {
  return JSON.parse(JSON.stringify(value)) as DataTemplateObject
}

/** Default JSON value for a field type (links → `{ $type, node: null }`). */
export function defaultValueForFieldType(
  type: AnimFieldType,
  fieldKey?: string,
  depth = 0
): unknown {
  if (depth > 8) return null
  if (isArrayFieldType(type)) return []
  if (isRefFieldType(type) || isWrefFieldType(type)) return null
  if (typeof type !== 'string') return null

  if (type === 'bool01') return 0
  if (type === 'int') return fieldKey === 'id' ? UNSET_NODE_ID : 0
  if (type === 'float') return 0
  if (type === 'string') return ''
  if (type === 'cname') return cloneTemplate(CNAME_NONE)
  if (type === 'resourcePath') return cloneTemplate(RESOURCE_PATH_EMPTY)
  if (type === 'object' || type === 'unknown') return null

  const resolved = resolveAnimType(type)
  if (!resolved) return { $type: type }
  if (resolved.kind === 'enum') return resolved.values[0] ?? ''
  if (resolved.kind === 'bool01') return 0
  if (resolved.kind === 'int') return fieldKey === 'id' ? UNSET_NODE_ID : 0
  if (resolved.kind === 'float') return 0
  if (resolved.kind === 'string') return ''
  if (resolved.kind === 'cname') return cloneTemplate(CNAME_NONE)
  if (resolved.kind === 'resourcePath') return cloneTemplate(RESOURCE_PATH_EMPTY)
  if (resolved.kind === 'object' || resolved.kind === 'unknown') return null
  if (resolved.kind === 'class') return null
  if (resolved.kind === 'struct') {
    if (structWrefNodeTarget(type)) {
      return { $type: type, node: null }
    }
    return generateDataTemplate(type, depth + 1)
  }
  return null
}

/** Own + inherited fields filled with engine-ish blanks. */
export function generateDataTemplate(
  typeName: string,
  depth = 0
): DataTemplateObject | undefined {
  if (depth > 8) return { $type: typeName }

  const def = resolveAnimType(typeName)
  if (!def) return undefined
  if (def.kind !== 'class' && def.kind !== 'struct') return undefined

  const obj: DataTemplateObject = { $type: typeName }
  for (const field of getAnimTypeFields(typeName)) {
    obj[field.key] = defaultValueForFieldType(field.type, field.key, depth)
  }
  if (typeName === 'QsTransform') {
    obj.Scale = cloneTemplate({ $type: 'Vector4', X: 1, Y: 1, Z: 1, W: 1 })
  }
  if (typeName === 'Quaternion') {
    obj.r = 1
  }
  if (typeName === 'CurveDataFloat') {
    obj.InterpolationType = 'Linear'
    obj.LinkType = 'ESLT_Normal'
    if (!Array.isArray(obj.Elements)) obj.Elements = []
  }
  // RED JSON resource refs have no `$type` wrapper — only DepotPath + Flags.
  if (typeName === 'ResourceReference') {
    delete (obj as { $type?: string }).$type
  }
  return obj
}

/** Blank array element, including primitives (bool/enum/number). */
export function generateArrayElementValue(
  ownerType: string,
  fieldName: string
): unknown {
  const field = getAnimTypeFields(ownerType).find((f) => f.key === fieldName)
  if (!field || !isArrayFieldType(field.type)) return undefined
  const inner = fieldTypeName(field.type.array)
  const resolved = resolveAnimType(inner)
  if (resolved?.kind === 'class' || resolved?.kind === 'struct') {
    const tmpl = generateDataTemplate(inner)
    if (tmpl) return JSON.parse(JSON.stringify(tmpl))
  }
  const value = defaultValueForFieldType(field.type.array, fieldName)
  if (value && typeof value === 'object') {
    return JSON.parse(JSON.stringify(value))
  }
  if (structWrefNodeTarget(inner)) {
    return { $type: inner, node: null }
  }
  return value
}

export function generateArrayElementTemplate(
  ownerType: string,
  fieldName: string
): Record<string, unknown> | undefined {
  const value = generateArrayElementValue(ownerType, fieldName)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}
