import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from MathExpressionVector node data
 * Based on flatten_animAnimNode_MathExpressionVector.ts
 */
export function extractReferencedNodesFromMathExpressionVector(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.expressionData)
}
