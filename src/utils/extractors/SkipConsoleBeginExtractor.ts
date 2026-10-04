import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from SkipConsoleBegin node data
 * Based on flatten_animAnimNode_SkipConsoleBegin.ts
 */
export function extractReferencedNodesFromSkipConsoleBegin(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.inputLink)
}
