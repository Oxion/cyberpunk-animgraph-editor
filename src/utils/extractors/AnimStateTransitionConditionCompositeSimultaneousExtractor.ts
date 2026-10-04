import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from AnimStateTransitionConditionCompositeSimultaneous node data
 * Based on flatten_animAnimStateTransitionCondition_CompositeSimultaneous.ts
 */
export function extractReferencedNodesFromAnimStateTransitionConditionCompositeSimultaneous(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromField(data.conditions)
}
