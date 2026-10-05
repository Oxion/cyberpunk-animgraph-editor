import type { AnimgraphNode } from '../graph/animgraphTypes'
import {
  MAX_INSTANT_TRANSITION_SEQUENCE_LENGTH,
  transitionHasHigherPriority,
} from './engineParity'
import { checkCondition, conditionPasses, collectTimedConditions, type CheckConditionCtx } from './checkCondition'
import {
  handleType,
  readBool,
  readCName,
  readCNameList,
  readNumber,
  resolveHandle,
} from './simDataUtils'
import type { SimInputBoard } from './SimInputBoard'
import type { SimConditionDyn } from './conditionDyn'
import type { SimConditionTruth, SimNodeState, SimSmState } from './simTypes'

function listHandles(
  handles: Map<string, AnimgraphNode>,
  arr: unknown
): AnimgraphNode[] {
  if (!Array.isArray(arr)) return []
  return arr
    .map((ref) => resolveHandle(handles, ref))
    .filter((h): h is AnimgraphNode => !!h)
}

/** Overlay: condition T/F on the condition handle and its owning transition/entry handle. */
function recordConditionOverlay(
  nodeTruth: Record<string, SimNodeState>,
  ownerHandleId: string,
  cond: AnimgraphNode | null,
  board: SimInputBoard,
  handles: Map<string, AnimgraphNode>,
  ctx: CheckConditionCtx,
  isForcedToTrue: boolean
): void {
  const truth: SimConditionTruth = cond
    ? checkCondition(cond, board, handles, ctx)
    : isForcedToTrue
      ? true
      : false
  if (cond) {
    nodeTruth[cond.HandleId] = { active: true, conditionTruth: truth }
  }
  // Forced transitions pass regardless — owner badge shows effective pass.
  const ownerTruth: SimConditionTruth = isForcedToTrue ? true : truth
  nodeTruth[ownerHandleId] = {
    ...(nodeTruth[ownerHandleId] ?? { active: false }),
    active: true,
    conditionTruth: ownerTruth,
  }
}

export class SimStateMachineRuntime {
  readonly smHandleId: string
  activeStateIndex = 0
  isInTransition = false
  transitionProgress = 0
  transitionDuration = 0
  firingTransitionIndex: number | null = null
  firingTransitionHandleId: string | null = null
  targetStateIndex: number | null = null
  lastFiredTransitionId: string | null = null
  eligibleTransitionIds: string[] = []
  instantChainLength = 0
  checkEntryConditions = true
  /** State index whose Timed conditions were last reset (enter). */
  timedArmedStateIndex: number | null = null

  constructor(smHandleId: string, defaultStateIndex: number) {
    this.smHandleId = smHandleId
    this.activeStateIndex = defaultStateIndex
  }

  reset(defaultStateIndex: number): void {
    this.activeStateIndex = defaultStateIndex
    this.isInTransition = false
    this.transitionProgress = 0
    this.transitionDuration = 0
    this.firingTransitionIndex = null
    this.firingTransitionHandleId = null
    this.targetStateIndex = null
    this.lastFiredTransitionId = null
    this.eligibleTransitionIds = []
    this.instantChainLength = 0
    this.checkEntryConditions = true
    this.timedArmedStateIndex = null
  }

  toState(): SimSmState {
    return {
      smHandleId: this.smHandleId,
      activeStateIndex: this.activeStateIndex,
      isInTransition: this.isInTransition,
      transitionProgress: this.transitionProgress,
      transitionDuration: this.transitionDuration,
      firingTransitionIndex: this.firingTransitionIndex,
      firingTransitionHandleId: this.firingTransitionHandleId,
      targetStateIndex: this.targetStateIndex,
      eligibleTransitionIds: [...this.eligibleTransitionIds],
      lastFiredTransitionId: this.lastFiredTransitionId,
      instantChainLength: this.instantChainLength,
      checkEntryConditions: this.checkEntryConditions,
    }
  }
}

type TransitionCandidate = {
  desc: AnimgraphNode
  index: number
  priority: number
  isForcedToTrue: boolean
  isGlobal: boolean
  targetStateIndex: number
  duration: number
}

function readTransitionMeta(
  desc: AnimgraphNode
): Omit<TransitionCandidate, 'desc' | 'index' | 'isGlobal'> {
  const d = desc.Data ?? {}
  return {
    priority: readNumber(d.priority, 0),
    isForcedToTrue: readBool(d.isForcedToTrue),
    targetStateIndex: readNumber(d.targetStateIndex, -1),
    duration: readNumber(d.duration, 0),
  }
}

function resetTimedForState(
  state: AnimgraphNode | undefined,
  transitions: AnimgraphNode[],
  handles: Map<string, AnimgraphNode>,
  conditionDyn: SimConditionDyn | undefined
): void {
  if (!state || !conditionDyn) return
  const indices: number[] = state.Data?.outTransitionIndices ?? []
  for (const index of indices) {
    const desc = transitions[index]
    if (!desc) continue
    const cond = resolveHandle(handles, desc.Data?.condition)
    for (const timed of collectTimedConditions(cond, handles)) {
      const timeTo = readNumber(
        timed.Data?.timeToFireTransition ?? timed.Data?.timeTo ?? timed.Data?.time,
        0
      )
      conditionDyn.resetTimed(timed.HandleId, timeTo)
    }
  }
}

/**
 * Offline SM update mirroring AnimNode_StateMachine transition logic.
 */
export function updateStateMachine(
  sm: AnimgraphNode,
  runtime: SimStateMachineRuntime,
  dt: number,
  board: SimInputBoard,
  handles: Map<string, AnimgraphNode>,
  nodeTruth: Record<string, SimNodeState>,
  condCtx: CheckConditionCtx = {}
): void {
  const data = sm.Data ?? {}
  const transitions = listHandles(handles, data.transitions)
  const globals = listHandles(handles, data.globalTransitions)
  const states = listHandles(handles, data.states)
  const entries = listHandles(handles, data.conditionalEntries)
  const ctx: CheckConditionCtx = { ...condCtx, dt }

  if (runtime.checkEntryConditions) {
    runtime.checkEntryConditions = false
    let bestEntry: AnimgraphNode | null = null
    let bestMeta: ReturnType<typeof readTransitionMeta> | null = null
    for (const entry of entries) {
      const d = entry.Data ?? {}
      const enabled = d.isEnabled === undefined ? true : readBool(d.isEnabled)
      if (!enabled) continue
      const meta = {
        priority: readNumber(d.priority, 0),
        isForcedToTrue: readBool(d.isForcedToTrue),
        targetStateIndex: readNumber(d.targetStateIndex, -1),
        duration: 0,
      }
      const cond = resolveHandle(handles, d.condition)
      recordConditionOverlay(
        nodeTruth,
        entry.HandleId,
        cond,
        board,
        handles,
        ctx,
        meta.isForcedToTrue
      )
      if (!conditionPasses(cond, board, handles, meta.isForcedToTrue, ctx)) continue
      if (
        transitionHasHigherPriority(
          bestMeta
            ? { priority: bestMeta.priority, isForcedToTrue: bestMeta.isForcedToTrue }
            : null,
          meta
        )
      ) {
        bestEntry = entry
        bestMeta = meta
      }
    }
    if (bestEntry && bestMeta && bestMeta.targetStateIndex >= 0) {
      runtime.activeStateIndex = bestMeta.targetStateIndex
      runtime.lastFiredTransitionId = bestEntry.HandleId
    } else {
      runtime.activeStateIndex = readNumber(data.defaultStateIndex, 0)
    }
    runtime.timedArmedStateIndex = null
  }

  runtime.instantChainLength = 0

  for (let chain = 0; chain < MAX_INSTANT_TRANSITION_SEQUENCE_LENGTH; chain++) {
    if (runtime.isInTransition) {
      if (runtime.transitionDuration <= 0) {
        runtime.transitionProgress = 1
      } else {
        runtime.transitionProgress = Math.min(
          1,
          runtime.transitionProgress + dt / runtime.transitionDuration
        )
      }
      if (runtime.transitionProgress >= 1) {
        if (runtime.targetStateIndex != null && runtime.targetStateIndex >= 0) {
          runtime.activeStateIndex = runtime.targetStateIndex
        }
        runtime.isInTransition = false
        runtime.transitionProgress = 0
        runtime.firingTransitionIndex = null
        runtime.firingTransitionHandleId = null
        runtime.targetStateIndex = null
        runtime.timedArmedStateIndex = null
      } else {
        break
      }
    }

    const currentState = states[runtime.activeStateIndex]
    if (!currentState) break

    if (runtime.timedArmedStateIndex !== runtime.activeStateIndex) {
      resetTimedForState(currentState, transitions, handles, ctx.conditionDyn)
      runtime.timedArmedStateIndex = runtime.activeStateIndex
    }

    const eligible: string[] = []
    let best: TransitionCandidate | null = null

    if (!runtime.isInTransition) {
      const indices: number[] = currentState.Data?.outTransitionIndices ?? []
      for (const index of indices) {
        const desc = transitions[index]
        if (!desc) continue
        const enabled =
          desc.Data?.isEnabled === undefined ? true : readBool(desc.Data.isEnabled)
        if (!enabled) continue
        const meta = readTransitionMeta(desc)
        const cond = resolveHandle(handles, desc.Data?.condition)
        recordConditionOverlay(
          nodeTruth,
          desc.HandleId,
          cond,
          board,
          handles,
          ctx,
          meta.isForcedToTrue
        )
        if (!conditionPasses(cond, board, handles, meta.isForcedToTrue, ctx)) continue
        eligible.push(desc.HandleId)
        const cand: TransitionCandidate = { desc, index, isGlobal: false, ...meta }
        if (
          transitionHasHigherPriority(
            best ? { priority: best.priority, isForcedToTrue: best.isForcedToTrue } : null,
            cand
          )
        ) {
          best = cand
        }
      }
    }

    for (let gi = 0; gi < globals.length; gi++) {
      const desc = globals[gi]!
      const enabled =
        desc.Data?.isEnabled === undefined ? true : readBool(desc.Data.isEnabled)
      if (!enabled) continue
      const meta = readTransitionMeta(desc)
      const cond = resolveHandle(handles, desc.Data?.condition)
      recordConditionOverlay(
        nodeTruth,
        desc.HandleId,
        cond,
        board,
        handles,
        ctx,
        meta.isForcedToTrue
      )
      if (!conditionPasses(cond, board, handles, meta.isForcedToTrue, ctx)) continue
      eligible.push(desc.HandleId)
      const cand: TransitionCandidate = {
        desc,
        index: transitions.length + gi,
        isGlobal: true,
        ...meta,
      }
      if (
        transitionHasHigherPriority(
          best ? { priority: best.priority, isForcedToTrue: best.isForcedToTrue } : null,
          cand
        )
      ) {
        best = cand
      }
    }

    runtime.eligibleTransitionIds = eligible
    if (!best) break

    runtime.lastFiredTransitionId = best.desc.HandleId
    runtime.firingTransitionHandleId = best.desc.HandleId
    runtime.firingTransitionIndex = best.index
    runtime.targetStateIndex = best.targetStateIndex
    runtime.transitionDuration = best.duration
    runtime.transitionProgress = 0
    runtime.isInTransition = true
    runtime.instantChainLength = chain + 1

    if (best.duration <= 0) {
      runtime.activeStateIndex = best.targetStateIndex
      runtime.isInTransition = false
      runtime.transitionProgress = 0
      runtime.firingTransitionIndex = null
      runtime.firingTransitionHandleId = null
      runtime.targetStateIndex = null
      runtime.timedArmedStateIndex = null
      continue
    }
    break
  }
}

export function findStateMachineHandles(
  handles: Map<string, AnimgraphNode>
): AnimgraphNode[] {
  const out: AnimgraphNode[] = []
  for (const h of handles.values()) {
    if (handleType(h) === 'animAnimNode_StateMachine') out.push(h)
  }
  return out
}

export function collectDiscoveredInputs(handles: Map<string, AnimgraphNode>): {
  features: Array<{ feature: string; property: string }>
  /** Vector4 AnimFeatures (VectorInput) — one entry per group.name */
  vectorFeatures: Array<{ feature: string; property: string }>
  /** Bool AnimFeatures (BoolInput / BoolFeature) — one entry per group.name */
  boolFeatures: Array<{ feature: string; property: string }>
  floatVars: string[]
  boolVars: string[]
  intVars: string[]
  wrappers: string[]
  events: string[]
  /** Data-flow tags (AnimNode_TagValue) */
  tags: string[]
  /** StaticSwitch Component/Visual/Rig tags (offline entityTags mock) */
  entityTags: string[]
} {
  const features: Array<{ feature: string; property: string }> = []
  const vectorFeatures: Array<{ feature: string; property: string }> = []
  const boolFeatures: Array<{ feature: string; property: string }> = []
  const featureKeys = new Set<string>()
  const vectorKeys = new Set<string>()
  const boolKeys = new Set<string>()
  const floatVars = new Set<string>()
  const boolVars = new Set<string>()
  const intVars = new Set<string>()
  const wrappers = new Set<string>()
  const events = new Set<string>()
  const tags = new Set<string>()
  const entityTags = new Set<string>()

  const addFeature = (feature: string, property: string, preferDisplay = false) => {
    if (!feature || !property || feature === 'None' || property === 'None') return
    const key = `${feature}.${property}`.toLowerCase()
    const existing = features.findIndex(
      (f) => `${f.feature}.${f.property}`.toLowerCase() === key
    )
    if (existing >= 0) {
      if (preferDisplay) features[existing] = { feature, property }
      return
    }
    featureKeys.add(key)
    features.push({ feature, property })
  }

  const addVectorFeature = (feature: string, property: string, preferDisplay = false) => {
    if (!feature || !property || feature === 'None' || property === 'None') return
    const key = `${feature}.${property}`.toLowerCase()
    const existing = vectorFeatures.findIndex(
      (f) => `${f.feature}.${f.property}`.toLowerCase() === key
    )
    if (existing >= 0) {
      if (preferDisplay) vectorFeatures[existing] = { feature, property }
      return
    }
    vectorKeys.add(key)
    vectorFeatures.push({ feature, property })
  }

  const addBoolFeature = (feature: string, property: string, preferDisplay = false) => {
    if (!feature || !property || feature === 'None' || property === 'None') return
    const key = `${feature}.${property}`.toLowerCase()
    const existing = boolFeatures.findIndex(
      (f) => `${f.feature}.${f.property}`.toLowerCase() === key
    )
    if (existing >= 0) {
      if (preferDisplay) boolFeatures[existing] = { feature, property }
      return
    }
    boolKeys.add(key)
    boolFeatures.push({ feature, property })
  }

  const addWrapper = (name: string) => {
    if (name && name !== 'None') wrappers.add(name)
  }

  for (const h of handles.values()) {
    const t = handleType(h)
    const d = h.Data ?? {}
    if (
      t === 'animAnimStateTransitionCondition_FloatFeature' ||
      t === 'animAnimStateTransitionCondition_IntFeature' ||
      t === 'animAnimStateTransitionCondition_IntEdgeFeature' ||
      t === 'animAnimStateTransitionCondition_IntEdgeFromToFeature' ||
      t === 'animAnimStateTransitionCondition_IntEdgeToFeature' ||
      t === 'animAnimStateTransitionCondition_IntEdgeGreaterFromZeroFeature'
    ) {
      addFeature(readCName(d.featureName), readCName(d.featurePropertyName))
    }
    if (
      t === 'animAnimStateTransitionCondition_BoolFeature' ||
      t === 'animAnimStateTransitionCondition_BoolEdgeFeature'
    ) {
      addBoolFeature(readCName(d.featureName), readCName(d.featurePropertyName))
    }
    // External AnimFeature inputs — prefer their casing for UI labels
    if (t === 'animAnimNode_FloatInput' || t === 'animAnimNode_IntInput') {
      addFeature(readCName(d.group), readCName(d.name), true)
    }
    if (t === 'animAnimNode_BoolInput') {
      addBoolFeature(readCName(d.group), readCName(d.name), true)
    }
    // Vector4 AnimFeature (engine VectorInputValue) — one Vector4 per group.name
    if (t === 'animAnimNode_VectorInput') {
      addVectorFeature(readCName(d.group), readCName(d.name), true)
    }
    if (
      t === 'animAnimStateTransitionCondition_FloatVariable' ||
      t === 'animAnimStateTransitionCondition_ModifiedFloatVariable' ||
      t === 'animAnimNode_FloatVariable'
    ) {
      const name = readCName(d.variableName)
      if (name) floatVars.add(name)
    }
    if (
      t === 'animAnimStateTransitionCondition_BoolVariable' ||
      t === 'animAnimNode_BoolVariable'
    ) {
      const name = readCName(d.variableName)
      if (name) boolVars.add(name)
    }
    if (
      t === 'animAnimStateTransitionCondition_IntVariable' ||
      t === 'animAnimNode_IntVariable'
    ) {
      const name = readCName(d.variableName)
      if (name) intVars.add(name)
    }
    if (t === 'animAnimNode_WrapperValue') {
      for (const name of readCNameList(d.wrapperNames)) addWrapper(name)
    }
    if (t === 'animAnimStateTransitionCondition_WrapperValue') {
      addWrapper(readCName(d.wrapperName))
    }
    if (t === 'animAnimNode_TagValue') {
      const name = readCName(d.tag)
      if (name && name !== 'None') tags.add(name)
    }
    if (
      t === 'animComponentTagCondition' ||
      t === 'animVisualTagCondition' ||
      t === 'animRigTagCondition'
    ) {
      const name =
        readCName(d.animTag) || readCName(d.visualTag) || readCName(d.tag)
      if (name && name !== 'None') entityTags.add(name)
    }
    if (t === 'animAnimNode_MultiBoolToFloatValue') {
      const inputs = Array.isArray(d.inputsData) ? d.inputsData : []
      for (const raw of inputs) {
        if (!raw || typeof raw !== 'object') continue
        const e = raw as Record<string, unknown>
        addBoolFeature(readCName(e.group), readCName(e.name))
      }
    }
    if (
      t === 'animAnimStateTransitionCondition_ExternalEvent' ||
      t === 'animAnimStateTransitionCondition_AnimEvent' ||
      t === 'animAnimStateTransitionCondition_AnimEnd' ||
      t === 'animAnimNode_EventValue' ||
      t === 'animAnimNode_Event'
    ) {
      const name = readCName(d.eventName)
      if (name && name !== 'None') events.add(name)
    }
    if (t === 'animAnimNode_Signal') {
      for (const key of ['startEvent', 'endEvent'] as const) {
        const name = readCName(d[key])
        if (name && name !== 'None') events.add(name)
      }
    }
  }

  vectorFeatures.sort((a, b) =>
    `${a.feature}.${a.property}`.localeCompare(`${b.feature}.${b.property}`)
  )
  boolFeatures.sort((a, b) =>
    `${a.feature}.${a.property}`.localeCompare(`${b.feature}.${b.property}`)
  )

  return {
    features,
    vectorFeatures,
    boolFeatures,
    floatVars: [...floatVars].sort((a, b) => a.localeCompare(b)),
    boolVars: [...boolVars].sort((a, b) => a.localeCompare(b)),
    intVars: [...intVars].sort((a, b) => a.localeCompare(b)),
    wrappers: [...wrappers].sort((a, b) => a.localeCompare(b)),
    events: [...events].sort((a, b) => a.localeCompare(b)),
    tags: [...tags].sort((a, b) => a.localeCompare(b)),
    entityTags: [...entityTags].sort((a, b) => a.localeCompare(b)),
  }
}
