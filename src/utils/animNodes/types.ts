import type { AnimFieldDerived, AnimFieldRange } from '../animTypes'

/**
 * Per-field catalog rules on a type that already exists in the types layer.
 * Graph invariants (contain slots) and inspector editor overlays (range, derivedFrom).
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
  /** Inspector numeric limits (narrows primitive type constraint). */
  range?: AnimFieldRange
  /** Read-only field derived from another Data key (e.g. numInputs ← inputNodes.length). */
  derivedFrom?: AnimFieldDerived
}

export type AllowedParent = {
  parentType: string
  field: string
}
