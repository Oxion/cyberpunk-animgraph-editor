import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from BlendOverride node data
 */
export function extractReferencedNodesFromBlendOverride(data: any): AnimgraphNode[] {
  const referencedNodes: AnimgraphNode[] = []
  
  // Extract from inputNode
  referencedNodes.push(...extractReferencedNodesFromField(data.inputNode))
  
  // Extract from overrideNode
  referencedNodes.push(...extractReferencedNodesFromField(data.overrideNode))
  
  return referencedNodes
}
