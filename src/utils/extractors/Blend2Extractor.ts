import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from Blend2 node data
 * Based on flatten_animAnimNode_Blend2.ts
 */
export function extractReferencedNodesFromBlend2(data: any): AnimgraphNode[] {
  const referencedNodes: AnimgraphNode[] = []
  
  // Extract from firstInputNode
  referencedNodes.push(...extractReferencedNodesFromField(data.firstInputNode))
  
  // Extract from secondInputNode
  referencedNodes.push(...extractReferencedNodesFromField(data.secondInputNode))
  
  // Extract from syncMethod
  referencedNodes.push(...extractReferencedNodesFromField(data.syncMethod))
  
  // Extract from weightNode
  referencedNodes.push(...extractReferencedNodesFromField(data.weightNode))
  
  return referencedNodes
}
