import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from Output node data
 * Based on flatten_animAnimNode_Output.ts
 */
export function extractReferencedNodesFromOutput(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.node)
}
