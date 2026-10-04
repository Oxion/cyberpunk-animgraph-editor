import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from Stage node data
 * Based on flatten_animAnimNode_Stage.ts
 */
export function extractReferencedNodesFromStage(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.nodes)
}
