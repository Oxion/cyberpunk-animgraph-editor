import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from SetBoneTransform node data
 * Based on flatten_animAnimNode_SetBoneTransform.ts
 */
export function extractReferencedNodesFromSetBoneTransform(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.inputLink)
}
