import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from BlendAdditive node data
 * Based on flatten_animAnimNode_BlendAdditive.ts
 */
export function extractReferencedNodesFromBlendAdditive(data: any): AnimgraphNode[] {
  const referencedNodes: AnimgraphNode[] = []
  
  // Extract from inputNode
  referencedNodes.push(...extractReferencedNodesFromField(data.inputNode))
  
  // Extract from addedInputNode
  referencedNodes.push(...extractReferencedNodesFromField(data.addedInputNode))
  
  return referencedNodes
}
