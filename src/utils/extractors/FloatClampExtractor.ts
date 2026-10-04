import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from FloatClamp node data
 * Based on flatten_animAnimNode_FloatClamp.ts
 */
export function extractReferencedNodesFromFloatClamp(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.inputNode)
}
