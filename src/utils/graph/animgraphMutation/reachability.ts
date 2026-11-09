import { isAnimgraphLinkObject, isAnimgraphNodeLikeObject } from '../../extractors/NodeReferenceUtils'
import { NodeDefinitionRegistry } from '../../NodeDefinition'
import type { AnimgraphNode, AnimgraphNodeLike } from '../animgraphTypes'
import type { AnimgraphMutationCtx } from './ctx'
import { handleRefIdOf } from './refWalk'

function resolveHandleId(
  value: unknown,
  registry: Map<string, AnimgraphNode>
): string | null {
  if (typeof value === 'string') return registry.has(value) ? value : null
  const id = handleRefIdOf(value)
  return id && registry.has(id) ? id : null
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
 * BFS from document rootNode via contain + pin HandleRefs (+ nested inline $type fields).
 * Used for export nodesToInit and editor "on root tree" checks — not floating.
 */
export function collectHandlesReachableFromRoot(
  ctx: AnimgraphMutationCtx
): Set<string> {
  const registry = ctx.handlesRegistry
  const reachable = new Set<string>()
  const queue: string[] = []

  const enqueue = (id: string) => {
    if (reachable.has(id)) return
    reachable.add(id)
    queue.push(id)
  }

  const rootId = handleRefIdOf(ctx.animgraph.rootNode)
  if (rootId && registry.has(rootId)) enqueue(rootId)

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

export function isHandleReachableFromRoot(
  ctx: AnimgraphMutationCtx,
  handleId: string
): boolean {
  return collectHandlesReachableFromRoot(ctx).has(handleId)
}

/** Export wrap: root-reachable initable handles. */
export function buildNodesToInitFromRoot(
  ctx: AnimgraphMutationCtx
): AnimgraphNodeLike[] {
  const out: AnimgraphNodeLike[] = []
  for (const id of collectHandlesReachableFromRoot(ctx)) {
    const handle = ctx.handlesRegistry.get(id)
    const nodeType = String(handle?.Data?.$type ?? '')
    if (!nodeType || !NodeDefinitionRegistry.isNodesToInitType(nodeType)) continue
    out.push({ HandleRefId: id })
  }
  return out
}
