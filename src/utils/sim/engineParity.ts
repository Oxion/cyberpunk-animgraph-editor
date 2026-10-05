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

/** AnimNode_BlendMultiple::NORMALIZED_WEIGHT_THRESHOLD */
export const BLEND_MULTIPLE_NORMALIZED_WEIGHT_THRESHOLD = 0.001

export type BlendMultipleSelectResult = {
  firstIndex: number
  secondIndex: number
  alpha: number
  /** Weight after clamp / radial wrap */
  weight: number
}

/**
 * AnimNode_BlendMultiple::SelectInputsAndCalculateAlpha.
 * `sortedValues` must be ascending (sortedInputValues / sorted zip).
 */
export function selectBlendMultipleInputs(
  inputWeight: number,
  sortedValues: number[],
  minWeight: number,
  maxWeight: number,
  radialBlending: boolean
): BlendMultipleSelectResult {
  if (sortedValues.length === 0) {
    return { firstIndex: -1, secondIndex: -1, alpha: 0, weight: inputWeight }
  }
  if (sortedValues.length === 1) {
    return { firstIndex: 0, secondIndex: -1, alpha: 0, weight: inputWeight }
  }

  let minW = minWeight
  let maxW = maxWeight
  if (minW > maxW) {
    const tmp = minW
    minW = maxW
    maxW = tmp
  }

  const clampMin = Math.max(sortedValues[0]!, minW)
  const clampMax = Math.min(sortedValues[sortedValues.length - 1]!, maxW)
  let weight = inputWeight

  if (radialBlending) {
    const range = clampMax - clampMin
    if (range === 0) {
      weight = clampMin
    } else {
      let reminder = (weight - clampMin) % range
      if (reminder < 0) reminder += range
      weight = reminder + clampMin
    }
  } else {
    weight = Math.min(clampMax, Math.max(clampMin, weight))
  }

  let secondIndex = 0
  while (
    secondIndex + 1 < sortedValues.length &&
    sortedValues[secondIndex]! <= weight
  ) {
    secondIndex++
  }
  const firstIndex = secondIndex - 1
  if (firstIndex < 0) {
    return { firstIndex: 0, secondIndex: 1, alpha: 0, weight }
  }

  const valuesRange = sortedValues[secondIndex]! - sortedValues[firstIndex]!
  let normalizedWeight =
    valuesRange > 0
      ? (weight - sortedValues[firstIndex]!) / valuesRange
      : 1

  const thr = BLEND_MULTIPLE_NORMALIZED_WEIGHT_THRESHOLD
  let alpha: number
  if (normalizedWeight < thr) alpha = 0
  else if (normalizedWeight > 1 - thr) alpha = 1
  else alpha = Math.min(1, Math.max(0, (normalizedWeight - thr) / (1 - 2 * thr)))

  return { firstIndex, secondIndex, alpha, weight }
}

export function blendMultipleFirstInputActive(alpha: number): boolean {
  return alpha < 1
}

export function blendMultipleSecondInputActive(alpha: number): boolean {
  return alpha > 0
}

/**
 * Build ascending value list + parallel pose refs for BlendMultiple.
 * Prefer cooked `sortedInputValues` when length matches `inputNodes`.
 */
export function buildBlendMultipleSlots(
  inputValues: unknown,
  sortedInputValues: unknown,
  inputNodes: unknown[]
): { values: number[]; refs: unknown[] } {
  const nodes = Array.isArray(inputNodes) ? inputNodes : []
  const sorted = Array.isArray(sortedInputValues)
    ? sortedInputValues
        .map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v)))
        .filter((v) => Number.isFinite(v))
    : []
  if (sorted.length === nodes.length && sorted.length > 0) {
    return { values: sorted as number[], refs: nodes }
  }

  const rawValues = Array.isArray(inputValues) ? inputValues : []
  const pairs: Array<{ value: number; ref: unknown }> = []
  const n = Math.max(rawValues.length, nodes.length)
  for (let i = 0; i < n; i++) {
    const raw = rawValues[i]
    const value =
      typeof raw === 'number' && Number.isFinite(raw)
        ? raw
        : Number.isFinite(Number(raw))
          ? Number(raw)
          : i
    pairs.push({ value, ref: nodes[i] })
  }
  pairs.sort((a, b) => a.value - b.value)
  return {
    values: pairs.map((p) => p.value),
    refs: pairs.map((p) => p.ref),
  }
}
