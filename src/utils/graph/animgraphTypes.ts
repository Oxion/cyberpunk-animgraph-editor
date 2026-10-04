/**
 * Raw Cyberpunk 2077 animgraph JSON shapes (handles / Data).
 * Diagram model types live in `diagramModel.ts`.
 */

export interface AnimgraphObject {
  $type: string
  [key: string]: any
}

export interface AnimgraphLinkObject extends AnimgraphObject {
  node: AnimgraphNodeLike | null
}

export interface AnimgraphNode {
  HandleId: string
  Data: AnimgraphObject
}

export interface AnimgraphNodeReference {
  HandleRefId: string
}

export type AnimgraphNodeLike = AnimgraphNode | AnimgraphNodeReference

export interface AnimgraphData {
  nodesToInit: AnimgraphNodeLike[]
  rootNode: AnimgraphNodeLike
  [key: string]: any
}
