import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from SkSpeedAnim node data
 * Based on flatten_animAnimNode_SkSpeedAnim.ts
 */
export function extractReferencedNodesFromSkSpeedAnim(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.Speed)
}
