import type { AnimgraphNode, AnimgraphNodeLike } from '../graph/animgraphTypes'
import type { NodeInputHandler } from '../animNodes/handlers'
import { generateDataTemplate } from '../animFieldSchema'
import type { NestedPinSpec } from './types'

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

export function nestedLinkArrayHandler(spec: NestedPinSpec): NodeInputHandler {
  const linkKey = spec.linkKey ?? 'link'
  const elementType = spec.elementType
  if (!elementType) {
    throw new Error(`nestedLinkArrayHandler requires elementType for pin "${spec.name}"`)
  }

  return {
    count(node: AnimgraphNode): number {
      const arr = getAtPath(node.Data as Record<string, unknown>, spec.path)
      return Array.isArray(arr) ? arr.length : 0
    },

    get(node: AnimgraphNode, index?: number): AnimgraphNodeLike | null {
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

    set(node: AnimgraphNode, data: AnimgraphNodeLike, index?: number): void {
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
        link = spec.linkType ? { $type: spec.linkType, node: data } : { node: data }
        el[linkKey] = link
      } else {
        link.node = data
      }
    },

    delete(node: AnimgraphNode, index?: number): void {
      if (index === undefined) throw new Error('Index is required')
      const arr = getAtPath(node.Data as Record<string, unknown>, spec.path)
      if (!Array.isArray(arr)) return
      if (index >= 0 && index < arr.length) arr.splice(index, 1)
    },

    clearLink(node: AnimgraphNode, index?: number): boolean {
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

/** Scalar nested link at `path` (e.g. Data.particlesContainer.externalForceWsLink.node). */
export function nestedLinkScalarHandler(spec: NestedPinSpec): NodeInputHandler {
  return {
    count(_node: AnimgraphNode): number {
      return 1
    },

    get(node: AnimgraphNode, _index?: number): AnimgraphNodeLike | null {
      const link = getAtPath(node.Data as Record<string, unknown>, spec.path)
      if (link && typeof link === 'object' && 'node' in link) {
        return (link as { node: AnimgraphNodeLike | null }).node
      }
      return null
    },

    set(node: AnimgraphNode, data: AnimgraphNodeLike, _index?: number): void {
      const link = ensureScalarLinkAtPath(node.Data as Record<string, unknown>, spec)
      link.node = data
    },

    delete(node: AnimgraphNode, _index?: number): void {
      const link = getAtPath(node.Data as Record<string, unknown>, spec.path)
      if (link && typeof link === 'object' && 'node' in link) {
        ;(link as { node: unknown }).node = null
      }
    },

    clearLink(node: AnimgraphNode, _index?: number): boolean {
      const link = getAtPath(node.Data as Record<string, unknown>, spec.path)
      if (!link || typeof link !== 'object' || !('node' in link)) return false
      if ((link as { node: unknown }).node == null) return false
      ;(link as { node: unknown }).node = null
      return true
    },
  }
}
