import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from FloatLink node data
 * Based on flatten_animLink_any.ts
 */
export function extractReferencedNodesFromFloatLink(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.node)
}
