import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from AnimDatabase node data
 * Based on flatten_animAnimNode_AnimDatabase.ts
 */
export function extractReferencedNodesFromAnimDatabase(data: any): AnimgraphNode[] {
  const referencedNodes: AnimgraphNode[] = []
  
  // Extract from inputLinks array
  referencedNodes.push(...extractReferencedNodesFromField(data.inputLinks))
  
  // Extract from durationLink
  referencedNodes.push(...extractReferencedNodesFromField(data.durationLink))
  
  return referencedNodes
}
