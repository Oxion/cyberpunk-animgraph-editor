import type { AnimgraphNode } from '../graph/animgraphTypes'

/**
 * Extracts referenced nodes from nodes with single inputNode field
 */
export function extractReferencedNodesFromSingleInput(data: any, fieldName: string = 'inputNode'): AnimgraphNode[] {
  const referencedNodes: AnimgraphNode[] = []
  
  if (data[fieldName]) {
    if (data[fieldName].HandleId) {
      referencedNodes.push(data[fieldName])
    } else if (data[fieldName].HandleRefId) {
      referencedNodes.push(data[fieldName])
    }
  }
  
  return referencedNodes
}

/**
 * Extracts referenced nodes from nodes with single firstInputNode field
 */
export function extractReferencedNodesFromFirstInput(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromSingleInput(data, 'firstInputNode')
}

/**
 * Extracts referenced nodes from nodes with single secondInputNode field
 */
export function extractReferencedNodesFromSecondInput(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromSingleInput(data, 'secondInputNode')
}

/**
 * Extracts referenced nodes from nodes with single addedInputNode field
 */
export function extractReferencedNodesFromAddedInput(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromSingleInput(data, 'addedInputNode')
}

/**
 * Extracts referenced nodes from nodes with single weightNode field
 */
export function extractReferencedNodesFromWeightNode(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromSingleInput(data, 'weightNode')
}

/**
 * Extracts referenced nodes from nodes with single syncMethod field
 */
export function extractReferencedNodesFromSyncMethod(data: any): AnimgraphNode[] {
  return extractReferencedNodesFromSingleInput(data, 'syncMethod')
}
