import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from SkipConsoleEnd node data
 * Based on flatten_animAnimNode_SkipConsoleEnd.ts
 */
export function extractReferencedNodesFromSkipConsoleEnd(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.inputLink)
}
