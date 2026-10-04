/**
 * Numeric constraints: primitive type defaults + optional field.range overlay.
 */

import type { AnimFieldDef, AnimFieldRange, AnimTypeDef, NumericConstraint } from './types'
import { fieldTypeName } from './fieldType'
import { resolveAnimType } from './registry'

function isNumericPrimitiveKind(
  kind: AnimTypeDef['kind']
): kind is 'bool01' | 'int' | 'float' {
  return kind === 'bool01' || kind === 'int' || kind === 'float'
}

/** Default constraint implied by primitive kind (bool01 reuses int 0..1). */
export function getDefaultTypeConstraint(kind: AnimTypeDef['kind']): NumericConstraint {
  switch (kind) {
    case 'bool01':
      return { integer: true, min: 0, max: 1 }
    case 'int':
      return { integer: true }
    case 'float':
      return { finite: true }
    default:
      return {}
  }
}

/** Type-level constraint: kind defaults merged with optional def.constraint override. */
export function getTypeConstraint(typeName: string): NumericConstraint {
  const def = resolveAnimType(typeName)
  if (!def || !isNumericPrimitiveKind(def.kind)) return {}
  const base = getDefaultTypeConstraint(def.kind)
  const override = 'constraint' in def ? def.constraint : undefined
  return mergeNumericConstraints(base, override)
}

/** Field range narrows type constraint; field cannot widen beyond type. */
export function mergeNumericConstraints(
  base: NumericConstraint,
  overlay?: AnimFieldRange | NumericConstraint | null
): NumericConstraint {
  if (!overlay) return { ...base }
  const out: NumericConstraint = { ...base }
  if (overlay.min != null) {
    out.min = base.min != null ? Math.max(base.min, overlay.min) : overlay.min
  }
  if (overlay.max != null) {
    out.max = base.max != null ? Math.min(base.max, overlay.max) : overlay.max
  }
  if (overlay.step != null) out.step = overlay.step
  return out
}

export function getEffectiveFieldConstraint(
  field: AnimFieldDef,
  editorRange?: AnimFieldDef['range']
): NumericConstraint {
  const typeName = fieldTypeName(field.type)
  return mergeNumericConstraints(
    mergeNumericConstraints(getTypeConstraint(typeName), field.range),
    editorRange
  )
}

/** Clamp/normalize a numeric write against effective field constraint. */
export function clampNumericFieldValue(
  field: AnimFieldDef,
  raw: number
): number {
  const c = getEffectiveFieldConstraint(field)
  let v = raw
  if (c.finite && !Number.isFinite(v)) v = 0
  if (c.integer) v = Math.round(v)
  if (c.min != null && v < c.min) v = c.min
  if (c.max != null && v > c.max) v = c.max
  return v
}
