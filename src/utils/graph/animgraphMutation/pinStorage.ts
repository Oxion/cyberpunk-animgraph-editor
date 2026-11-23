/**
 * Animgraph pin storage — raw Data addressing for top-level and nested pins.
 * Public writes go through setPinSlot / clearHandleRef (gates + effects).
 */

import { generateDataTemplate } from '../../animFieldSchema'
import { isAnimgraphLinkObject } from '../../extractors/NodeReferenceUtils'
import { PROJECTION_DEFINITIONS } from '../../projection/definitions'
import type { NestedPinSpec } from '../../projection/types'
import type { AnimgraphNode, AnimgraphNodeLike } from '../animgraphTypes'

function getExtraPinByName(
  ownerType: string,
  pinName: string
): NestedPinSpec | undefined {
  return PROJECTION_DEFINITIONS[ownerType]?.extraPins?.find((p) => p.name === pinName)
}

function getAtPath(root: Record<string, unknown>, path: readonly string[]): unknown {
  let cur: unknown = root
  for (const key of path) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

function ensureParentsAtPath(
  data: Record<string, unknown>,
  path: readonly string[],
  containerType?: string
): Record<string, unknown> {
  let cur: Record<string, unknown> = data
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!
    let next = cur[key]
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      next = containerType ? { $type: containerType } : {}
      cur[key] = next
    }
    cur = next as Record<string, unknown>
  }
  return cur
}

function ensureArrayAtPath(
  data: Record<string, unknown>,
  spec: NestedPinSpec
): unknown[] {
  const path = spec.path
  const cur = ensureParentsAtPath(data, path, spec.containerType)
  const last = path[path.length - 1]!
  let arr = cur[last]
  if (!Array.isArray(arr)) {
    arr = []
    cur[last] = arr
  }
  return arr as unknown[]
}

function ensureScalarLinkAtPath(
  data: Record<string, unknown>,
  spec: NestedPinSpec
): Record<string, unknown> {
  const path = spec.path
  const cur = ensureParentsAtPath(data, path, spec.containerType)
  const last = path[path.length - 1]!
  let link = cur[last]
  if (!link || typeof link !== 'object' || Array.isArray(link)) {
    link = spec.linkType ? { $type: spec.linkType, node: null } : { node: null }
    cur[last] = link
  }
  return link as Record<string, unknown>
}

export type PinStorageOps = {
  count: (node: AnimgraphNode) => number
  get: (node: AnimgraphNode, index?: number) => unknown
  set: (node: AnimgraphNode, data: unknown, index?: number) => void
  delete: (node: AnimgraphNode, index?: number) => void
  clearLink?: (node: AnimgraphNode, index?: number) => boolean
}

function topLevelOps(pinName: string): PinStorageOps {
  return {
    count(node) {
      const value = node.Data[pinName]
      return Array.isArray(value) ? value.length : 1
    },
    get(node, index) {
      const inputValue = node.Data[pinName]
      const value = Array.isArray(inputValue)
        ? inputValue[index ?? 0]
        : inputValue
      if (isAnimgraphLinkObject(value)) {
        return value.node
      }
      return value
    },
    set(node, data, index) {
      const inputValue = node.Data[pinName]
      if (Array.isArray(inputValue)) {
        const idx = index ?? 0
        const slot = inputValue[idx]
        if (slot != null && isAnimgraphLinkObject(slot)) {
          slot.node = data as AnimgraphNodeLike | null
        } else {
          inputValue[idx] = data
        }
        return
      }
      if (inputValue == null) {
        if (index != null && index >= 0) {
          const arr: unknown[] = []
          arr[index] = data
          node.Data[pinName] = arr
          return
        }
        if (data != null) {
          node.Data[pinName] = data
        }
        return
      }
      if (isAnimgraphLinkObject(inputValue)) {
        inputValue.node = data as AnimgraphNodeLike | null
      } else {
        node.Data[pinName] = data
      }
    },
    delete(node, index) {
      const inputValue = node.Data[pinName]
      if (Array.isArray(inputValue)) {
        if (index !== undefined && index >= 0 && index < inputValue.length) {
          inputValue.splice(index, 1)
        }
      } else {
        this.set(node, null, index)
      }
    },
  }
}

function nestedArrayOps(spec: NestedPinSpec): PinStorageOps {
  const linkKey = spec.linkKey ?? 'link'
  const elementType = spec.elementType
  if (!elementType) {
    throw new Error(`nested pin "${spec.name}" requires elementType`)
  }
  return {
    count(node) {
      const arr = getAtPath(node.Data as Record<string, unknown>, spec.path)
      return Array.isArray(arr) ? arr.length : 0
    },
    get(node, index) {
      if (index === undefined) throw new Error('Index is required')
      const arr = getAtPath(node.Data as Record<string, unknown>, spec.path)
      if (!Array.isArray(arr)) return null
      const el = arr[index] as Record<string, unknown> | undefined
      if (!el || typeof el !== 'object') return null
      const link = el[linkKey]
      if (link && typeof link === 'object' && 'node' in link) {
        return (link as { node: AnimgraphNodeLike | null }).node
      }
      return null
    },
    set(node, data, index) {
      if (index === undefined) throw new Error('Index is required')
      const arr = ensureArrayAtPath(node.Data as Record<string, unknown>, spec)
      let el = arr[index] as Record<string, unknown> | undefined
      if (!el || typeof el !== 'object') {
        el = generateDataTemplate(elementType) ?? { $type: elementType }
        el.expressionVarId = index
        arr[index] = el
      }
      let link = el[linkKey] as Record<string, unknown> | undefined
      if (!link || typeof link !== 'object') {
        link = spec.linkType
          ? { $type: spec.linkType, node: data }
          : { node: data }
        el[linkKey] = link
      } else {
        link.node = data
      }
    },
    delete(node, index) {
      if (index === undefined) throw new Error('Index is required')
      const arr = getAtPath(node.Data as Record<string, unknown>, spec.path)
      if (!Array.isArray(arr)) return
      if (index >= 0 && index < arr.length) arr.splice(index, 1)
    },
    clearLink(node, index) {
      if (index === undefined) throw new Error('Index is required')
      const arr = getAtPath(node.Data as Record<string, unknown>, spec.path)
      if (!Array.isArray(arr)) return false
      const el = arr[index] as Record<string, unknown> | undefined
      if (!el || typeof el !== 'object') return false
      const link = el[linkKey]
      if (!link || typeof link !== 'object' || !('node' in link)) return false
      if ((link as { node: unknown }).node == null) return false
      ;(link as { node: unknown }).node = null
      return true
    },
  }
}

function nestedScalarOps(spec: NestedPinSpec): PinStorageOps {
  return {
    count() {
      return 1
    },
    get(node) {
      const link = getAtPath(node.Data as Record<string, unknown>, spec.path)
      if (link && typeof link === 'object' && 'node' in link) {
        return (link as { node: AnimgraphNodeLike | null }).node
      }
      return null
    },
    set(node, data) {
      const link = ensureScalarLinkAtPath(node.Data as Record<string, unknown>, spec)
      link.node = data
    },
    delete(node) {
      const link = getAtPath(node.Data as Record<string, unknown>, spec.path)
      if (link && typeof link === 'object' && 'node' in link) {
        ;(link as { node: unknown }).node = null
      }
    },
    clearLink(node) {
      const link = getAtPath(node.Data as Record<string, unknown>, spec.path)
      if (!link || typeof link !== 'object' || !('node' in link)) return false
      if ((link as { node: unknown }).node == null) return false
      ;(link as { node: unknown }).node = null
      return true
    },
  }
}

/** Resolve storage ops for a pin name on ownerType (top-level or nested extraPin). */
export function resolvePinStorage(
  ownerType: string,
  pinName: string
): PinStorageOps | null {
  if (!ownerType || !pinName) return null
  const nested = getExtraPinByName(ownerType, pinName)
  if (nested) {
    return nested.elementType ? nestedArrayOps(nested) : nestedScalarOps(nested)
  }
  return topLevelOps(pinName)
}
