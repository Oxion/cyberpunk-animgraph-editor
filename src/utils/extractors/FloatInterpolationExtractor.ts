import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from FloatInterpolation node data
 * Based on flatten_animAnimNode_FloatInterpolation.ts
 */
export function extractReferencedNodesFromFloatInterpolation(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.inputNode)
}
