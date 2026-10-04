import type { AnimgraphNode, AnimgraphNodeLike } from '../graph/animgraphTypes'
import { isAnimgraphLinkObject } from "./NodeReferenceUtils"

export class DefaultNodeInputsHandler {

  static count(inputName: string, node: AnimgraphNode): number {
    const value = node.Data[inputName]
    return Array.isArray(value) ? value.length : 1
  }

  static get(inputName: string, node: AnimgraphNode, index?: number): AnimgraphNodeLike | null {
    const inputValue = node.Data[inputName]
    
    const value = Array.isArray(inputValue) 
      ? inputValue[index ?? 0] 
      : inputValue

    if (isAnimgraphLinkObject(value)) {
      return value.node
    } else {
      return value
    }
  }

  static set(inputName: string, node: AnimgraphNode, data: AnimgraphNodeLike | null, index?: number): void {
    const inputValue = node.Data[inputName]

    if (Array.isArray(inputValue)) {
      const idx = index ?? 0
      const slot = inputValue[idx]
      if (slot != null && isAnimgraphLinkObject(slot)) {
        slot.node = data
      } else {
        inputValue[idx] = data
      }
      return
    }

    if (inputValue == null) {
      if (index != null && index >= 0) {
        const arr: unknown[] = []
        arr[index] = data
        node.Data[inputName] = arr
        return
      }
      if (data != null) {
        node.Data[inputName] = data
      }
      return
    }

    if (isAnimgraphLinkObject(inputValue)) {
      inputValue.node = data
    } else {
      node.Data[inputName] = data
    }
  }

  static delete(inputName: string, node: AnimgraphNode, index?: number): void {
    const inputValue = node.Data[inputName]
    if (Array.isArray(inputValue)) {
      if (index !== undefined && index >= 0 && index < inputValue.length) {
        inputValue.splice(index, 1)
      }
    } else {
      this.set(inputName, node, null)
    }
  }
}