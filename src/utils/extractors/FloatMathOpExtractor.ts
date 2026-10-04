import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from FloatMathOp node data
 * Based on flatten_animAnimNode_FloatMathOp.ts
 */
export function extractReferencedNodesFromFloatMathOp(data: any): AnimgraphNode[] {
  const referencedNodes: AnimgraphNode[] = []
  
  // Extract from firstInputNode
  referencedNodes.push(...extractReferencedNodesFromField(data.firstInputNode))
  
  // Extract from secondInputNode
  referencedNodes.push(...extractReferencedNodesFromField(data.secondInputNode))
  
  return referencedNodes
}
