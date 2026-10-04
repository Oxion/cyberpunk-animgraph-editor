import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from State node data
 * Based on flatten_animAnimNode_State.ts
 */
export function extractReferencedNodesFromState(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.nodes)
}
