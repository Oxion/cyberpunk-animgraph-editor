import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from AnimStateMachineConditionalEntry node data
 * Based on flatten_animAnimStateMachineConditionalEntry.ts
 */
export function extractReferencedNodesFromAnimStateMachineConditionalEntry(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.condition)
}
