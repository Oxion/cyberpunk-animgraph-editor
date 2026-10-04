import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from SkFrameAnim node data
 * Based on flatten_animAnimNode_SkFrameAnim.ts
 */
export function extractReferencedNodesFromSkFrameAnim(data: any): AnimgraphNode[] {
  const referencedNodes: AnimgraphNode[] = []
  
  // Extract from frameLink
  referencedNodes.push(...extractReferencedNodesFromField(data.frameLink))
  
  // Extract from progressLink
  referencedNodes.push(...extractReferencedNodesFromField(data.progressLink))
  
  // Extract from timeLink
  referencedNodes.push(...extractReferencedNodesFromField(data.timeLink))
  
  return referencedNodes
}
