/**
 * Walk HandleRef topology on handle Data + document-level animgraph refs.
 * Used for inbound counts and strip-on-delete — not projection roles.
 */

import { isAnimgraphLinkObject, isAnimgraphNodeLikeObject } from '../../extractors/NodeReferenceUtils'
import { NodeDefinitionRegistry } from '../../NodeDefinition'
import type { AnimgraphNode, AnimgraphNodeLike } from '../animgraphTypes'
import type { AnimgraphMutationCtx } from './ctx'

export function handleRefIdOf(value: unknown): string | null {
  if (value == null || typeof value !== 'object') return null
  if ('HandleRefId' in value && typeof (value as { HandleRefId: unknown }).HandleRefId === 'string') {
    return String((value as { HandleRefId: string }).HandleRefId)
  }
  if ('HandleId' in value && typeof (value as { HandleId: unknown }).HandleId === 'string') {
    const id = String((value as { HandleId: string }).HandleId)
    return id.length > 0 ? id : null
  }
  return null
}

export function isHandleRef(value: unknown): value is { HandleRefId: string } {
  return handleRefIdOf(value) != null && typeof value === 'object' && value != null && 'HandleRefId' in value
}

export function walkValue(value: unknown, visit: (id: string) => void): void {
  if (value == null) return
  if (typeof value === 'string') return
  if (typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) walkValue(item, visit)
    return
  }
  if (isAnimgraphLinkObject(value)) {
    walkValue(value.node, visit)
    return
  }
  const id = handleRefIdOf(value)
  if (id && isAnimgraphNodeLikeObject(value)) {
    visit(id)
    return
  }
  const rec = value as Record<string, unknown>
  if (typeof rec.$type === 'string') {
    for (const key of Object.keys(rec)) {
      if (key === '$type') continue
      walkValue(rec[key], visit)
    }
  }
}

/** Visit HandleRef ids stored under the given Data fields (and nested inline). */
export function walkHandleFieldRefs(
  handle: AnimgraphNode,
  fields: readonly string[],
  visit: (id: string) => void
): void {
  if (!handle.Data || fields.length === 0) return
  const data = handle.Data as Record<string, unknown>
  for (const field of fields) {
    walkValue(data[field], visit)
  }
}

export function collectHandleFieldRefs(
  handle: AnimgraphNode,
  fields: readonly string[]
): Set<string> {
  const out = new Set<string>()
  walkHandleFieldRefs(handle, fields, (id) => out.add(id))
  return out
}

/** Visit HandleRef ids stored under known contain + pin fields (and nested inline). */
export function walkHandleDataRefs(
  handle: AnimgraphNode,
  visit: (id: string) => void
): void {
  if (!handle.Data) return
  const typeName = String(handle.Data.$type ?? '')
  if (!typeName) return
  const fields = [
    ...NodeDefinitionRegistry.getChildFields(typeName),
    ...NodeDefinitionRegistry.getInputFields(typeName),
  ]
  walkHandleFieldRefs(handle, fields, visit)
}

export function collectHandleDataRefs(handle: AnimgraphNode): Set<string> {
  const out = new Set<string>()
  walkHandleDataRefs(handle, (id) => out.add(id))
  return out
}

function walkDocumentRefs(animgraph: AnimgraphMutationCtx['animgraph'], visit: (id: string) => void): void {
  const rootId = handleRefIdOf(animgraph.rootNode)
  if (rootId) visit(rootId)
}

/**
 * Count HandleRefs pointing at target (pin outbound uses + contain + rootNode).
 * Zero ⇒ floating candidate (not nodesToInit — that is export-only).
 */
export function countInboundHandleRefs(
  ctx: AnimgraphMutationCtx,
  targetId: string
): number {
  let count = 0
  const visit = (id: string) => {
    if (id === targetId) count++
  }
  walkDocumentRefs(ctx.animgraph, visit)
  for (const [ownerId, handle] of ctx.handlesRegistry) {
    if (ownerId === targetId) continue
    walkHandleDataRefs(handle, visit)
  }
  return count
}

/** Visit HandleRef ids under pin/input fields only (not contain/child). */
export function walkHandlePinRefs(
  handle: AnimgraphNode,
  visit: (id: string) => void
): void {
  if (!handle.Data) return
  const typeName = String(handle.Data.$type ?? '')
  if (!typeName) return
  walkHandleFieldRefs(
    handle,
    NodeDefinitionRegistry.getInputFields(typeName),
    visit
  )
}

/**
 * Count pin/input HandleRefs pointing at target.
 * Does not count contain/child fields or document rootNode.
 */
export function countInboundPinHandleRefs(
  ctx: AnimgraphMutationCtx,
  targetId: string
): number {
  let count = 0
  const visit = (id: string) => {
    if (id === targetId) count++
  }
  for (const [ownerId, handle] of ctx.handlesRegistry) {
    if (ownerId === targetId) continue
    walkHandlePinRefs(handle, visit)
  }
  return count
}

export type StripInboundFieldChange = {
  ownerId: string
  field: string
  removedIndices: number[]
  removedIds: string[]
}

/**
 * Remove all HandleRefs pointing at `targetIds` from surviving owners + document.
 * Array slots splice; nested link nodes cleared; scalar fields deleted.
 * @returns per-owner field changes (HandleRef array removals) for side effects.
 */
export function stripInboundHandleRefs(
  ctx: AnimgraphMutationCtx,
  targetIds: ReadonlySet<string>
): StripInboundFieldChange[] {
  if (targetIds.size === 0) return []

  const rootId = handleRefIdOf(ctx.animgraph.rootNode)
  if (rootId && targetIds.has(rootId)) {
    // Root delete is diagram-forbidden; leave rootNode if somehow requested.
  }

  const changes: StripInboundFieldChange[] = []

  for (const [ownerId, handle] of ctx.handlesRegistry) {
    if (targetIds.has(ownerId)) continue
    if (!handle.Data) continue
    const typeName = String(handle.Data.$type ?? '')
    if (!typeName) continue
    const fields = new Set([
      ...NodeDefinitionRegistry.getChildFields(typeName),
      ...NodeDefinitionRegistry.getInputFields(typeName),
    ])
    const data = handle.Data as Record<string, unknown>
    for (const field of fields) {
      const stripped = stripFieldRefs(data, field, targetIds)
      if (stripped) {
        changes.push({ ownerId, field, ...stripped })
      }
    }
  }
  return changes
}

function stripFieldRefs(
  data: Record<string, unknown>,
  field: string,
  targetIds: ReadonlySet<string>
): { removedIndices: number[]; removedIds: string[] } | null {
  const value = data[field]
  if (value == null) return null

  if (Array.isArray(value)) {
    const next: unknown[] = []
    const removedIndices: number[] = []
    const removedIds: string[] = []
    let linkCleared = false
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      if (isAnimgraphLinkObject(item)) {
        const id = handleRefIdOf(item.node)
        if (id && targetIds.has(id)) {
          item.node = null
          linkCleared = true
        }
        next.push(item)
        continue
      }
      const id = handleRefIdOf(item)
      if (id && targetIds.has(id)) {
        removedIndices.push(i)
        removedIds.push(id)
        continue
      }
      next.push(item)
    }
    if (removedIndices.length > 0 || linkCleared) data[field] = next
    if (removedIndices.length === 0) return null
    return { removedIndices, removedIds }
  }

  if (isAnimgraphLinkObject(value)) {
    clearNestedLinkTargets(value, targetIds)
    return null
  }
  const id = handleRefIdOf(value)
  if (id && targetIds.has(id)) {
    delete data[field]
    return { removedIndices: [-1], removedIds: [id] }
  }
  return null
}

function clearNestedLinkTargets(item: unknown, targetIds: ReadonlySet<string>): void {
  if (!isAnimgraphLinkObject(item)) return
  const id = handleRefIdOf(item.node)
  if (id && targetIds.has(id)) {
    item.node = null
  }
}

export function asHandleRef(id: string): AnimgraphNodeLike {
  return { HandleRefId: id }
}

function rewriteValueRefIds(value: unknown, oldId: string, newId: string): void {
  if (value == null || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) rewriteValueRefIds(item, oldId, newId)
    return
  }
  if (isAnimgraphLinkObject(value)) {
    rewriteValueRefIds(value.node, oldId, newId)
    return
  }
  const rec = value as Record<string, unknown>
  if ('HandleRefId' in rec && String(rec.HandleRefId) === oldId) {
    rec.HandleRefId = newId
  }
  if (typeof rec.$type === 'string') {
    for (const key of Object.keys(rec)) {
      if (key === '$type' || key === 'HandleRefId') continue
      rewriteValueRefIds(rec[key], oldId, newId)
    }
  } else {
    for (const key of Object.keys(rec)) {
      if (key === 'HandleRefId') continue
      rewriteValueRefIds(rec[key], oldId, newId)
    }
  }
}

/** Rewrite all HandleRefId occurrences of oldId → newId (Data + document + nodesToInit). */
export function rewriteHandleRefIds(
  ctx: AnimgraphMutationCtx,
  oldId: string,
  newId: string
): void {
  if (handleRefIdOf(ctx.animgraph.rootNode) === oldId) {
    ctx.animgraph.rootNode = asHandleRef(newId)
  }
  for (const ref of ctx.animgraph.nodesToInit ?? []) {
    if (
      ref &&
      typeof ref === 'object' &&
      'HandleRefId' in ref &&
      String((ref as { HandleRefId: string }).HandleRefId) === oldId
    ) {
      ;(ref as { HandleRefId: string }).HandleRefId = newId
    }
  }
  for (const handle of ctx.handlesRegistry.values()) {
    if (!handle.Data) continue
    rewriteValueRefIds(handle.Data, oldId, newId)
  }
}
