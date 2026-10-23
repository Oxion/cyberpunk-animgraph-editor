import { AnimgraphNode } from "@/utils/graph/animgraphTypes";
import { handleType, readBool, readCName, readNumber, resolveHandle } from "../../simDataUtils";
import { WalkCtx } from "../../SimGraphRunner.types";
import { SimInputBoard } from "../../SimInputBoard";
import { SimConditionTruth } from "../../simTypes";
import { compareNumber } from "../../simUtils";

function edgePrevCurr(
  board: SimInputBoard,
  feature: string,
  prop: string
): { prev: number; curr: number } {
  // Engine IntInput slots are 0 until ApplyFeature; missing board → 0/0 (no edge).
  const curr = board.getFeature(feature, prop) ?? 0
  const prev = board.getPrevFeature(feature, prop)
  return { prev: prev === undefined ? curr : prev, curr }
}

/** Collect Timed condition nodes under a transition condition tree. */
export function collectTimedConditions(
  handleIdToAnimgraphNodeMap: Map<string, AnimgraphNode>,
  conditionAnimgraphNodes: AnimgraphNode | null,
  out: AnimgraphNode[] = []
): AnimgraphNode[] {
  if (!conditionAnimgraphNodes) return out
  const t = handleType(conditionAnimgraphNodes)
  if (t === 'animAnimStateTransitionCondition_Timed') {
    out.push(conditionAnimgraphNodes)
    return out
  }
  if (t === 'animAnimStateTransitionCondition_CompositeSimultaneous') {
    const list = conditionAnimgraphNodes.Data?.conditions
    if (Array.isArray(list)) {
      for (const ref of list) {
        collectTimedConditions(
          handleIdToAnimgraphNodeMap,
          resolveHandle(handleIdToAnimgraphNodeMap, ref),
          out,
        )
      }
    }
  }
  return out
}

/**
 * Port of IAnimStateTransitionCondition::CheckCondition for known types.
 * Returns 'unknown' when required runtime data is missing (stub).
 */
export function checkCondition(
  ctx: WalkCtx,
  conditionAnimgraphNode: AnimgraphNode | null,
): SimConditionTruth {
  if (!conditionAnimgraphNode) return false

  const { handles, board, conditionDyn, hasAnimation } = ctx

  const data = conditionAnimgraphNode.Data ?? {}

  switch (handleType(conditionAnimgraphNode)) {
    case 'animAnimStateTransitionCondition_ExternalEvent': {
      const name = readCName(data.eventName)
      if (conditionAnimgraphNode.HandleId === "1664") {
        console.log(ctx.poseGen, 'Condition 1664', name, board.externalEvents.has(name))
      }
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
      // Engine FloatInput defaults to 0 until ApplyFeature.
      const feature = readCName(data.featureName)
      const prop = readCName(data.featurePropertyName)
      const cur = board.getFeature(feature, prop) ?? 0
      if (conditionAnimgraphNode.HandleId === "1929") {
        console.log(ctx.poseGen, 'Condition 1929', feature, prop, cur, board.externalEvents.has("DoubleJump"))
      }
      return compareNumber(cur, readNumber(data.compareValue), data.compareFunc ?? 'equal')
    }
    case 'animAnimStateTransitionCondition_IntFeature': {
      // Engine IntInput defaults to 0 until ApplyFeature.
      const feature = readCName(data.featureName)
      const prop = readCName(data.featurePropertyName)
      const cur = board.getFeature(feature, prop) ?? 0
      return compareNumber(
        Math.round(cur),
        Math.round(readNumber(data.compareValue)),
        data.compareFunc ?? 'equal'
      )
    }
    case 'animAnimStateTransitionCondition_BoolFeature': {
      // Engine BoolInput defaults to false until ApplyFeature.
      const feature = readCName(data.featureName)
      const prop = readCName(data.featurePropertyName)
      const cur = board.getBoolFeature(feature, prop) ?? false
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
      return edge.prev !== edge.curr
    }
    case 'animAnimStateTransitionCondition_IntEdgeFromToFeature': {
      const edge = edgePrevCurr(
        board,
        readCName(data.featureName),
        readCName(data.featurePropertyName)
      )
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
      const to = Math.round(readNumber(data.toValue, 0))
      return edge.prev !== edge.curr && Math.round(edge.curr) === to
    }
    case 'animAnimStateTransitionCondition_IntEdgeGreaterFromZeroFeature': {
      const edge = edgePrevCurr(
        board,
        readCName(data.featureName),
        readCName(data.featurePropertyName)
      )
      // Engine field typo: greaterThenValue
      const thr = Math.round(readNumber(data.greaterThenValue ?? data.greaterThanValue, 0))
      return Math.round(edge.prev) === 0 && Math.round(edge.curr) > thr
    }
    case 'animAnimStateTransitionCondition_BoolEdgeFeature': {
      // Engine BoolInput defaults to false; missing → false/false (no edge).
      const feature = readCName(data.featureName)
      const prop = readCName(data.featurePropertyName)
      const curr = board.getBoolFeature(feature, prop) ?? false
      const prev = board.getPrevBoolFeature(feature, prop)
      const prevB = prev === undefined ? curr : prev
      return prevB !== curr
    }

    case 'animAnimStateTransitionCondition_FloatVariable': {
      // Engine Update: missing FindFloatVariable → i_targetValue = 0, then compare.
      const name = readCName(data.variableName ?? data.eventName)
      const cur = board.floatVars.has(name) ? (board.floatVars.get(name) ?? 0) : 0
      return compareNumber(
        cur,
        readNumber(data.compareValue, 0),
        data.compareFunc ?? 'equal'
      )
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
      // Countdown i_timeLeftToFire; fire when < 0 (animStateTransition)
      const id = conditionAnimgraphNode.HandleId
      const timeTo = readNumber(
        data.timeToFireTransition ?? data.timeTo ?? data.time,
        0
      )
      return conditionDyn.tickTimed(id, timeTo, ctx.dt ?? 0)
    }
    case 'animAnimStateTransitionCondition_ModifiedFloatVariable': {
      const name = readCName(data.variableName)
      return conditionDyn.tickModifiedFloat(
        conditionAnimgraphNode.HandleId,
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
        const childAnimgraphNode = resolveHandle(handles, ref)
        const r = checkCondition(ctx, childAnimgraphNode)
        if (r === false) return false
        if (r === 'unknown') sawUnknown = true
      }
      return sawUnknown ? 'unknown' : true
    }
    case 'animAnimStateTransitionCondition_WrapperValue': {
      // animStateTransitionCondition_WrapperValue — FindVariableValue active bit
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
      return hasAnimation(name)
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

/**
 * Mark condition tree for HUD (CompositeSimultaneous children included).
 * Evaluates each leaf once — mirrors Composite AND without a second checkCondition pass.
 */
export function updateConditionTree(
  ctx: WalkCtx,
  conditionAnimgraphNode: AnimgraphNode | null,
): SimConditionTruth {
  if (!conditionAnimgraphNode) return false

  const { handles, nodes } = ctx

  if (handleType(conditionAnimgraphNode) === 'animAnimStateTransitionCondition_CompositeSimultaneous') {
    const childRefs = conditionAnimgraphNode.Data?.conditions
    if (!Array.isArray(childRefs) || childRefs.length === 0) {
      nodes[conditionAnimgraphNode.HandleId] = { active: true, conditionTruth: true }
      return true
    }

    let sawUnknown = false
    let allPass = true
    for (const ref of childRefs) {
      const childAnimgraphNode = resolveHandle(handles, ref)
      const r = updateConditionTree(ctx, childAnimgraphNode)
      if (r === false) allPass = false
      if (r === 'unknown') sawUnknown = true
    }

    const truth: SimConditionTruth = !allPass ? false : sawUnknown ? 'unknown' : true
    nodes[conditionAnimgraphNode.HandleId] = { active: true, conditionTruth: truth }
    return truth
  }

  const truth = checkCondition(ctx, conditionAnimgraphNode)
  nodes[conditionAnimgraphNode.HandleId] = { active: true, conditionTruth: truth }
  return truth
}

/**
 * Overlay: condition T/F on the condition tree and owning transition/entry.
 * @returns effective owner truth (forced → true); use instead of a second checkCondition.
 */
export function updateSmCondition(
  ctx: WalkCtx,
  ownerHandleId: string,
  conditionAnimgraphNode: AnimgraphNode | null,
  isForcedToTrue: boolean
): SimConditionTruth {
  const truth: SimConditionTruth = conditionAnimgraphNode
    ? updateConditionTree(ctx, conditionAnimgraphNode)
    : isForcedToTrue
      ? true
      : false

  // Forced transitions pass regardless — owner badge shows effective pass.
  const ownerTruth: SimConditionTruth = isForcedToTrue ? true : truth
  ctx.nodes[ownerHandleId] = {
    ...(ctx.nodes[ownerHandleId] ?? { active: false }),
    active: true,
    conditionTruth: ownerTruth,
  }
  return ownerTruth
}