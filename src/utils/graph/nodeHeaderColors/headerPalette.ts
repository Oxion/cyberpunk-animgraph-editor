/**
 * Shared header palette (category tones).
 */

/** Inputs / constants / variables — math blue. */
export const HEADER_INPUT = '#3c3c83'
/** Blends. */
export const HEADER_BLEND = '#2b652b'
/** Switches + transitions (disjoint views — shared tone). */
export const HEADER_SWITCH_TRANSITION = '#79461d'
/** Value converters (MathExpression, Damp, Clamp, …). */
export const HEADER_CONVERTER = '#203c3c'
/** Pose output / join. */
export const HEADER_OUTPUT = '#3e232a'
/** Conditional entry. */
export const HEADER_CONDITIONAL = '#412b51'
/** SM / states. */
export const HEADER_STATE = '#1d2546'
/** Constraints / one-pose. */
export const HEADER_CONSTRAINT = '#3c5a6e'
/** Clips / skanim. */
export const HEADER_ANIM = '#6b5a30'
/** Low-emphasis plumbing (joins, type converters). */
export const HEADER_MUTED = '#4a484c'
/** Signal / misc. */
export const HEADER_SIGNAL = '#5a4a2a'

/** Exact flat colors — no analogous packing for descendants. */
export const FLAT_HEADER_SEED_COLORS: ReadonlySet<string> = new Set([
  HEADER_INPUT,
  HEADER_CONVERTER,
  HEADER_MUTED,
  HEADER_BLEND,
  HEADER_SWITCH_TRANSITION,
])
