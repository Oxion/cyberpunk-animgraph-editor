import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from expressionData_any node data
 * Based on flatten_animAnimNode_expressionData_any.ts
 */
export function extractReferencedNodesFromExpressionDataAny(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.expressionData)
}
