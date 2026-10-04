import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from FloatJoin node data
 * Based on flatten_animAnimNode_FloatJoin.ts
 */
export function extractReferencedNodesFromFloatJoin(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.inputNodes)
}

/**
 * Extracts referenced nodes from FloatLatch node data
 * Based on flatten_animAnimNode_FloatLatch.ts
 */
export function extractReferencedNodesFromFloatLatch(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.inputNode)
}

/**
 * Extracts referenced nodes from DampFloat node data
 * Based on flatten_animAnimNode_DampFloat.ts
 */
export function extractReferencedNodesFromDampFloat(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.inputNode)
}

/**
 * Extracts referenced nodes from CurveFloatValue node data
 * Based on flatten_animAnimNode_CurveFloatValue.ts
 */
export function extractReferencedNodesFromCurveFloatValue(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.argument)
}

/**
 * Extracts referenced nodes from SpringDamp node data
 * Based on flatten_animAnimNode_SpringDamp.ts
 */
export function extractReferencedNodesFromSpringDamp(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.inputNode)
}
