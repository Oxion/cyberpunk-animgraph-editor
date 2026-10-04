import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from MathExpressionNodeData node data
 * Based on flatten_animMathExpressionNodeData.ts
 */
export function extractReferencedNodesFromMathExpressionNodeData(data: any): AnimgraphNode[] {
  const referencedNodes: AnimgraphNode[] = []
  
  // Extract from expression
  referencedNodes.push(...extractReferencedNodesFromField(data.expression))
  
  // Extract from floatSockets array
  referencedNodes.push(...extractReferencedNodesFromField(data.floatSockets))
  
  // Extract from quaternionSockets array
  referencedNodes.push(...extractReferencedNodesFromField(data.quaternionSockets))
  
  // Extract from vectorSockets array
  referencedNodes.push(...extractReferencedNodesFromField(data.vectorSockets))
  
  return referencedNodes
}
