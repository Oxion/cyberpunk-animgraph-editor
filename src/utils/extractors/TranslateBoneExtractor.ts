import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from TranslateBone node data
 * Based on flatten_animAnimNode_TranslateBone.ts
 */
export function extractReferencedNodesFromTranslateBone(data: any): AnimgraphNode[] {
  const referencedNodes: AnimgraphNode[] = []
  
  // Extract from inputNode
  referencedNodes.push(...extractReferencedNodesFromField(data.inputNode))
  
  // Extract from inputTranslation
  referencedNodes.push(...extractReferencedNodesFromField(data.inputTranslation))
  
  return referencedNodes
}
