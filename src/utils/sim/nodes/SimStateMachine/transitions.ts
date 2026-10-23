import { AnimgraphNode } from "@/utils/graph/animgraphTypes"
import { readBool, readNumber, resolveHandle } from "../../simDataUtils"
import { AnimStateInterpolationType, TransitionCandidate } from "./types"
import { collectTimedConditions } from "./conditions"
import { SimConditionDyn } from "../../conditionDyn"
import { SimStateMachineRuntime } from "./runtime"

/** animNode_StateMachine — instant transition chain cap */
export const MAX_INSTANT_TRANSITION_SEQUENCE_LENGTH = 16

/** Engine animMath EasyInCubic. */
export function easyInCubic(t: number): number {
  return t * t * t
}

/** Engine EasyOutCubic. */
export function easyOutCubic(t: number): number {
  const u = t - 1
  return u * u * u + 1
}

/** Engine EasyInOutCubic. */
export function easyInOutCubic(t: number): number {
  const u = 2 * t - 2
  return t < 0.5 ? 4 * t * t * t : 0.5 * u * u * u + 1
}

export function readTransitionMeta(
  desc: AnimgraphNode
): Omit<TransitionCandidate, 'desc' | 'index' | 'isGlobal'> {
  const d = desc.Data ?? {}
  // Offline: static bool only (engine may override via animFeature / action DB).
  const canRequestInertialization = readBool(d.canRequestInertialization)
  const rawDuration = readNumber(d.duration, 0)
  return {
    priority: readNumber(d.priority, 0),
    isForcedToTrue: readBool(d.isForcedToTrue),
    targetStateIndex: readNumber(d.targetStateIndex, -1),
    duration: canRequestInertialization ? 0 : rawDuration,
    inertializationDuration: rawDuration,
    canRequestInertialization,
  }
}

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

export function resetTimedForState(
  handleIdToAnimgraphNodeMap: Map<string, AnimgraphNode>,
  conditionDyn: SimConditionDyn,
  transitionAnimgraphNodes: AnimgraphNode[],
  stateAnimgraphNode: AnimgraphNode | undefined,
): void {
  if (!stateAnimgraphNode) return

  const indices: number[] = stateAnimgraphNode.Data?.outTransitionIndices ?? []
  for (const index of indices) {
    const desc = transitionAnimgraphNodes[index]
    if (!desc) continue
    const conditionAnimgraphNode = resolveHandle(handleIdToAnimgraphNodeMap, desc.Data?.condition)
    for (const timed of collectTimedConditions(handleIdToAnimgraphNodeMap, conditionAnimgraphNode)) {
      const timeTo = readNumber(
        timed.Data?.timeToFireTransition ?? timed.Data?.timeTo ?? timed.Data?.time,
        0
      )
      conditionDyn.resetTimed(timed.HandleId, timeTo)
    }
  }
}

export function parseAnimStateInterpolationType(raw: unknown): AnimStateInterpolationType {
  const s = String(raw ?? 'Linear')
  if (s.includes('EaseInOut')) return 'EaseInOut'
  if (s.includes('EaseOut')) return 'EaseOut'
  if (s.includes('EaseIn')) return 'EaseIn'
  return 'Linear'
}

/** Remap linear transition progress via Blend interpolator curve. */
export function evaluateAnimStateInterpolation(
  progress: number,
  type: AnimStateInterpolationType
): number {
  const t = Math.min(1, Math.max(0, progress))
  switch (type) {
    case 'EaseIn':
      return easyInCubic(t)
    case 'EaseOut':
      return easyOutCubic(t)
    case 'EaseInOut':
      return easyInOutCubic(t)
    case 'Linear':
    default:
      return t
  }
}

export function readInterpolatorData(
  handleIdToAnimgraphNodeMap: Map<string, AnimgraphNode>,
  raw: unknown,
): Record<string, unknown> | null {
  const resolved = resolveHandle(handleIdToAnimgraphNodeMap, raw)
  if (resolved?.Data && typeof resolved.Data === 'object') {
    return resolved.Data as Record<string, unknown>
  }
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.Data && typeof o.Data === 'object') return o.Data as Record<string, unknown>
  if (typeof o.$type === 'string') return o
  return null
}

/**
 * Engine GetInterpolatorByIndex: firing transition.interpolator, else anyStateInterpolator.
 * Only Blend is ported — returns evaluated blend alpha for pose interpolate.
 */
export function evaluateSmTransitionBlendAlpha(
  handleIdToAnimgraphNodeMap: Map<string, AnimgraphNode>,
  sm: AnimgraphNode,
  runtime: SimStateMachineRuntime,
  linearProgress: number
): number {
  let interpRaw: unknown = null
  if (runtime.firingTransitionHandleId) {
    const desc = handleIdToAnimgraphNodeMap.get(runtime.firingTransitionHandleId)
    interpRaw = desc?.Data?.interpolator ?? null
  }

  if (interpRaw == null) {
    interpRaw = sm.Data?.anyStateInterpolator ?? null
  }

  const data = readInterpolatorData(handleIdToAnimgraphNodeMap, interpRaw)
  if (!data) return Math.min(1, Math.max(0, linearProgress))

  // Unknown interpolator types fall back to linear.
  const t = String(data.$type ?? '')
  if (t && !t.includes('Interpolator_Blend') && !t.includes('TransitionInterpolator_Blend')) {
    return Math.min(1, Math.max(0, linearProgress))
  }

  return evaluateAnimStateInterpolation(
    linearProgress,
    parseAnimStateInterpolationType(data.interpolationType)
  )
}