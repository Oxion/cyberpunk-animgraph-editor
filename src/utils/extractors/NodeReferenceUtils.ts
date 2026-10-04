import type { AnimgraphLinkObject, AnimgraphNode, AnimgraphNodeLike } from '../graph/animgraphTypes'

export function findNodeReferenceByHandleId(inputFieldValue: any, handleId: string): AnimgraphNodeLike | null {
  if (Array.isArray(inputFieldValue)) {
    return inputFieldValue.find(item => {
      const resolvedAnimgraphNodeLikeObject = resolveAnimgraphNodeLikeObject(item)
      if (!resolvedAnimgraphNodeLikeObject) return false


      return 'HandleRefId' in resolvedAnimgraphNodeLikeObject
        ? resolvedAnimgraphNodeLikeObject.HandleRefId === handleId
        : resolvedAnimgraphNodeLikeObject.HandleId === handleId
    })
  }

  return resolveAnimgraphNodeLikeObject(inputFieldValue)
}

export function resolveAnimgraphNodeLikeObject(animgraphObject: any): AnimgraphNodeLike | null {
  if (isAnimgraphLinkObject(animgraphObject)) {
    return animgraphObject.node
  } else if (isAnimgraphNodeLikeObject(animgraphObject)) {
    return animgraphObject
  } else {
    return null
  }
}

export function assertAnimgraphNodeLikeObject(animgraphObject: any): AnimgraphNodeLike {
  if (!isAnimgraphNodeLikeObject(animgraphObject)) {
    throw new Error('Animgraph object doesnt contain reference to node')
  }
  
  return animgraphObject
}

export function isAnimgraphNodeLikeObject(animgraphObject: any): animgraphObject is AnimgraphNodeLike {
  return animgraphObject && ('HandleId' in animgraphObject || 'HandleRefId' in animgraphObject)
}

export function isAnimgraphLinkObject(animgraphObject: any): animgraphObject is AnimgraphLinkObject {
  return animgraphObject && ('$type' in animgraphObject && 'node' in animgraphObject)
}

/**
 * Extract referenced node from reference object using the same logic as AnimgraphParser
 * @param reference - Reference object containing node definition or link
 * @returns Referenced node if found, null otherwise
 */
export function extractReferencedNode(reference: any): AnimgraphNode | null {
  if (!reference) return null

  // Handle different types of references:

  // 1. Direct node object with HandleId and Data
  if (reference.HandleId && reference.HandleId !== '-1' && reference.HandleId !== '0' && reference.Data) {
    return {
      HandleId: reference.HandleId,
      Data: reference.Data
    }
  }

  // 2. Link object with node property (e.g., animPoseLink)
  if (reference.$type && reference.node) {
    if (reference.node.HandleId && reference.node.HandleId !== '-1' && reference.node.HandleId !== '0' && reference.node.Data) {
      return {
        HandleId: reference.node.HandleId,
        Data: reference.node.Data
      }
    }
  }

  // 3. Object that looks like a node definition (has HandleId and other properties)
  if (reference.HandleId && reference.HandleId !== '-1' && reference.HandleId !== '0') {
    // Check if this object has node-like properties (not just an ID reference)
    const hasNodeProperties = Object.keys(reference).some(key =>
      key !== 'HandleId' && key !== 'HandleRefId' && key !== 'NodeId' && key !== 'TargetNodeId'
    )

    if (hasNodeProperties) {
      return {
        HandleId: reference.HandleId,
        Data: reference
      }
    }
  }

  return null
}

/**
 * Extract referenced nodes from a field that can contain different types of references
 * @param fieldValue - Value of the field (can be node, array of nodes, or link object)
 * @returns Array of referenced nodes
 */
export function extractReferencedNodesFromField(fieldValue: any): AnimgraphNode[] {
  // Handle array of references
  if (Array.isArray(fieldValue)) {
    return fieldValue.reduce((acc: AnimgraphNode[], item: any) => {
      const referencedNode = extractReferencedNode(item)
      if (referencedNode) acc.push(referencedNode)
      return acc
    }, [])
  }

  // Handle single reference
  const referencedNode = extractReferencedNode(fieldValue)
  return referencedNode ? [referencedNode] : []
}

/**
 * Extract referenced nodes from a field with registry support for HandleRefId objects
 * @param fieldValue - Value of the field (can be node, array of nodes, or link object)
 * @param nodeRegistry - Map of nodes by HandleId for resolving HandleRefId references
 * @returns Array of referenced nodes
 */
export function extractReferencedNodesFromFieldWithRegistry(
  fieldValue: any, 
  nodeRegistry: Map<string, AnimgraphNode>
): AnimgraphNode[] {
  // Handle array of references
  if (Array.isArray(fieldValue)) {
    return fieldValue.reduce((acc: AnimgraphNode[], item: any) => {
      const referencedNode = extractReferencedNodeWithRegistry(item, nodeRegistry)
      if (referencedNode) acc.push(referencedNode)
      return acc
    }, [])
  }

  // Handle single reference
  const referencedNode = extractReferencedNodeWithRegistry(fieldValue, nodeRegistry)
  return referencedNode ? [referencedNode] : []
}

/**
 * Extract referenced node from reference object with registry support for HandleRefId
 * @param reference - Reference object containing node definition or link
 * @param nodeRegistry - Map of nodes by HandleId for resolving HandleRefId references
 * @returns Referenced node if found, null otherwise
 */
export function extractReferencedNodeWithRegistry(
  reference: any, 
  nodeRegistry: Map<string, AnimgraphNode>
): AnimgraphNode | null {
  if (!reference) return null

  // Handle link objects (e.g., animPoseLink, animFloatLink, etc.)
  if (reference.$type && reference.node) {
    const nodeData = reference.node
    
    // If node contains HandleRefId, find it in registry
    if (nodeData.HandleRefId && nodeData.HandleRefId !== '-1' && nodeData.HandleRefId !== '0') {
      const registryNode = nodeRegistry.get(nodeData.HandleRefId)
      if (registryNode) {
        return registryNode
      }
    }
    
    // If node contains HandleId directly, use it
    if (nodeData.HandleId && nodeData.HandleId !== '-1' && nodeData.HandleId !== '0') {
      return {
        HandleId: nodeData.HandleId,
        Data: nodeData
      }
    }
  }

  // Handle HandleRefId objects directly - find node in registry
  if (reference.HandleRefId && reference.HandleRefId !== '-1' && reference.HandleRefId !== '0') {
    const registryNode = nodeRegistry.get(reference.HandleRefId)
    if (registryNode) {
      return registryNode
    }
  }

  // Use the same logic as the original extractReferencedNode
  return extractReferencedNode(reference)
}
