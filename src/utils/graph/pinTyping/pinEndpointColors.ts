/**
 * Pin endpoint type → UI socket/wire color (hex).
 * Keys must cover PIN_ENDPOINT_TYPES (tsc enforces after codegen).
 *
 * Each gathered endpoint gets its own color — do not collapse
 * WeightedQuat / Condition / Interpolator into FloatValue / Base channels.
 */

import type { PinEndpointType } from './pinEndpoints.generated'

/** Fallback when type has no endpoint ancestor in the map. */
export const PIN_COLOR_FALLBACK = '#7a8a7a'

/**
 * Regenerate endpoints, then assign any new keys here (tsc will fail until done).
 */
export const PIN_ENDPOINT_COLOR: { [K in PinEndpointType]: string } = {
  animAnimNode_Base: '#89b34a',
  animAnimNode_BoolValue: '#c45a8c',
  animAnimNode_FloatValue: '#a0a0a0',
  animAnimNode_IntValue: '#5a9fd4',
  animAnimNode_QuaternionValue: '#9b59b6',
  animAnimNode_TransformValue: '#c4a05a',
  animAnimNode_VectorValue: '#8a6bc4',
  // Pin-override / non-value endpoints — personal colors (exact accept types)
  animAnimNodeSourceChannel_WeightedQuat: '#e67e22',
  animAnimNodeSourceChannel_WeightedVector: '#1abc9c',
  animDangleConstraint_Simulation: '#e6b84d',
  animIAnimStateTransitionCondition: '#e74c3c',
  animIAnimStateTransitionInterpolator: '#3498db',
  animIDyngConstraint: '#a67c52',
}
