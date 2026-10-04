import type { AnimgraphNode } from '../graph/animgraphTypes'

export interface NodeInputHandler {
  count: (node: AnimgraphNode) => number
  get: (node: AnimgraphNode, index?: number) => any
  set: (node: AnimgraphNode, data: any, index?: number) => void
  delete: (node: AnimgraphNode, index?: number) => void
  /** Wire disconnect: clear nested link only, keep array slot (MathExpression sockets). */
  clearLink?: (node: AnimgraphNode, index?: number) => boolean
}

export interface NodeChildHandler {
  ensureOrder: (
    handlesRegistry: Map<string, AnimgraphNode>,
    node: AnimgraphNode,
    propName: string
  ) => void
}
