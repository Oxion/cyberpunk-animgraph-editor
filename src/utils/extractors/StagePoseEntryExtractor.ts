import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from StagePoseEntry node data
 * Based on flatten_animAnimNode_StagePoseEntry.ts
 */
export function extractReferencedNodesFromStagePoseEntry(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.parentInput)
}
