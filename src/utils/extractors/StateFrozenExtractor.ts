import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from StateFrozen node data
 * Based on flatten_animAnimNode_StateFrozen.ts
 */
export function extractReferencedNodesFromStateFrozen(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.nodes)
}
