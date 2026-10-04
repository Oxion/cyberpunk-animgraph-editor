import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from VectorLink node data
 * Based on flatten_animLink_any.ts
 */
export function extractReferencedNodesFromVectorLink(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.node)
}
