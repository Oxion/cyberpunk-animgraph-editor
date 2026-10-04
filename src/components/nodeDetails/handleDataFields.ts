/**
 * Read/write helpers for animgraph handle.Data fields used by Node Details panels.
 * Preserves RED CName / bool-as-0|1 shapes when mutating in place.
 */

import type { AnimFieldDef } from '../../utils/animFieldSchema'
import type { FieldConstraint } from '../../utils/animNodes'
import {
  fieldTypeName,
  getAnimTypeFields,
  getEffectiveFieldConstraint,
  isArrayFieldType,
  isRefFieldType,
  isWrefFieldType,
  readDerivedArrayLength,
  resolveAnimFields,
  resolveAnimType,
  structWrefNodeTarget,
} from '../../utils/animFieldSchema'
import { NodeDefinitionRegistry } from '../../utils/NodeDefinition'
import { linkedDataTypeName } from '../../utils/graph/linkedAnimgraphData'
import { getFieldRole, getProjectionDef, type FieldRole } from '../../utils/projection'

export type PropertyFieldKind =
  | 'number'
  | 'bool'
  | 'string'
  | 'presence'
  | 'readonly'
  | 'stringList'
  | 'numberList'
  | 'enum'
  | 'mathExpressionSockets'
  | 'floatTrackInfoList'
  | 'sameLengthList'
  | 'cnameName'
  | 'resourcePath'
  | 'vector'
  | 'struct'
  | 'structList'
  | 'embed'
  | 'embedList'

export type PropertyFieldDef = {
  key: string
  label: string
  kind: PropertyFieldKind
  /** Override Data key when display key differs */
  dataKey?: string
  /** Slider track range (also accepted as legacy `min`/`max`). */
  sliderMin?: number
  sliderMax?: number
  /** @deprecated Prefer `sliderMin` — mapped to slider track. */
  min?: number
  /** @deprecated Prefer `sliderMax` — mapped to slider track. */
  max?: number
  /** Optional hard clamps for typed/arrow values (may exceed slider track). */
  valueMin?: number
  valueMax?: number
  step?: number
  decimals?: number
  /** Static text for readonly rows */
  text?: string
  /** Options for kind: 'enum' */
  options?: readonly string[]
  /** Zip group id for kind: 'sameLengthList' */
  groupId?: string
  /** Array field keys that share `groupId`. */
  groupFields?: readonly string[]
  /** `$type` of a `{ name: CName }` struct (animTransformIndex / animNamedTrackIndex). */
  structType?: string
  /**
   * Field is a diagram pin input (`projection` role `pin`).
   * Type changes are locked; HandleId / array remove must sync connections.
   */
  pinBound?: boolean
}

export function resolveDiagramHandleId(node: {
  id: string
  data?: { originalNodeId?: string }
  metadata?: Record<string, unknown>
}): string {
  return String(node.data?.originalNodeId ?? node.id)
}

export function shouldSkipTypedDataField(key: string): boolean {
  if (key === '$type' || key === 'id') return true
  if (/^vis[A-Z]/.test(key) || /^Vis[A-Z]/.test(key)) return true
  const lower = key.toLowerCase()
  if (lower.startsWith('debug') || lower.includes('debug')) return true
  return false
}

export function readCNameLike(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && '$value' in value) {
    const raw = (value as { $value: unknown }).$value
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
  }
  return null
}

export function readBool01(value: unknown): boolean {
  if (value === true || value === 1 || value === '1') return true
  if (value && typeof value === 'object' && '$value' in value) {
    const raw = (value as { $value: unknown }).$value
    if (raw === true || raw === 1 || raw === '1') return true
  }
  return false
}

export function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value)
  }
  if (value && typeof value === 'object' && '$value' in value) {
    return readNumber((value as { $value: unknown }).$value)
  }
  return null
}

export function readStringField(value: unknown): string {
  if (typeof value === 'string') return value
  const cname = readCNameLike(value)
  if (cname != null) return cname
  if (value == null) return ''
  return String(value)
}

export function hasAnimgraphPresence(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0 && value !== 'None'
  if (typeof value !== 'object') return true
  const obj = value as Record<string, unknown>
  if ('HandleId' in obj || 'HandleRefId' in obj) return true
  if ('node' in obj) return hasAnimgraphPresence(obj.node)
  if ('value' in obj) return hasAnimgraphPresence(obj.value)
  if ('$value' in obj) {
    const v = obj.$value
    return typeof v === 'string' ? v.length > 0 && v !== 'None' : v != null
  }
  return Object.keys(obj).length > 0
}

export function formatPresence(value: unknown): string {
  return hasAnimgraphPresence(value) ? 'set' : '—'
}

export function writeBool01(data: Record<string, unknown>, key: string, on: boolean): void {
  const prev = data[key]
  const next: 0 | 1 = on ? 1 : 0
  if (prev && typeof prev === 'object' && '$value' in prev) {
    ;(prev as { $value: unknown }).$value = next
    return
  }
  data[key] = next
}

export function writeNumber(data: Record<string, unknown>, key: string, value: number): void {
  const prev = data[key]
  if (prev && typeof prev === 'object' && '$value' in prev) {
    ;(prev as { $value: unknown }).$value = value
    return
  }
  data[key] = value
}

export function writeStringOrCName(
  data: Record<string, unknown>,
  key: string,
  text: string
): void {
  const prev = data[key]
  const trimmed = text.trim() || 'None'
  if (prev && typeof prev === 'object' && ('$value' in prev || '$type' in prev)) {
    const obj = prev as { $type?: string; $storage?: string; $value: unknown }
    if (!obj.$type) obj.$type = 'CName'
    if (!obj.$storage) obj.$storage = 'string'
    obj.$value = trimmed
    return
  }
  if (prev === undefined || (typeof prev === 'object' && prev && '$type' in prev)) {
    data[key] = { $type: 'CName', $storage: 'string', $value: trimmed }
    return
  }
  data[key] = trimmed === 'None' ? '' : trimmed
}

/** Write depot path keeping RED4 `ResourcePath` wrapper (`uint64/"0"` when empty). */
export function writeResourcePath(
  data: Record<string, unknown>,
  key: string,
  text: string
): void {
  const trimmed = text.trim()
  const empty = !trimmed || trimmed === '0' || trimmed === 'None'
  const next = empty
    ? { $type: 'ResourcePath', $storage: 'uint64', $value: '0' }
    : { $type: 'ResourcePath', $storage: 'string', $value: trimmed }
  const prev = data[key]
  if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
    const obj = prev as { $type?: string; $storage?: string; $value: unknown }
    obj.$type = 'ResourcePath'
    obj.$storage = next.$storage
    obj.$value = next.$value
    return
  }
  data[key] = next
}

export function readResourcePath(value: unknown): string {
  const raw = readStringField(value)
  if (!raw || raw === '0' || raw === 'None') return ''
  return raw
}

export function writePlainString(
  data: Record<string, unknown>,
  key: string,
  text: string
): void {
  data[key] = text
}

export function inferNumberControl(
  key: string,
  _value: number = 0
): Pick<PropertyFieldDef, 'sliderMin' | 'sliderMax' | 'step' | 'decimals'> {
  const lower = key.toLowerCase()
  // Stable track ranges only — never derive max from live value (causes drag feedback loops).
  if (
    lower.includes('priority') ||
    lower.includes('index') ||
    lower.includes('count') ||
    lower.includes('num') ||
    lower.includes('quality') ||
    lower.includes('category')
  ) {
    return { sliderMin: 0, sliderMax: 255, step: 1, decimals: 0 }
  }
  if (lower.includes('duration') || lower.includes('time') || lower.includes('blend')) {
    return { sliderMin: 0, sliderMax: 10, step: 0.01, decimals: 3 }
  }
  if (lower.includes('speed') || lower.includes('rate') || lower.includes('weight')) {
    return { sliderMin: 0, sliderMax: 1, step: 0.01, decimals: 3 }
  }
  return { sliderMin: 0, sliderMax: 1, step: 0.01, decimals: 3 }
}

export function classifyTypedDataValue(
  key: string,
  value: unknown,
  inputNames: Set<string>
): PropertyFieldDef {
  const label = key
  if (inputNames.has(key)) {
    return { key, label, kind: 'presence' }
  }
  if (Array.isArray(value)) {
    return { key, label, kind: 'readonly', text: String(value.length) }
  }
  if (typeof value === 'boolean' || value === 0 || value === 1) {
    // Prefer bool for classic 0/1 flags; still allow number if key looks numeric
    if (
      typeof value === 'boolean' ||
      /^(is|can|has|use|enable|support|prevent|apply|timeWarping|collect)/i.test(key) ||
      key.toLowerCase().includes('enabled')
    ) {
      return { key, label, kind: 'bool' }
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { key, label, kind: 'number', ...inferNumberControl(key, value) }
  }
  if (typeof value === 'string') {
    return { key, label, kind: 'string' }
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('$value' in obj && !('HandleId' in obj) && !('HandleRefId' in obj) && !('node' in obj)) {
      const raw = obj.$value
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        return { key, label, kind: 'number', ...inferNumberControl(key, raw) }
      }
      if (raw === 0 || raw === 1 || typeof raw === 'boolean') {
        return { key, label, kind: 'bool' }
      }
      return { key, label, kind: 'string' }
    }
    return { key, label, kind: 'presence' }
  }
  return { key, label, kind: 'readonly', text: value == null ? '—' : String(value) }
}

/** `animTransformIndex` / `animNamedTrackIndex`: one CName `name`. */
export function isCNameNameStruct(typeName: string): boolean {
  const fields = getAnimTypeFields(typeName)
  return fields.length === 1 && fields[0].key === 'name' && fields[0].type === 'cname'
}

/**
 * Map animgraph field schema → details UI control.
 * Presentation-only: does not live on NodeDefinition.
 */
export function animFieldToDetailsControl(
  field: AnimFieldDef,
  value: unknown,
  data: Record<string, unknown>,
  editor?: Pick<FieldConstraint, 'range' | 'derivedFrom'>
): PropertyFieldDef {
  const label = field.key
  const derivedFrom = editor?.derivedFrom ?? field.derivedFrom

  if (derivedFrom) {
    const len = readDerivedArrayLength(data, derivedFrom)
    const text =
      len != null
        ? String(len)
        : typeof value === 'number'
          ? String(value)
          : value == null
            ? '—'
            : String(value)
    return { key: field.key, label, kind: 'readonly', text }
  }

  if (isArrayFieldType(field.type)) {
    const elemName = fieldTypeName(field.type.array)
    const elem = resolveAnimType(elemName)
    if (elemName === 'animFloatTrackInfo') {
      return { key: field.key, label, kind: 'floatTrackInfoList' }
    }
    if (elem?.kind === 'cname' || elem?.kind === 'string') {
      return { key: field.key, label, kind: 'stringList' }
    }
    if (elem?.kind === 'int') {
      return { key: field.key, label, kind: 'numberList' }
    }
    if (
      isRefFieldType(field.type.array) ||
      isWrefFieldType(field.type.array) ||
      structWrefNodeTarget(elemName)
    ) {
      return { key: field.key, label, kind: 'embedList', structType: elemName }
    }
    if (
      elem?.kind === 'class' ||
      elem?.kind === 'struct' ||
      elem?.kind === 'float' ||
      elem?.kind === 'bool01' ||
      elem?.kind === 'enum'
    ) {
      return { key: field.key, label, kind: 'structList', structType: elemName }
    }
    return {
      key: field.key,
      label,
      kind: 'readonly',
      text: Array.isArray(value) ? String(value.length) : '—',
    }
  }

  if (isRefFieldType(field.type) || isWrefFieldType(field.type)) {
    return { key: field.key, label, kind: 'presence' }
  }

  if (typeof field.type !== 'string') {
    return { key: field.key, label, kind: 'readonly', text: value == null ? '—' : String(value) }
  }

  const typeName = field.type
  if (typeName === 'animMathExpressionNodeData') {
    return { key: field.key, label, kind: 'mathExpressionSockets' }
  }
  if (typeName === 'Vector3' || typeName === 'Vector4' || typeName === 'Quaternion') {
    return { key: field.key, label, kind: 'vector', structType: typeName }
  }
  if (typeName === 'QsTransform') {
    return { key: field.key, label, kind: 'struct', structType: typeName }
  }

  const resolved = resolveAnimType(typeName)
  const kind = resolved?.kind ?? 'unknown'

  switch (kind) {
    case 'bool01':
      return { key: field.key, label, kind: 'bool' }
    case 'cname':
    case 'string':
      return { key: field.key, label, kind: 'string' }
    case 'resourcePath':
      return { key: field.key, label, kind: 'resourcePath' }
    case 'enum':
      return {
        key: field.key,
        label,
        kind: 'enum',
        options: resolved && resolved.kind === 'enum' ? resolved.values : [],
      }
    case 'struct':
      if (isCNameNameStruct(typeName)) {
        return { key: field.key, label, kind: 'cnameName', structType: typeName }
      }
      if (structWrefNodeTarget(typeName)) {
        return { key: field.key, label, kind: 'presence' }
      }
      return { key: field.key, label, kind: 'struct', structType: typeName }
    case 'object':
    case 'class':
      return { key: field.key, label, kind: 'presence' }
    case 'int':
    case 'float': {
      const inferred = inferNumberControl(field.key)
      const isInt = kind === 'int'
      const c = getEffectiveFieldConstraint(field, editor?.range)
      return {
        key: field.key,
        label,
        kind: 'number',
        sliderMin: c.min ?? inferred.sliderMin,
        sliderMax: c.max ?? inferred.sliderMax ?? (isInt ? 255 : 1),
        step: c.step ?? inferred.step ?? (isInt ? 1 : 0.01),
        decimals: isInt || c.integer ? 0 : (inferred.decimals ?? 3),
        valueMin: c.min,
        valueMax: c.max,
      }
    }
    default:
      return {
        key: field.key,
        label,
        kind: 'readonly',
        text: value == null ? '—' : String(value),
      }
  }
}

export type GatherTypedDataDetailsOptions = {
  /** Skip fields whose projection role is in this list (e.g. SM `contain` groups). */
  skipRoles?: readonly FieldRole[]
}

/**
 * Schema-driven Node Details fields (TypedData path).
 * `extra` replaces same keys in place, then appends keys not in the schema list.
 */
export function gatherTypedDataDetailsFields(
  data: Record<string, unknown>,
  diagramNodeType: string,
  extra: readonly PropertyFieldDef[] = [],
  options?: GatherTypedDataDetailsOptions
): PropertyFieldDef[] {
  const typeName = linkedDataTypeName(data, diagramNodeType)
  const fieldConstraints =
    NodeDefinitionRegistry.getNodeDefinition(typeName)?.fieldConstraints ?? {}
  const animFields = resolveAnimFields(typeName)
  const groups = NodeDefinitionRegistry.getSameLengthGroups(typeName)
  const fieldToGroup = new Map<string, string>()
  for (const [groupId, keys] of groups) {
    for (const key of keys) fieldToGroup.set(key, groupId)
  }
  const emittedGroups = new Set<string>()
  const out: PropertyFieldDef[] = []
  const projection = getProjectionDef(typeName)
  const skipRoles = options?.skipRoles ? new Set(options.skipRoles) : null
  for (const field of animFields) {
    const role = getFieldRole(field, projection)
    if (role === 'hide') continue
    if (role && skipRoles?.has(role)) continue
    if (role === 'embed') {
      if (isArrayFieldType(field.type)) {
        const inner = field.type.array
        const target = isRefFieldType(inner) ? inner.ref : fieldTypeName(inner)
        out.push({
          key: field.key,
          label: field.key,
          kind: 'embedList',
          structType: target,
        })
        continue
      }
      const target = isRefFieldType(field.type)
        ? field.type.ref
        : fieldTypeName(field.type)
      out.push({
        key: field.key,
        label: field.key,
        kind: 'embed',
        structType: target,
      })
      continue
    }
    const groupId = fieldToGroup.get(field.key)
    if (groupId) {
      const leader = groups.get(groupId)?.[0]
      if (field.key !== leader) continue
      if (emittedGroups.has(groupId)) continue
      emittedGroups.add(groupId)
      out.push({
        key: `__sameLength:${groupId}`,
        label: groupId,
        kind: 'sameLengthList',
        groupId,
        groupFields: groups.get(groupId) ?? [],
      })
      continue
    }
    const control = animFieldToDetailsControl(
      field,
      data[field.key],
      data,
      fieldConstraints[field.key]
    )
    if (role === 'pin') {
      out.push({ ...control, pinBound: true })
      continue
    }
    out.push(control)
  }

  if (extra.length === 0) return out
  const extraByKey = new Map(extra.map((field) => [field.key, field]))
  const seen = new Set<string>()
  const merged: PropertyFieldDef[] = []
  for (const field of out) {
    merged.push(extraByKey.get(field.key) ?? field)
    seen.add(field.key)
  }
  for (const field of extra) {
    if (!seen.has(field.key)) merged.push(field)
  }
  return merged
}

export const TRANSITION_PROPERTY_FIELDS: PropertyFieldDef[] = [
  { key: 'animFeatureName', label: 'animFeature', kind: 'string' },
  { key: 'canRequestInertialization', label: 'canRequestInertialization', kind: 'bool' },
  { key: 'condition', label: 'condition', kind: 'presence' },
  {
    key: 'duration',
    label: 'duration',
    kind: 'number',
    sliderMin: 0,
    sliderMax: 10,
    step: 0.01,
    decimals: 3,
  },
  { key: 'interpolator', label: 'interpolator', kind: 'presence' },
  { key: 'isEnabled', label: 'isEnabled', kind: 'bool' },
  { key: 'isForcedToTrue', label: 'isForcedToTrue', kind: 'bool' },
  { key: 'isOutTransitionFromAction', label: 'isOutTransitionFromAction', kind: 'bool' },
  {
    key: 'priority',
    label: 'priority',
    kind: 'number',
    sliderMin: 0,
    sliderMax: 255,
    step: 1,
    decimals: 0,
  },
  { key: 'supportBlendFromPose', label: 'supportBlendFromPose', kind: 'bool' },
  {
    key: 'targetStateIndex',
    label: 'targetStateIndex',
    kind: 'number',
    sliderMin: 0,
    sliderMax: 255,
    step: 1,
    decimals: 0,
  },
]

export const CONDITIONAL_ENTRY_PROPERTY_FIELDS: PropertyFieldDef[] = [
  { key: 'condition', label: 'condition', kind: 'presence' },
  { key: 'isEnabled', label: 'isEnabled', kind: 'bool' },
  { key: 'isForcedToTrue', label: 'isForcedToTrue', kind: 'bool' },
  {
    key: 'priority',
    label: 'priority',
    kind: 'number',
    sliderMin: 0,
    sliderMax: 255,
    step: 1,
    decimals: 0,
  },
  {
    key: 'targetStateIndex',
    label: 'targetStateIndex',
    kind: 'number',
    sliderMin: 0,
    sliderMax: 255,
    step: 1,
    decimals: 0,
  },
]
