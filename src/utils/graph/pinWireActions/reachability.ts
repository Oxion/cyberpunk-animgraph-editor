import type { AnimgraphNode } from '../animgraphTypes'
import type { RenderData } from '../diagramTypes'
import { NodeDefinitionRegistry } from '../../NodeDefinition'
import { isAnimgraphLinkObject, isAnimgraphNodeLikeObject } from '../../extractors/NodeReferenceUtils'

function resolveHandleId(value: unknown, registry: Map<string, AnimgraphNode>): string | null {
  if (typeof value === 'string') return registry.has(value) ? value : null
  if (!value || typeof value !== 'object') return null
  if ('HandleRefId' in value && typeof (value as { HandleRefId: unknown }).HandleRefId === 'string') {
    const id = (value as { HandleRefId: string }).HandleRefId
    return registry.has(id) ? id : null
  }
  if ('HandleId' in value && typeof (value as { HandleId: unknown }).HandleId === 'string') {
    const id = String((value as { HandleId: string }).HandleId)
    return registry.has(id) ? id : null
  }
  return null
}

function walkValue(
  value: unknown,
  registry: Map<string, AnimgraphNode>,
  visitHandle: (id: string) => void,
  visitInlineType: (typeName: string, data: Record<string, unknown>) => void
): void {
  if (value == null) return
  if (typeof value === 'string') {
    const id = resolveHandleId(value, registry)
    if (id) visitHandle(id)
    return
  }
  if (typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) walkValue(item, registry, visitHandle, visitInlineType)
    return
  }
  if (isAnimgraphLinkObject(value)) {
    walkValue(value.node, registry, visitHandle, visitInlineType)
    return
  }
  if (isAnimgraphNodeLikeObject(value)) {
    const id = resolveHandleId(value, registry)
    if (id) {
      visitHandle(id)
      return
    }
  }
  const rec = value as Record<string, unknown>
  if (typeof rec.$type === 'string') {
    visitInlineType(rec.$type, rec)
  }
}

/**
 * BFS from nodesToInit via contain + pin HandleRefs (+ nested inline $type fields).
 */
export function collectReachableHandleIds(renderData: RenderData): Set<string> {
  const registry = renderData.handlesRegistry
  const reachable = new Set<string>()
  const queue: string[] = []

  const enqueue = (id: string) => {
    if (reachable.has(id)) return
    reachable.add(id)
    queue.push(id)
  }

  for (const ref of renderData.originalAnimgraph?.nodesToInit ?? []) {
    const id =
      typeof ref === 'object' && ref && 'HandleRefId' in ref
        ? String((ref as { HandleRefId: string }).HandleRefId)
        : null
    if (id && registry.has(id)) enqueue(id)
  }

  const visitData = (typeName: string, data: Record<string, unknown>) => {
    const fields = new Set([
      ...NodeDefinitionRegistry.getChildFields(typeName),
      ...NodeDefinitionRegistry.getInputFields(typeName),
    ])
    for (const field of fields) {
      walkValue(
        data[field],
        registry,
        enqueue,
        (inlineType, inlineData) => visitData(inlineType, inlineData)
      )
    }
  }

  while (queue.length > 0) {
    const id = queue.shift()!
    const handle = registry.get(id)
    if (!handle?.Data) continue
    const typeName = String(handle.Data.$type ?? '')
    if (!typeName) continue
    visitData(typeName, handle.Data as Record<string, unknown>)
  }

  return reachable
}

export function isHandleReachableFromNodesToInit(
  renderData: RenderData,
  handleId: string
): boolean {
  return collectReachableHandleIds(renderData).has(handleId)
}

/** After wiring consumer, is the from-handle reachable (consumer path from init)? */
export function isConsumerReachable(
  renderData: RenderData,
  consumerHandleId: string
): boolean {
  return isHandleReachableFromNodesToInit(renderData, consumerHandleId)
}
