import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from IntLink node data
 * Based on flatten_animLink_any.ts
 */
export function extractReferencedNodesFromIntLink(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.node)
}
