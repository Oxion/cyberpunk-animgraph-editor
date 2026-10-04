import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from SkPhaseWithDurationAnim node data
 * Based on flatten_animAnimNode_SkPhaseWithDurationAnim.ts
 */
export function extractReferencedNodesFromSkPhaseWithDurationAnim(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.durationLink)
}
