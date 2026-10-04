import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from CriticalSpringDamp node data
 * Based on flatten_animAnimNode_CriticalSpringDamp.ts
 */
export function extractReferencedNodesFromCriticalSpringDamp(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.inputNode)
}
