import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from Join node data
 * Based on flatten_animAnimNode_Join.ts
 */
export function extractReferencedNodesFromJoin(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.input)
}
