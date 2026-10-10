/**
 * AUTO-GENERATED — do not edit.
 * Run: npm run gen:pin-endpoints
 */

export const PIN_ENDPOINT_TYPES = [
  'animAnimNode_Base',
  'animAnimNode_BoolValue',
  'animAnimNode_FloatValue',
  'animAnimNode_IntValue',
  'animAnimNode_QuaternionValue',
  'animAnimNode_TransformValue',
  'animAnimNode_VectorValue',
  'animAnimNodeSourceChannel_WeightedQuat',
  'animAnimNodeSourceChannel_WeightedVector',
  'animDangleConstraint_Simulation',
  'animIAnimStateTransitionCondition',
  'animIAnimStateTransitionInterpolator',
  'animIDyngConstraint',
] as const

export type PinEndpointType = (typeof PIN_ENDPOINT_TYPES)[number]

export const PIN_ENDPOINT_TYPE_SET: ReadonlySet<string> = new Set(PIN_ENDPOINT_TYPES)
