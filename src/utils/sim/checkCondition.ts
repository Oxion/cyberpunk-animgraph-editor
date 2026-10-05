import type { AnimgraphNode } from '../graph/animgraphTypes'
import {
  handleType,
  readBool,
  readCName,
  readNumber,
  readTagList,
  resolveHandle,
} from './simDataUtils'
import type { SimCompareFunc, SimConditionTruth } from './simTypes'
import type { SimConditionDyn } from './conditionDyn'
import type { ClipLibrary } from './clipLibrary'
import type { SimInputBoard } from './SimInputBoard'

function compareNumber(a: number, b: number, fn: SimCompareFunc): boolean {
  const eps = Number.EPSILON * 8
  switch (normalizeCompareFunc(fn)) {
    case 'equal':
      return Math.abs(a - b) <= eps
    case 'notequal':
      return Math.abs(a - b) > eps
    case 'less':
      return a < b
    case 'lessequal':
      return a <= b
    case 'greater':
      return a > b
    case 'greaterequal':
      return a >= b
    default:
      return Math.abs(a - b) <= eps
  }
}

/** Normalize AGCF_Equal / Equal / equal → canonical key. */
export function normalizeCompareFunc(fn: unknown): string {
  return String(fn ?? 'equal')
    .replace(/^AGCF_/i, '')
    .toLowerCase()
}

/** Optional runtime hooks beyond the input board (clip setup, condition dyn). */
export type CheckConditionCtx = {
  /**
   * HasAnimation: true/false when clip library present;
   * 'unknown' when no setup loaded (cannot answer).
   */
  hasAnimation?: (animationName: string) => boolean | 'unknown'
  /** Frame dt for Timed countdown (AnimStateTransitionCondition_Timed::Update). */
  dt?: number
  /**
   * Per-graph instance dyn for Timed / ModifiedFloat (engine AnimInstanceBuffer).
   * Owned by SimGraphRunner — not the shared input board.
   */
  conditionDyn?: SimConditionDyn
}

function edgePrevCurr(
  board: SimInputBoard,
  feature: string,
  prop: string
): { prev: number; curr: number } | 'unknown' {
  const curr = board.getFeature(feature, prop)
  if (curr === undefined) return 'unknown'
  // First sample: no edge (engine init prev=curr)
  const prev = board.getPrevFeature(feature, prop)
  return { prev: prev === undefined ? curr : prev, curr }
}

/**
 * Port of IAnimStateTransitionCondition::CheckCondition for known types.
 * Returns 'unknown' when required runtime data is missing (stub).
 */
export function checkCondition(
  condition: AnimgraphNode | null,
  board: SimInputBoard,
  handles: Map<string, AnimgraphNode>,
  ctx: CheckConditionCtx = {}
): SimConditionTruth {
  if (!condition) return false
  const t = handleType(condition)
  const data = condition.Data ?? {}

  switch (t) {
    case 'animAnimStateTransitionCondition_ExternalEvent': {
      const name = readCName(data.eventName)
      return name !== '' && board.externalEvents.has(name)
    }
    case 'animAnimStateTransitionCondition_AnimEvent': {
      const name = readCName(data.eventName)
      return name !== '' && board.hasAnimEvent(name)
    }
    case 'animAnimStateTransitionCondition_AnimEnd': {
      // Matches m_animEndEvents entry (sentinel or animLoopEventName) — not clip name
      const name = readCName(data.eventName)
      if (!name || name === 'None') return board.anyAnimEnd
      return board.animEndEvents.has(name)
    }
    case 'animAnimStateTransitionCondition_AnyAnimEnd':
      return board.anyAnimEnd || board.animEndEvents.size > 0

    case 'animAnimStateTransitionCondition_FloatFeature': {
      const feature = readCName(data.featureName)
      const prop = readCName(data.featurePropertyName)
      const cur = board.getFeature(feature, prop)
      if (cur === undefined) return 'unknown'
      return compareNumber(cur, readNumber(data.compareValue), data.compareFunc ?? 'equal')
    }
    case 'animAnimStateTransitionCondition_IntFeature': {
      const feature = readCName(data.featureName)
      const prop = readCName(data.featurePropertyName)
      const cur = board.getFeature(feature, prop)
      if (cur === undefined) return 'unknown'
      return compareNumber(
        Math.round(cur),
        Math.round(readNumber(data.compareValue)),
        data.compareFunc ?? 'equal'
      )
    }
    case 'animAnimStateTransitionCondition_BoolFeature': {
      const feature = readCName(data.featureName)
      const prop = readCName(data.featurePropertyName)
      const cur = board.getBoolFeature(feature, prop)
      if (cur === undefined) return 'unknown'
      const compare =
        data.compareValue === undefined ? true : readBool(data.compareValue)
      return cur === compare
    }

    case 'animAnimStateTransitionCondition_IntEdgeFeature': {
      const edge = edgePrevCurr(
        board,
        readCName(data.featureName),
        readCName(data.featurePropertyName)
      )
      if (edge === 'unknown') return 'unknown'
      return edge.prev !== edge.curr
    }
    case 'animAnimStateTransitionCondition_IntEdgeFromToFeature': {
      const edge = edgePrevCurr(
        board,
        readCName(data.featureName),
        readCName(data.featurePropertyName)
      )
      if (edge === 'unknown') return 'unknown'
      const from = Math.round(readNumber(data.fromValue, 0))
      const to = Math.round(readNumber(data.toValue, 0))
      return Math.round(edge.prev) === from && Math.round(edge.curr) === to
    }
    case 'animAnimStateTransitionCondition_IntEdgeToFeature': {
      const edge = edgePrevCurr(
        board,
        readCName(data.featureName),
        readCName(data.featurePropertyName)
      )
      if (edge === 'unknown') return 'unknown'
      const to = Math.round(readNumber(data.toValue, 0))
      return edge.prev !== edge.curr && Math.round(edge.curr) === to
    }
    case 'animAnimStateTransitionCondition_IntEdgeGreaterFromZeroFeature': {
      const edge = edgePrevCurr(
        board,
        readCName(data.featureName),
        readCName(data.featurePropertyName)
      )
      if (edge === 'unknown') return 'unknown'
      // Engine field typo: greaterThenValue
      const thr = Math.round(readNumber(data.greaterThenValue ?? data.greaterThanValue, 0))
      return Math.round(edge.prev) === 0 && Math.round(edge.curr) > thr
    }
    case 'animAnimStateTransitionCondition_BoolEdgeFeature': {
      const feature = readCName(data.featureName)
      const prop = readCName(data.featurePropertyName)
      const curr = board.getBoolFeature(feature, prop)
      if (curr === undefined) return 'unknown'
      const prev = board.getPrevBoolFeature(feature, prop)
      const prevB = prev === undefined ? curr : prev
      return prevB !== curr
    }

    case 'animAnimStateTransitionCondition_FloatVariable': {
      const name = readCName(data.variableName ?? data.eventName)
      const cur = board.floatVars.get(name)
      if (cur === undefined) return 'unknown'
      if (data.compareValue !== undefined) {
        return compareNumber(cur, readNumber(data.compareValue), data.compareFunc ?? 'equal')
      }
      return cur !== 0
    }
    case 'animAnimStateTransitionCondition_IntVariable': {
      // Engine: missing var → 0
      const name = readCName(data.variableName)
      const cur = board.intVars.has(name)
        ? Math.round(board.intVars.get(name)!)
        : 0
      return compareNumber(
        cur,
        Math.round(readNumber(data.compareValue, 0)),
        data.compareFunc ?? 'equal'
      )
    }
    case 'animAnimStateTransitionCondition_BoolVariable': {
      // Engine: missing var → false
      const name = readCName(data.variableName)
      const cur = board.boolVars.get(name) === true
      const compare =
        data.compareValue === undefined ? true : readBool(data.compareValue)
      return cur === compare
    }

    case 'animAnimStateTransitionCondition_Timed': {
      // Countdown i_timeLeftToFire; fire when < 0 (animStateTransition.cpp)
      if (!ctx.conditionDyn) return 'unknown'
      const id = condition.HandleId
      const timeTo = readNumber(
        data.timeToFireTransition ?? data.timeTo ?? data.time,
        0
      )
      return ctx.conditionDyn.tickTimed(id, timeTo, ctx.dt ?? 0)
    }
    case 'animAnimStateTransitionCondition_ModifiedFloatVariable': {
      if (!ctx.conditionDyn) return 'unknown'
      const name = readCName(data.variableName)
      return ctx.conditionDyn.tickModifiedFloat(
        condition.HandleId,
        name,
        readNumber(data.compareValue, 0),
        data.compareFunc ?? 'equal',
        board.floatVars
      )
    }
    case 'animAnimStateTransitionCondition_CompositeSimultaneous': {
      const list = data.conditions
      if (!Array.isArray(list) || list.length === 0) return true
      let sawUnknown = false
      for (const ref of list) {
        const child = resolveHandle(handles, ref)
        const r = checkCondition(child, board, handles, ctx)
        if (r === false) return false
        if (r === 'unknown') sawUnknown = true
      }
      return sawUnknown ? 'unknown' : true
    }
    case 'animAnimStateTransitionCondition_WrapperValue': {
      // animStateTransitionCondition_WrapperValue.cpp — FindVariableValue active bit
      const name = readCName(data.wrapperName)
      if (!name || name === 'None') return false
      const active = board.isWrapperActive(name)
      const checkIfSet =
        data.checkIfWrapperIsSet === undefined ? true : readBool(data.checkIfWrapperIsSet)
      return active === checkIfSet
    }
    case 'animAnimStateTransitionCondition_HasAnimation': {
      // Engine caches OnInit via AcquireAnimWrapperId(GameplayOnlyAnims).
      // Sim evaluates live so toggling wrappers updates truth interactively.
      const name = readCName(data.animationName)
      if (!name || name === 'None') return false
      if (!ctx.hasAnimation) return 'unknown'
      const r = ctx.hasAnimation(name)
      if (r === 'unknown') return 'unknown'
      return r
    }
    case 'animAnimStateTransitionCondition_FootPhaseEvent': {
      const phase =
        typeof data.footPhase === 'string'
          ? data.footPhase
          : readCName(data.footPhase)
      if (!phase || phase === 'None' || phase === 'NotConsidered') return false
      return board.hasFootPhase(phase)
    }
    default:
      // Locomotion / etc.
      if (readBool(data.isForcedToTrue)) return true
      return 'unknown'
  }
}

export function conditionPasses(
  condition: AnimgraphNode | null,
  board: SimInputBoard,
  handles: Map<string, AnimgraphNode>,
  isForcedToTrue: boolean,
  ctx: CheckConditionCtx = {}
): boolean {
  if (isForcedToTrue) return true
  const r = checkCondition(condition, board, handles, ctx)
  return r === true
}

/** Collect Timed condition nodes under a transition condition tree. */
export function collectTimedConditions(
  condition: AnimgraphNode | null,
  handles: Map<string, AnimgraphNode>,
  out: AnimgraphNode[] = []
): AnimgraphNode[] {
  if (!condition) return out
  const t = handleType(condition)
  if (t === 'animAnimStateTransitionCondition_Timed') {
    out.push(condition)
    return out
  }
  if (t === 'animAnimStateTransitionCondition_CompositeSimultaneous') {
    const list = condition.Data?.conditions
    if (Array.isArray(list)) {
      for (const ref of list) {
        collectTimedConditions(resolveHandle(handles, ref), handles, out)
      }
    }
  }
  return out
}

export type SwitchConditionCtx = {
  clipLibrary?: ClipLibrary | null
  isWrapperActive?: (name: string) => boolean
}

/**
 * IStaticCondition for AnimNode_StaticSwitch (evaluated once at Init).
 * Null condition → true (engine).
 */
export function checkStaticCondition(
  condition: AnimgraphNode | null,
  board: SimInputBoard,
  ctx: SwitchConditionCtx = {}
): boolean {
  if (!condition) return true
  const t = handleType(condition) ?? ''
  const data = condition.Data ?? {}

  if (
    t === 'animHasAnimationCondition' ||
    t.endsWith('HasAnimationCondition') ||
    (/HasAnimation/i.test(t) && !t.includes('Transition'))
  ) {
    const name = readCName(data.animationName)
    if (!name || name === 'None') return false
    const lib = ctx.clipLibrary
    if (!lib || lib.entryCount === 0) return false
    const isWrap = ctx.isWrapperActive ?? ((n) => board.isWrapperActive(n))
    return lib.hasAnimation(name, isWrap)
  }

  if (
    t === 'animComponentTagCondition' ||
    t === 'animVisualTagCondition' ||
    t === 'animRigTagCondition'
  ) {
    const tag =
      readCName(data.animTag) ||
      readCName(data.visualTag) ||
      readCName(data.tag)
    return board.hasEntityTag(tag)
  }

  // Unknown static condition → false (safe offline default)
  return false
}

/**
 * IRuntimeCondition for AnimNode_RuntimeSwitch (every Update).
 * Null condition → true (engine).
 */
export function checkRuntimeCondition(
  condition: AnimgraphNode | null,
  board: SimInputBoard,
  ctx: SwitchConditionCtx = {}
): boolean {
  if (!condition) return true
  const t = handleType(condition) ?? ''
  const data = condition.Data ?? {}

  if (
    t === 'animAnimsetVariableCondition' ||
    t.endsWith('AnimsetVariableCondition')
  ) {
    const name = readCName(data.variableToCompare)
    if (!name || name === 'None') return false
    const threshold = readNumber(data.valueToCompare, 0.5)
    const w = board.wrapperWeights.get(name)
    if (w === undefined) {
      const lower = name.toLowerCase()
      for (const [k, v] of board.wrapperWeights) {
        if (k.toLowerCase() === lower) return v >= threshold
      }
      return false
    }
    return w >= threshold
  }

  if (
    t === 'animAnimsetWithOverridesTagCondition' ||
    t.endsWith('AnimsetWithOverridesTagCondition')
  ) {
    const tags = readTagList(data.animsetTags)
    if (tags.length === 0) return false
    const lib = ctx.clipLibrary
    if (!lib || lib.entryCount === 0) return false
    const isWrap = ctx.isWrapperActive ?? ((n) => board.isWrapperActive(n))
    return lib.hasRuntimeTags(tags, isWrap)
  }

  return false
}
