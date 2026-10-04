import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from FloatComparator node data
 * Based on flatten_animAnimNode_FloatComparator.ts
 */
export function extractReferencedNodesFromFloatComparator(data: any): AnimgraphNode[] {
  const referencedNodes: AnimgraphNode[] = []
  
  referencedNodes.push(...extractReferencedNodesFromField(data.firstInputLink))
  referencedNodes.push(...extractReferencedNodesFromField(data.secondInputLink))

  referencedNodes.push(...extractReferencedNodesFromField(data.trueInputLink))
  referencedNodes.push(...extractReferencedNodesFromField(data.falseInputLink))
  
  return referencedNodes
}
