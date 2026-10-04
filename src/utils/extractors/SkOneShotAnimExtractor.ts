import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from SkOneShotAnim node data
 * Based on flatten_animAnimNode_SkOneShotAnim.ts
 */
export function extractReferencedNodesFromSkOneShotAnim(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.Input)
}
