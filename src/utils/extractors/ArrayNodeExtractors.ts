import type { AnimgraphNode } from '../graph/animgraphTypes'

/**
 * Extracts referenced nodes from array fields
 */
export function extractReferencedNodesFromArray(data: any, fieldName: string): AnimgraphNode[] {
  const referencedNodes: AnimgraphNode[] = []
  
  if (data[fieldName] && Array.isArray(data[fieldName])) {
    data[fieldName].forEach((node: any) => {
      if (node && typeof node === 'object') {
        if (node.HandleId) {
          referencedNodes.push(node)
        } else if (node.HandleRefId) {
          referencedNodes.push(node)
        }
      }
    })
  }
  
  return referencedNodes
}

/**
 * Extracts referenced nodes from inputNodes array
 */
export function extractReferencedNodesFromInputNodes(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromArray(data, 'inputNodes')
}

/**
 * Extracts referenced nodes from nodes array
 */
export function extractReferencedNodesFromNodes(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromArray(data, 'nodes')
}

/**
 * Extracts referenced nodes from states array
 */
export function extractReferencedNodesFromStates(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromArray(data, 'states')
}

/**
 * Extracts referenced nodes from transitions array
 */
export function extractReferencedNodesFromTransitions(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromArray(data, 'transitions')
}

/**
 * Extracts referenced nodes from globalTransitions array
 */
export function extractReferencedNodesFromGlobalTransitions(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromArray(data, 'globalTransitions')
}

/**
 * Extracts referenced nodes from conditionalEntries array
 */
export function extractReferencedNodesFromConditionalEntries(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromArray(data, 'conditionalEntries')
}
