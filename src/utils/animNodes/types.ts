import type { AnimFieldDerived, AnimFieldRange } from '../animTypes'

/**
 * Per-field catalog rules on a type that already exists in the types layer.
 * Graph invariants (contain slots) and inspector editor overlays (slider, derivedFrom).
 */
export type FieldConstraint = {
  allowedTypes?: readonly string[]
  uniqueTypes?: readonly string[]
  requireTypes?: readonly string[]
  order?: 'output-first'
  /**
   * Group id. Array fields that share the same id must have equal length.
   * Not a field name — just a label for the zip group.
   */
  sameLength?: string
  /**
   * System accept limits (hard clamp). Narrows AnimFieldDef.range / type constraint.
   * Not the UI slider track — use `slider` for that.
   */
  range?: AnimFieldRange
  /** UI slider track only — typed values may exceed this. */
  slider?: AnimFieldRange
  /** Read-only field derived from another Data key (e.g. numInputs ← inputNodes.length). */
  derivedFrom?: AnimFieldDerived
}

export type AllowedParent = {
  parentType: string
  field: string
}
