import { AnimgraphNode } from "@/utils/graph/animgraphTypes"
import { handleType, resolveHandle } from "../../simDataUtils"

/**
 * Preferred Output under a State (Update + Sample share this).
 * Falls back to first child handle when no Output is present.
 */
export function findStateOutput(
  handleIdToAnimgraphNodeMap: Map<string, AnimgraphNode>,
  state: AnimgraphNode,
): AnimgraphNode | undefined {
  const nodeRefs = Array.isArray(state.Data?.nodes) 
    ? state.Data.nodes 
    : []
  
  let fallback: AnimgraphNode | undefined
  for (const ref of nodeRefs) {
    const handle = resolveHandle(handleIdToAnimgraphNodeMap, ref)
    if (!handle) continue
    if (handleType(handle) === 'animAnimNode_Output') return handle
    if (!fallback) fallback = handle
  }
  return fallback
}