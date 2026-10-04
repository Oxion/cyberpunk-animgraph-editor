import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from Root node data
 * Based on flatten_animAnimNode_Root.ts
 */
export function extractReferencedNodesFromRoot(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.nodes)
}
