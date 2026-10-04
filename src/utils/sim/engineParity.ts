/**
 * Parity notes vs RED AnimGraph runtime in common/animation.
 *
 * Primary sources:
 * - animGraph.cpp — Update then Sample frame phases
 * - animNode_StateMachine.cpp — CheckTransitions / FireTransition / progress
 * - animStateTransition.h — CheckConditionContext, IAnimStateTransitionCondition
 * - animNode_Blend2.cpp — CalculateWeightFromInputValue
 * - animNode_BlendOverride.cpp — BlendByMaskDynamic OnUpdate / ACTIVATION_THRESHOLD
 *
 * Offline sim implements Update (+ numeric weights). Sample/pose is stubbed.
 */

/** animNode_StateMachine.cpp — instant transition chain cap */
export const MAX_INSTANT_TRANSITION_SEQUENCE_LENGTH = 16

/**
 * Winner among enabled candidates (CheckTransitions):
 * - empty best → take candidate
 * - if best is forced, keep best (forced beats ordinary)
 * - else if candidate is forced OR candidate.priority > best.priority → take candidate
 *
 * Mirrors:
 *   !best.forced && (cand.forced || best.priority < cand.priority)
 */
export function transitionHasHigherPriority(
  best: { priority: number; isForcedToTrue: boolean } | null,
  candidate: { priority: number; isForcedToTrue: boolean }
): boolean {
  if (!best) return true
  if (best.isForcedToTrue) return false
  return candidate.isForcedToTrue || best.priority < candidate.priority
}

/**
 * Blend2::CalculateWeightFromInputValue — normalize input into [0,1] via min/max.
 */
export function blend2WeightFromInput(
  inputValue: number,
  minInputValue: number,
  maxInputValue: number
): number {
  if (!(maxInputValue > minInputValue)) return 0
  const clamped = Math.min(maxInputValue, Math.max(minInputValue, inputValue))
  const range = Math.abs(maxInputValue - minInputValue)
  return range > 0 ? (clamped - minInputValue) / range : 0
}

/** Typical Blend2 active thresholds (weight near 0/1 skips one input). */
export function blend2FirstInputActive(weight: number): boolean {
  return weight < 1
}
export function blend2SecondInputActive(weight: number): boolean {
  return weight > 0
}

/** AnimNode_BlendByMaskDynamic::ACTIVATION_THRESHOLD */
export const BLEND_BY_MASK_DYNAMIC_ACTIVATION = 0.01

/**
 * OnUpdate: blend pose is updated only when weight is above threshold
 * and mask index is in range of `masks`.
 * Unconnected weight defaults to 0; unconnected mask defaults to -1.
 */
export function blendByMaskDynamicBlendActive(
  weight: number,
  maskIndex: number,
  masksCount: number
): boolean {
  return (
    weight > BLEND_BY_MASK_DYNAMIC_ACTIVATION &&
    maskIndex >= 0 &&
    maskIndex < masksCount
  )
}
