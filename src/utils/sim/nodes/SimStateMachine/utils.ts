import { AnimgraphNode } from "@/utils/graph/animgraphTypes"
import { handleType, listHandles, readBool, readNumber, resolveHandle } from "../../simDataUtils"
import { ANIM_NODE_TYPE_BLEND_FROM_POSE, ANIM_NODE_TYPE_STATE_MACHINE } from "@/utils/graph/animNodeTypes"

/**
 * AnimNode_StateMachine::ShouldUseFrozenPose — keep last Sample in frozen buffer
 * when any enabled out-transition has supportBlendFromPose (or timed global).
 */
export function smShouldUseFrozenPose(
  handleIdToAnimgraphNodeMap: Map<string, AnimgraphNode>,
  sm: AnimgraphNode,
  activeStateIndex: number,
): boolean {
  const data = sm.Data ?? {}
  const transitions = listHandles(handleIdToAnimgraphNodeMap, data.transitions)
  const globals = listHandles(handleIdToAnimgraphNodeMap, data.globalTransitions)
  for (const g of globals) {
    const d = g.Data ?? {}
    const enabled = d.isEnabled === undefined ? true : readBool(d.isEnabled)
    if (!enabled) continue
    // Engine: enabled && !GetCanRequestInertialization && duration > 0.
    if (readBool(d.canRequestInertialization)) continue
    const duration = readNumber(d.duration, 0)
    if (duration > 0) return true
  }

  const states = listHandles(handleIdToAnimgraphNodeMap, data.states)
  const current = states[activeStateIndex]
  if (!current) return false
  const indices: number[] = current.Data?.outTransitionIndices ?? []
  for (const index of indices) {
    const desc = transitions[index]
    if (!desc) continue
    if (readBool(desc.Data?.supportBlendFromPose)) return true
  }

  return false
}

export function findStateMachineHandles(
  handles: Map<string, AnimgraphNode>
): AnimgraphNode[] {
  const out: AnimgraphNode[] = []
  for (const h of handles.values()) {
    if (handleType(h) === ANIM_NODE_TYPE_STATE_MACHINE) out.push(h)
  }
  return out
}

/**
 * TODO maybe there needs to be done at compile pass with context system introduced that can define in which SM node is
 * Engine AnimGraph TEMP_Bind: BlendFromPose inside a state → that SM's frozen pose.
 * Returns blendNodeHandleId → smHandleId.
 */
export function bindBlendFromPoseToStateMachines(
  handles: Map<string, AnimgraphNode>
): Map<string, string> {
  const out = new Map<string, string>()
  for (const sm of findStateMachineHandles(handles)) {
    const states = Array.isArray(sm.Data?.states) ? sm.Data.states : []
    for (const ref of states) {
      const state = resolveHandle(handles, ref)
      if (!state) continue
      const nodes = Array.isArray(state.Data?.nodes) ? state.Data.nodes : []
      for (const nref of nodes) {
        const n = resolveHandle(handles, nref)
        if (n && handleType(n) === ANIM_NODE_TYPE_BLEND_FROM_POSE) {
          out.set(n.HandleId, sm.HandleId)
        }
      }
    }
  }
  return out
}