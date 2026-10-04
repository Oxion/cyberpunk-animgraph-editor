import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from AnimStateTransitionDescription node data
 * Based on flatten_animAnimStateTransitionDescription.ts
 */
export function extractReferencedNodesFromAnimStateTransitionDescription(data: any): AnimgraphNode[] {
  const referencedNodes: AnimgraphNode[] = []
  
  // Extract from condition
  referencedNodes.push(...extractReferencedNodesFromField(data.condition))
  
  // Extract from interpolator
  referencedNodes.push(...extractReferencedNodesFromField(data.interpolator))
  
  return referencedNodes
}
