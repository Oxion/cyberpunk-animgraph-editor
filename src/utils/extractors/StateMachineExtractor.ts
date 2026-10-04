import type { AnimgraphNode } from '../graph/animgraphTypes'
import { extractReferencedNodesFromField } from './NodeReferenceUtils'

/**
 * Extracts referenced nodes from StateMachine node data
 * Based on flatten_animAnimNode_StateMachine.ts
 */
export function extractReferencedNodesFromStateMachine(data: any): AnimgraphNode[] {
  const referencedNodes: AnimgraphNode[] = []
  
  // Extract from anyStateInterpolator
  referencedNodes.push(...extractReferencedNodesFromField(data.anyStateInterpolator))
  
  // Extract from conditionalEntries array
  referencedNodes.push(...extractReferencedNodesFromField(data.conditionalEntries))
  
  // Extract from frozenState
  referencedNodes.push(...extractReferencedNodesFromField(data.frozenState))
  
  // Extract from globalTransitions array
  referencedNodes.push(...extractReferencedNodesFromField(data.globalTransitions))
  
  // Extract from states array
  referencedNodes.push(...extractReferencedNodesFromField(data.states))
  
  // Extract from transitions array
  referencedNodes.push(...extractReferencedNodesFromField(data.transitions))
  
  return referencedNodes
}
