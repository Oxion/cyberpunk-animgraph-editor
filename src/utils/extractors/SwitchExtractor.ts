import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from Switch node data
 * Based on flatten_animAnimNode_Switch.ts
 */
export function extractReferencedNodesFromSwitch(data: any): AnimgraphNode[] {
  const referencedNodes: AnimgraphNode[] = []
  
  // Extract from inputNodes array
  referencedNodes.push(...extractReferencedNodesFromField(data.inputNodes))
  
  // Extract from weightNode
  referencedNodes.push(...extractReferencedNodesFromField(data.weightNode))
  
  return referencedNodes
}
