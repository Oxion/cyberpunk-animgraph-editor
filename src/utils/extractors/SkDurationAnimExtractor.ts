import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from SkDurationAnim node data
 * Based on flatten_animAnimNode_SkDurationAnim.ts
 */
export function extractReferencedNodesFromSkDurationAnim(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.Duration)
}
