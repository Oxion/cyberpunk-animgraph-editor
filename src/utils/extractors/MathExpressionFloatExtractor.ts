import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from MathExpressionFloat node data
 * Based on flatten_animAnimNode_MathExpressionFloat.ts
 */
export function extractReferencedNodesFromMathExpressionFloat(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.expressionData)
}
