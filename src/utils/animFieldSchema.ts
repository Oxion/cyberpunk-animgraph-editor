/**
 * Animgraph Data field schema — resolve fields from type definitions.
 *
 * Named types live in `animTypes.ts`. This module does not decide pins vs children.
 */

export type {
  AnimFieldDef,
  AnimFieldRange,
  AnimFieldType,
  AnimFieldDerived,
  AnimTypeDef,
  AnimTypeName,
  NumericConstraint,
} from './animTypes'
export {
  AnimTypes,
  registerAnimType,
  resolveAnimType,
  getAnimTypeParent,
  isAnimType,
  listAnimTypeImplementations,
  getAnimEnumValues,
  clampNumericFieldValue,
  getDefaultTypeConstraint,
  getEffectiveFieldConstraint,
  getTypeConstraint,
  mergeNumericConstraints,
  isArrayFieldType,
  isRefFieldType,
  isWrefFieldType,
  fieldTypeName,
  getAnimTypeFields,
  structWrefNodeTarget,
  generateDataTemplate,
  generateArrayElementTemplate,
  generateArrayElementValue,
  defaultValueForFieldType,
  inferLinkFieldNames,
  inferOwnedHandleFieldNames,
  isLinkFieldType,
  isOwnedHandleFieldType,
} from './animTypes'

import type { AnimFieldDef, AnimFieldType } from './animTypes'
import { getAnimTypeFields, resolveAnimType } from './animTypes'

const HIDDEN_KEYS = new Set(['$type', 'id'])

function isHiddenAnimFieldKey(key: string): boolean {
  if (HIDDEN_KEYS.has(key)) return true
  // Editor-only vis* metadata (visAxes, visMask), not game fields like visualTag.
  if (/^vis[A-Z]/.test(key) || /^Vis[A-Z]/.test(key)) return true
  const lower = key.toLowerCase()
  return lower.startsWith('debug') || lower.includes('debug')
}

function isCNameLike(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  return obj.$type === 'CName' || ('$value' in obj && '$storage' in obj)
}

function isHandleLike(value: unknown): boolean {
  if (value == null) return true
  if (typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  if ('HandleId' in obj || 'HandleRefId' in obj) return true
  if ('node' in obj || 'link' in obj) return true
  if (typeof obj.$type === 'string' && /Link$/i.test(obj.$type)) return true
  return false
}

/** Handle JSON (`HandleId`/`Data`) or a named link struct → `{ ref }` / registry name. */
function inferHandleFieldType(value: unknown): AnimFieldType {
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj.$type === 'string' && resolveAnimType(obj.$type)) return obj.$type
    const data = obj.Data
    if (data && typeof data === 'object') {
      const typeName = (data as { $type?: unknown }).$type
      if (typeof typeName === 'string') return { ref: typeName }
    }
  }
  return { ref: 'ISerializable' }
}

function inferTypeName(value: unknown, key: string): AnimFieldType {
  if (value && typeof value === 'object') {
    const typeName = (value as { $type?: unknown }).$type
    if (typeof typeName === 'string' && resolveAnimType(typeName)) return typeName
  }
  if (typeof value === 'boolean') return 'bool01'
  if (typeof value === 'string') {
    if (value === 'Linear' || value === 'EaseIn' || value === 'EaseOut' || value === 'EaseInOut') {
      if (key.toLowerCase().includes('interpolation')) return 'AnimStateInterpolationType'
    }
    if (value === 'Lerp' || value === 'Slerp') return 'EInterpolationType'
    return 'string'
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (
      value === 0 ||
      value === 1 ||
      /^(is|can|has|use|enable|support|prevent|apply|timeWarping|collect)/i.test(key) ||
      key.toLowerCase().includes('enabled')
    ) {
      return 'bool01'
    }
    return Number.isInteger(value) ? 'int' : 'float'
  }
  if (isCNameLike(value)) return 'cname'
  if (isHandleLike(value)) return inferHandleFieldType(value)
  if (value && typeof value === 'object') return 'object'
  return 'unknown'
}

function inferElementTypeName(sample: unknown): AnimFieldType {
  if (sample === undefined) return 'unknown'
  if (sample && typeof sample === 'object') {
    const typeName = (sample as { $type?: unknown }).$type
    if (typeof typeName === 'string' && resolveAnimType(typeName)) return typeName
  }
  if (isCNameLike(sample)) return 'cname'
  if (isHandleLike(sample)) return inferHandleFieldType(sample)
  if (typeof sample === 'number') return Number.isInteger(sample) ? 'int' : 'float'
  if (typeof sample === 'string') return 'string'
  if (typeof sample === 'boolean') return 'bool01'
  return 'object'
}

/**
 * Infer a single field def from a live/template value.
 * `inputNames` marks graph pin fields (legacy, until projection).
 */
export function inferAnimFieldDef(
  key: string,
  value: unknown,
  inputNames: ReadonlySet<string>,
  data?: Record<string, unknown>
): AnimFieldDef | null {
  if (isHiddenAnimFieldKey(key)) return null

  if (inputNames.has(key)) {
    if (Array.isArray(value)) {
      return { key, type: { array: inferElementTypeName(value[0]) } }
    }
    return { key, type: inferTypeName(value, key) }
  }

  // Engine convention: numInputs mirrors inputNodes (Switch, etc.).
  if (
    key === 'numInputs' &&
    data &&
    (Array.isArray(data.inputNodes) || inputNames.has('inputNodes'))
  ) {
    return {
      key,
      type: 'int',
      derivedFrom: { kind: 'arrayLength', key: 'inputNodes' },
    }
  }

  if (Array.isArray(value)) {
    return { key, type: { array: inferElementTypeName(value[0]) } }
  }

  return { key, type: inferTypeName(value, key) }
}

/**
 * Field schema for a typed animgraph object (type registry only).
 * Ordered by field name.
 */
export function resolveAnimFields(typeName: string): AnimFieldDef[] {
  const byKey = new Map<string, AnimFieldDef>()

  for (const field of getAnimTypeFields(typeName)) {
    if (isHiddenAnimFieldKey(field.key)) continue
    byKey.set(field.key, field)
  }

  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export function isAnimFieldDerived(
  field: AnimFieldDef,
  derivedFrom?: AnimFieldDef['derivedFrom']
): boolean {
  return (derivedFrom ?? field.derivedFrom) != null
}

export function readDerivedArrayLength(
  data: Record<string, unknown>,
  derivedFrom: AnimFieldDef['derivedFrom'] | undefined
): number | null {
  if (derivedFrom?.kind !== 'arrayLength') return null
  const raw = data[derivedFrom.key]
  return Array.isArray(raw) ? raw.length : null
}
