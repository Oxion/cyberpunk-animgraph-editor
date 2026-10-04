import type { AnimgraphNode, AnimgraphNodeLike } from '../graph/animgraphTypes'

export class MathExpressionNodeDataInputsHandler {
  private socketsPropName: string

  private socketsPropObjectType: string

  constructor(socketsPropName: string, socketsPropObjectType: string) {
    this.socketsPropName = socketsPropName
    this.socketsPropObjectType = socketsPropObjectType
  }

  count(node: AnimgraphNode): number {
    const expressionData = node.Data.expressionData
    if (!expressionData || expressionData.$type !== 'animMathExpressionNodeData') {
      return 0
    }

    const sockets = expressionData[this.socketsPropName]
    if (!sockets || !Array.isArray(sockets)) {
      return 0
    }

    return sockets.length
  }

  get(node: AnimgraphNode, index?: number): AnimgraphNodeLike | null {
    if (index === undefined) {
      throw new Error('Index is required')
    }

    const expressionData = node.Data.expressionData
    if (!expressionData || expressionData.$type !== 'animMathExpressionNodeData') {
      return null
    }

    const sockets = expressionData[this.socketsPropName]
    if (!sockets) {
      return null
    }

    const socket = sockets[index]
    if (!socket || socket.$type !== this.socketsPropObjectType) {
      return null
    }

    return socket.link.node
  }

  set(node: AnimgraphNode, data: AnimgraphNodeLike, index?: number): void {
    if(index === undefined) {
      throw new Error('Index is required')
    }

    let expressionData = node.Data.expressionData
    if (!expressionData) {
      expressionData = node.Data.expressionData = {
        $type: 'animMathExpressionNodeData',
        floatSockets: [],
        quaternionSockets: [],
        vectorSockets: [],
      }
    }

    let sockets = expressionData[this.socketsPropName]
    if (!sockets) {
      sockets = expressionData[this.socketsPropName] = []
    }

    let socket = sockets[index]
    if (!socket) {
      socket = sockets[index] = {
        $type: this.socketsPropObjectType,
        link: {
          node: data,
        },
      }
    } else {
      socket.link.node = data
    }
  }

  delete(node: AnimgraphNode, index?: number): void {
    if (index === undefined) {
      throw new Error('Index is required')
    }

    const expressionData = node.Data.expressionData
    if (!expressionData || expressionData.$type !== 'animMathExpressionNodeData') {
      return
    }

    const sockets = expressionData[this.socketsPropName]
    if (!sockets) {
      return
    }

    sockets.splice(index, 1)
  }

  clearLink(node: AnimgraphNode, index?: number): boolean {
    if (index === undefined) {
      throw new Error('Index is required')
    }

    const expressionData = node.Data.expressionData
    if (!expressionData || expressionData.$type !== 'animMathExpressionNodeData') {
      return false
    }

    const sockets = expressionData[this.socketsPropName]
    if (!sockets || !Array.isArray(sockets)) {
      return false
    }

    const socket = sockets[index]
    if (!socket?.link || typeof socket.link !== 'object') {
      return false
    }
    if (socket.link.node == null) return false
    socket.link.node = null
    return true
  }
}

export class MathExpressionNodeInputsHandler extends MathExpressionNodeDataInputsHandler {
  private objectType: string

  constructor(socketsPropName: string, socketsPropObjectType: string, objectType: string) {
    super(socketsPropName, socketsPropObjectType)
    this.objectType = objectType
  }

  count(node: AnimgraphNode): number {
    if (!node || node.Data.$type !== this.objectType) {
      return 0
    }

    return super.count(node)
  }

  get(node: AnimgraphNode, index?: number): AnimgraphNodeLike | null {
    if (!node || node.Data.$type !== this.objectType) {
      return null
    }

    return super.get(node, index)
  }

  set(node: AnimgraphNode, data: AnimgraphNodeLike, index?: number): void {
    if (!node || node.Data.$type !== this.objectType) {
      return
    }

    super.set(node, data, index)
  }

  delete(node: AnimgraphNode, index?: number): void {
    if (!node || node.Data.$type !== this.objectType) {
      return
    }

    super.delete(node, index)
  }
}