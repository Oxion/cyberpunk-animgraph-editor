import { AnimgraphNode } from "@/utils/graph/animgraphTypes"
import { WalkCtx } from "../../SimGraphRunner.types"
import { listHandles, readBool, readNumber, resolveHandle } from "../../simDataUtils"
import { evaluateSmTransitionBlendAlpha, MAX_INSTANT_TRANSITION_SEQUENCE_LENGTH, readTransitionMeta, resetTimedForState, transitionHasHigherPriority } from "./transitions"
import { updateSmCondition } from "./conditions"
import { findStateOutput } from "./state"
import { markActive, wasBoneOpActive } from "../../simGraphRunnerUtils"
import { TransitionCandidate } from "./types"
import { requestInertialization } from "../../engineParity"
import { SimStateMachineRuntime } from "./runtime"
import { isFrameLogIdPresent } from "../../simSampleLog"

/**
 * Engine CheckConditionalEntryTransitions — runs before state Update / CheckTransitions.
 */
export function updateSmEntryConditions(
  ctx: WalkCtx,
  smAnimgraphNode: AnimgraphNode,
  runtime: SimStateMachineRuntime,
): void {
  if (!runtime.checkEntryConditions) return
  runtime.checkEntryConditions = false

  const { handles } = ctx

  const data = smAnimgraphNode.Data ?? {}
  const states = listHandles(handles, data.states)
  const conditionalEntries = listHandles(handles, data.conditionalEntries)

  let bestEntry: AnimgraphNode | null = null
  let bestMeta: ReturnType<typeof readTransitionMeta> | null = null
  for (const entryAnimgraphNode of conditionalEntries) {
    const d = entryAnimgraphNode.Data ?? {}
    const enabled = d.isEnabled === undefined ? true : readBool(d.isEnabled)
    if (!enabled) continue

    const meta = {
      priority: readNumber(d.priority, 0),
      isForcedToTrue: readBool(d.isForcedToTrue),
      targetStateIndex: readNumber(d.targetStateIndex, -1),
      duration: 0,
      inertializationDuration: 0,
      canRequestInertialization: false,
    }

    const conditionAnimgraphNode = resolveHandle(handles, d.condition)
    
    const pass = updateSmCondition(
      ctx,
      entryAnimgraphNode.HandleId,
      conditionAnimgraphNode,
      meta.isForcedToTrue
    )
    if (pass !== true) continue
    
    if (
      transitionHasHigherPriority(
        bestMeta
          ? { priority: bestMeta.priority, isForcedToTrue: bestMeta.isForcedToTrue }
          : null,
        meta
      )
    ) {
      bestEntry = entryAnimgraphNode
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
  // GoToStateInstant: one-frame delay from entered state's prevent flag
  const entered = states[runtime.activeStateIndex]
  runtime.transitionsOneFrameDelay = readBool(
    entered?.Data?.preventTransitionsInActivationFrame
  )
}

/**
 * Engine CheckTransitions + CheckTransitionFinish loop, then blend progress.
 *
 * animNode_StateMachine::OnUpdate:
 *   for: CheckTransitions → CheckTransitionFinish (false → break)
 *   then: duration<=0 ? progress=1 : progress+=dt/duration
 *
 * FireTransition/GoToState: always progress=0, isInTransition=true; does not
 * swap current state. Finish (progress>=1) lands + optional oneFrameDelay.
 * Instant (duration<=0): progress forced to 1 after the loop → Finish next frame.
 */
export function updateStateMachineTransitions(
  ctx: WalkCtx,
  smAnimgraphNode: AnimgraphNode,
  runtime: SimStateMachineRuntime,
): void {
  const { 
    handles: handleIdToAnimgraphNodeMap,
    dt,
    conditionDyn,
  } = ctx

  const data = smAnimgraphNode.Data ?? {}
  const transitions = listHandles(handleIdToAnimgraphNodeMap, data.transitions)
  const globals = listHandles(handleIdToAnimgraphNodeMap, data.globalTransitions)
  const states = listHandles(handleIdToAnimgraphNodeMap, data.states)

  runtime.instantChainLength = 0

  if (__ENABLE_SIM_DEBUG__) {
    if (isFrameLogIdPresent("DoubleJump")) {
      if (smAnimgraphNode.HandleId === '1650') {
        console.log(
          ctx.poseGen, 'updateStateMachineTransitions', 
          'transitionsOneFrameDelay:', runtime.transitionsOneFrameDelay,
          'isInTransition:', runtime.isInTransition,
          'transitionProgress:', runtime.transitionProgress,
          'firingTransitionIndex:', runtime.firingTransitionIndex,
          'firingTransitionHandleId:', runtime.firingTransitionHandleId,
          'activeStateIndex:', runtime.activeStateIndex,
          'targetStateIndex:', runtime.targetStateIndex,
          'timedArmedStateIndex:', runtime.timedArmedStateIndex,
        )
      }
    }
  }

  // Engine: skip CheckTransitions this frame, then clear delay.
  // Progress still advances below when mid-blend (engine OnUpdate path).
  if (runtime.transitionsOneFrameDelay) {
    runtime.transitionsOneFrameDelay = false
    const currentState = states[runtime.activeStateIndex]
    if (currentState && runtime.timedArmedStateIndex !== runtime.activeStateIndex) {
      resetTimedForState(handleIdToAnimgraphNodeMap, conditionDyn, transitions, currentState)
      runtime.timedArmedStateIndex = runtime.activeStateIndex
    }
    runtime.eligibleTransitionIds = []
  } else {
    for (let chain = 0; chain < MAX_INSTANT_TRANSITION_SEQUENCE_LENGTH; chain++) {
      // --- CheckTransitions (before Finish — globals may interrupt progress>=1) ---
      const currentState = states[runtime.activeStateIndex]
      if (!currentState) break

      if (runtime.timedArmedStateIndex !== runtime.activeStateIndex) {
        resetTimedForState(handleIdToAnimgraphNodeMap, conditionDyn, transitions, currentState)
        runtime.timedArmedStateIndex = runtime.activeStateIndex
      }

      const eligible: string[] = []
      let best: TransitionCandidate | null = null

      // Locals only when not blending (engine anyTransitionInAction == false).
      if (!runtime.isInTransition) {
        const indices: number[] = currentState.Data?.outTransitionIndices ?? []
        for (const index of indices) {
          const descAnimgraphNode = transitions[index]
          if (!descAnimgraphNode) continue
          
          const enabled = descAnimgraphNode.Data?.isEnabled === undefined 
            ? true 
            : readBool(descAnimgraphNode.Data.isEnabled)
          if (!enabled) continue

          const meta = readTransitionMeta(descAnimgraphNode)
          const conditionAnimgraphNode = resolveHandle(handleIdToAnimgraphNodeMap, descAnimgraphNode.Data?.condition)
          const pass = updateSmCondition(
            ctx,
            descAnimgraphNode.HandleId,
            conditionAnimgraphNode,
            meta.isForcedToTrue
          )
          if (pass !== true) continue

          eligible.push(descAnimgraphNode.HandleId)
          const cand: TransitionCandidate = { desc: descAnimgraphNode, index, isGlobal: false, ...meta }
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

      // Globals always — mid-blend and progress>=1 pending finish.
      for (let gi = 0; gi < globals.length; gi++) {
        const descAnimgraphNode = globals[gi]!
        const enabled = descAnimgraphNode.Data?.isEnabled === undefined 
          ? true 
          : readBool(descAnimgraphNode.Data.isEnabled)
        if (!enabled) continue

        const meta = readTransitionMeta(descAnimgraphNode)
        const condAnimgraphNode = resolveHandle(handleIdToAnimgraphNodeMap, descAnimgraphNode.Data?.condition)
        const pass = updateSmCondition(
          ctx,
          descAnimgraphNode.HandleId,
          condAnimgraphNode,
          meta.isForcedToTrue
        )
        if (pass !== true) continue

        eligible.push(descAnimgraphNode.HandleId)
        const candidate: TransitionCandidate = {
          desc: descAnimgraphNode,
          index: transitions.length + gi,
          isGlobal: true,
          ...meta,
        }
        if (
          transitionHasHigherPriority(
            best ? { priority: best.priority, isForcedToTrue: best.isForcedToTrue } : null,
            candidate
          )
        ) {
          best = candidate
        }
      }

      runtime.eligibleTransitionIds = eligible

      if (best) {
        // FireTransition / GoToState — do not swap activeStateIndex yet.
        runtime.lastFiredTransitionId = best.desc.HandleId
        runtime.firingTransitionHandleId = best.desc.HandleId
        runtime.firingTransitionIndex = best.index
        runtime.targetStateIndex = best.targetStateIndex
        runtime.transitionDuration = best.duration
        runtime.transitionProgress = 0
        runtime.isInTransition = true
        runtime.instantChainLength = chain + 1
        runtime.timedArmedStateIndex = null

        if (best.canRequestInertialization) {
          requestInertialization(ctx.inertialization, best.inertializationDuration)
        }
      }

      // --- CheckTransitionFinish ---
      if (runtime.isInTransition && runtime.transitionProgress >= 1) {
        if (runtime.targetStateIndex != null && runtime.targetStateIndex >= 0) {
          runtime.activeStateIndex = runtime.targetStateIndex
        }
        runtime.isInTransition = false
        runtime.transitionProgress = 0
        runtime.firingTransitionIndex = null
        runtime.firingTransitionHandleId = null
        runtime.targetStateIndex = null
        runtime.timedArmedStateIndex = null
        const landed = states[runtime.activeStateIndex]
        if (readBool(landed?.Data?.preventTransitionsInActivationFrame)) {
          runtime.transitionsOneFrameDelay = true
          runtime.eligibleTransitionIds = []
          break
        }
        // Finished → continue chain (engine returned true).
        continue
      }

      // Not finished (incl. just-fired progress=0) → break like engine.
      break
    }
  }

  // Engine: advance blend progress after the CheckTransitions loop.
  if (runtime.isInTransition) {
    if (runtime.transitionDuration <= 0) {
      runtime.transitionProgress = 1
    } else {
      runtime.transitionProgress = Math.min(
        1,
        runtime.transitionProgress + dt / runtime.transitionDuration
      )
    }
  }
}

export function updateSm(
  ctx: WalkCtx,
  smAnimgraphNode: AnimgraphNode,
): void {
  const { 
    handles: handleIdToAnimgraphNodeMap,
    nodes: simNodeStateByHandleIds,
    updateFromNode,
    followUpdate,
  } = ctx

  const smAnimgraphNodeData = smAnimgraphNode.Data ?? {}

  const def = readNumber(smAnimgraphNodeData.defaultStateIndex, 0)
  let smRuntime = ctx.runtimes.get(smAnimgraphNode.HandleId)
  if (!smRuntime) {
    smRuntime = new SimStateMachineRuntime(smAnimgraphNode.HandleId, def)
    ctx.runtimes.set(smAnimgraphNode.HandleId, smRuntime)
  } else if (!wasBoneOpActive(ctx, smAnimgraphNode.HandleId)) {
    // Engine OnActivated (e.g. Switch re-selects this SM): default + entry check.
    smRuntime.reset(def)
  }

  const states = Array.isArray(smAnimgraphNodeData.states) ? smAnimgraphNodeData.states : []

  // Engine OnUpdate: entry → Update current state (full subgraph, nested SMs
  // included) → CheckTransitions. Nested CheckTransitions run inside that
  // Update, before parent sees AnimEnd / decides transitions.
  updateSmEntryConditions(ctx, smAnimgraphNode, smRuntime)

  if (!smRuntime.isInTransition) {
    // If we are not in a transition, we need to update current active state tree before checking transitions
    const preTransitionsActiveStateAnimgraphNode = resolveHandle(handleIdToAnimgraphNodeMap, states[smRuntime.activeStateIndex])
    if (preTransitionsActiveStateAnimgraphNode) {
      const outputAnimgraphNode = findStateOutput(handleIdToAnimgraphNodeMap, preTransitionsActiveStateAnimgraphNode)
      if (outputAnimgraphNode) updateFromNode(ctx, outputAnimgraphNode)
    }
  }

  updateStateMachineTransitions(
    ctx,
    smAnimgraphNode,
    smRuntime,
  )

  const afterTransitionsActiveStateAnimgraphNode = resolveHandle(handleIdToAnimgraphNodeMap, states[smRuntime.activeStateIndex])
  if (afterTransitionsActiveStateAnimgraphNode) {
    // After transitions, active state can be immedeatly changed without transitions, 
    // if it is already updated above when !inTransition, so followUpdate no-ops via visited.
    markActive(simNodeStateByHandleIds, afterTransitionsActiveStateAnimgraphNode.HandleId)
    const out = findStateOutput(handleIdToAnimgraphNodeMap, afterTransitionsActiveStateAnimgraphNode)
    // Already Updated above when !inTransition; followUpdate no-ops via visited.
    followUpdate(ctx, smAnimgraphNode, out)
  }

  if (smRuntime.isInTransition && smRuntime.targetStateIndex != null) {
    // Updating target state tree if in transition
    const targetStateAnimgraphNode = resolveHandle(handleIdToAnimgraphNodeMap, states[smRuntime.targetStateIndex])
    if (targetStateAnimgraphNode) {
      markActive(simNodeStateByHandleIds, targetStateAnimgraphNode.HandleId)
      const out = findStateOutput(handleIdToAnimgraphNodeMap, targetStateAnimgraphNode)
      followUpdate(ctx, smAnimgraphNode, out)
    }
  }

  if (smRuntime.firingTransitionHandleId) {
    const blendAlpha = evaluateSmTransitionBlendAlpha(
      handleIdToAnimgraphNodeMap,
      smAnimgraphNode,
      smRuntime,
      smRuntime.transitionProgress
    )
    markActive(simNodeStateByHandleIds, smRuntime.firingTransitionHandleId, blendAlpha, blendAlpha)
  }

  for (const id of smRuntime.eligibleTransitionIds) {
    markActive(simNodeStateByHandleIds, id)
  }
}