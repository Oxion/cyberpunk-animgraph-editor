import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from IntToFloatConverter node data
 * Based on flatten_animAnimNode_IntToFloatConverter.ts
 */
export function extractReferencedNodesFromIntToFloatConverter(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.inputNode)
}
