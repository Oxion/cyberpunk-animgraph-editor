/**
 * Animgraph HandleRef CRUD + topology consistency.
 * Projection/handlers choose write shape at call sites; this layer does not.
 */

import { NodeDefinitionRegistry } from '../../NodeDefinition'
import type { AnimgraphNode, AnimgraphObject } from '../animgraphTypes'
import type { AnimgraphMutationCtx } from './ctx'
import { afterHandleRefRemoved } from './consistency'
import { applyOwnerFieldEffects } from './fieldEffects'
import {
  asHandleRef,
  collectHandleDataRefs,
  collectHandleFieldRefs,
  handleRefIdOf,
  isHandleRef,
  rewriteHandleRefIds,
  stripInboundHandleRefs,
} from './refWalk'

function reconcileOutboundRefs(
  ctx: AnimgraphMutationCtx,
  _ownerId: string,
  before: ReadonlySet<string>,
  after: ReadonlySet<string>
): void {
  for (const id of before) {
    if (!after.has(id)) afterHandleRefRemoved(ctx, id)
  }
}

function ownerTypeOf(owner: AnimgraphNode): string {
  return String(owner.Data?.$type ?? '')
}

function resolveArrayOrScalar(
  owner: AnimgraphNode,
  field: string
): 'array' | 'scalar' {
  const existing = owner.Data?.[field]
  if (Array.isArray(existing)) return 'array'
  if (isHandleRef(existing)) return 'scalar'
  const parentType = ownerTypeOf(owner)
  const slot = NodeDefinitionRegistry.getChildSlot(
    NodeDefinitionRegistry.getNodeDefinition(parentType),
    field,
    parentType
  )
  return slot?.kind ?? 'array'
}

/** Registry only — never touches nodesToInit. */
export function createHandle(
  ctx: AnimgraphMutationCtx,
  id: string,
  data: AnimgraphObject
): AnimgraphNode {
  const node: AnimgraphNode = { HandleId: id, Data: data }
  ctx.handlesRegistry.set(id, node)
  return node
}

export type DeleteHandlesResult = {
  deleted: string[]
}

/**
 * Strip inbound refs, registry delete. nodesToInit is export-only (not live).
 */
export function deleteHandles(
  ctx: AnimgraphMutationCtx,
  ids: readonly string[]
): DeleteHandlesResult {
  const idSet = new Set(ids.filter((id) => ctx.handlesRegistry.has(id)))
  if (idSet.size === 0) return { deleted: [] }

  // Strip while targets still in registry so SM remaps can update survivors.
  const stripChanges = stripInboundHandleRefs(ctx, idSet)
  for (const change of stripChanges) {
    applyOwnerFieldEffects(ctx, change.ownerId, [
      {
        field: change.field,
        removedIndices: change.removedIndices,
        removedIds: change.removedIds,
      },
    ])
  }

  const deleted: string[] = []
  for (const id of idSet) {
    ctx.handlesRegistry.delete(id)
    deleted.push(id)
  }
  return { deleted }
}

export type AddHandleRefsResult = {
  added: string[]
  ok: true
} | {
  ok: false
  message: string
  added: string[]
}

/**
 * Batch-add HandleRefs on owner.Data[field] (array push / scalar set).
 * Floating clear is diagram-layer (caller).
 */
export function addHandleRefs(
  ctx: AnimgraphMutationCtx,
  ownerId: string,
  field: string,
  memberIds: readonly string[]
): AddHandleRefsResult {
  const owner = ctx.handlesRegistry.get(ownerId)
  if (!owner?.Data) {
    return { ok: false, message: 'Owner handle has no Data', added: [] }
  }
  const kind = resolveArrayOrScalar(owner, field)
  const added: string[] = []

  if (kind === 'scalar') {
    if (memberIds.length > 1) {
      return {
        ok: false,
        message: `${ownerTypeOf(owner)}.${field} is scalar — single member only`,
        added: [],
      }
    }
    const memberId = memberIds[0]
    if (!memberId) return { ok: true, added: [] }
    const existing = owner.Data[field]
    if (existing == null) {
      owner.Data[field] = asHandleRef(memberId)
      added.push(memberId)
      applyOwnerFieldEffects(ctx, ownerId, [{ field, addedIds: added }])
    } else if (isHandleRef(existing) && String(existing.HandleRefId) === memberId) {
      // already
    } else {
      return {
        ok: false,
        message: `${ownerTypeOf(owner)}.${field} already occupied`,
        added: [],
      }
    }
    return { ok: true, added }
  }

  const list = Array.isArray(owner.Data[field]) ? [...owner.Data[field]] : []
  let mutated = false
  for (const memberId of memberIds) {
    if (
      list.some(
        (item) => isHandleRef(item) && String(item.HandleRefId) === memberId
      )
    ) {
      continue
    }
    list.push(asHandleRef(memberId))
    added.push(memberId)
    mutated = true
  }
  if (mutated) {
    owner.Data[field] = list
    applyOwnerFieldEffects(ctx, ownerId, [{ field, addedIds: added }])
  }
  return { ok: true, added }
}

export type RemoveHandleRefsResult = {
  removed: string[]
  orphaned: string[]
}

/**
 * Batch-remove HandleRefs from owner.Data[field].
 * Orphaned = removed members with zero outbound / not contained / not root.
 */
export function removeHandleRefs(
  ctx: AnimgraphMutationCtx,
  ownerId: string,
  field: string,
  memberIds: readonly string[]
): RemoveHandleRefsResult {
  const owner = ctx.handlesRegistry.get(ownerId)
  if (!owner?.Data) return { removed: [], orphaned: [] }
  const want = new Set(memberIds)
  if (want.size === 0) return { removed: [], orphaned: [] }

  const removed: string[] = []
  const removedIndices: number[] = []
  const slot = owner.Data[field]

  if (Array.isArray(slot)) {
    const next: unknown[] = []
    for (let i = 0; i < slot.length; i++) {
      const item = slot[i]
      if (isHandleRef(item) && want.has(String(item.HandleRefId))) {
        removed.push(String(item.HandleRefId))
        removedIndices.push(i)
        continue
      }
      next.push(item)
    }
    if (removed.length > 0) {
      owner.Data[field] = next
    }
  } else if (isHandleRef(slot) && want.has(String(slot.HandleRefId))) {
    removed.push(String(slot.HandleRefId))
    removedIndices.push(-1)
    delete owner.Data[field]
  }

  const orphaned: string[] = []
  for (const id of removed) {
    if (afterHandleRefRemoved(ctx, id)) orphaned.push(id)
  }
  if (removed.length > 0) {
    applyOwnerFieldEffects(ctx, ownerId, [
      { field, removedIndices, removedIds: removed },
    ])
  }
  return { removed, orphaned }
}

function extractRefFromHandlerValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'object' && value && 'node' in value) {
    return handleRefIdOf((value as { node: unknown }).node)
  }
  return handleRefIdOf(value)
}

function pinHandler(owner: AnimgraphNode, field: string) {
  const ownerType = ownerTypeOf(owner)
  if (!ownerType) return null
  return NodeDefinitionRegistry.getNodeInputHandler(ownerType, field)
}

/** Read pin-array / nested-slot length (handler stays inside the facade). */
export function countPinSlots(
  ctx: AnimgraphMutationCtx,
  ownerId: string,
  field: string
): number {
  const owner = ctx.handlesRegistry.get(ownerId)
  if (!owner?.Data) return 0
  const handler = pinHandler(owner, field)
  if (!handler) return 0
  return handler.count(owner)
}

/** Read one pin slot value (HandleRef / link / inline). */
export function getPinSlot(
  ctx: AnimgraphMutationCtx,
  ownerId: string,
  field: string,
  index: number
): unknown {
  const owner = ctx.handlesRegistry.get(ownerId)
  if (!owner?.Data) return null
  const handler = pinHandler(owner, field)
  if (!handler) return null
  return handler.get(owner, index)
}

/**
 * Write arbitrary pin-slot value via input handler (inline embed Data, etc.).
 * Reconciles HandleRefs when previous/next values are refs.
 */
export function setPinSlot(
  ctx: AnimgraphMutationCtx,
  ownerId: string,
  field: string,
  index: number,
  value: unknown
): { previousId: string | null } {
  const owner = ctx.handlesRegistry.get(ownerId)
  if (!owner?.Data) return { previousId: null }
  const handler = pinHandler(owner, field)
  if (!handler) return { previousId: null }

  const previousId = extractRefFromHandlerValue(handler.get(owner, index))
  handler.set(owner, value, index)
  const nextId = extractRefFromHandlerValue(value)

  if (previousId && previousId !== nextId) afterHandleRefRemoved(ctx, previousId)
  applyOwnerFieldEffects(ctx, ownerId, [field])
  return { previousId }
}

/**
 * Indexed / scalar pin-shaped HandleRef write via input handler slot shape.
 */
export function setHandleRef(
  ctx: AnimgraphMutationCtx,
  ownerId: string,
  field: string,
  index: number,
  targetId: string
): { previousId: string | null } {
  const owner = ctx.handlesRegistry.get(ownerId)
  if (!owner?.Data) return { previousId: null }
  const handler = pinHandler(owner, field)
  if (!handler) return { previousId: null }

  const previousId = extractRefFromHandlerValue(handler.get(owner, index))
  handler.set(owner, { HandleRefId: targetId }, index)

  if (previousId && previousId !== targetId) {
    afterHandleRefRemoved(ctx, previousId)
  }
  applyOwnerFieldEffects(ctx, ownerId, [field])
  return { previousId }
}

/**
 * Clear pin slot (clearLink if available, else delete). Consistency on previous target.
 */
export function clearHandleRef(
  ctx: AnimgraphMutationCtx,
  ownerId: string,
  field: string,
  index: number
): { previousId: string | null; lengthChanged: boolean; linkCleared: boolean } {
  const ownerAnimgraphNode = ctx.handlesRegistry.get(ownerId)
  if (!ownerAnimgraphNode?.Data) {
    return { previousId: null, lengthChanged: false, linkCleared: false }
  }

  const handler = pinHandler(ownerAnimgraphNode, field)
  if (!handler) {
    return { previousId: null, lengthChanged: false, linkCleared: false }
  }
  const previousId = extractRefFromHandlerValue(
    handler.get(ownerAnimgraphNode, index)
  )
  // Nested pins live under projection paths — never assume Data[field] is the array.
  const beforeLen = handler.count(ownerAnimgraphNode)

  let linkCleared = false
  if (handler.clearLink) {
    linkCleared = handler.clearLink(ownerAnimgraphNode, index)
  } else {
    handler.delete(ownerAnimgraphNode, index)
  }

  const afterLen = handler.count(ownerAnimgraphNode)

  if (previousId) afterHandleRefRemoved(ctx, previousId)
  applyOwnerFieldEffects(ctx, ownerId, [field])

  return {
    previousId,
    lengthChanged: beforeLen !== afterLen,
    linkCleared,
  }
}

/** Set document rootNode. Floating clear on target is diagram-layer. */
export function setRootNode(
  ctx: AnimgraphMutationCtx,
  targetId: string
): { previousId: string | null } {
  const previousId = handleRefIdOf(ctx.animgraph.rootNode)
  if (previousId === targetId) return { previousId }
  ctx.animgraph.rootNode = asHandleRef(targetId)
  if (previousId) afterHandleRefRemoved(ctx, previousId)
  return { previousId }
}

export type RenameHandleResult =
  | { ok: true }
  | { ok: false; message: string }

/** Retarget registry key + all HandleRefs / rootNode (and stale nodesToInit ids). */
export function renameHandle(
  ctx: AnimgraphMutationCtx,
  oldId: string,
  newId: string
): RenameHandleResult {
  const next = newId.trim()
  if (!next || next === '-1' || next === '0') {
    return { ok: false, message: 'Invalid HandleId' }
  }
  if (next === oldId) return { ok: true }
  if (ctx.handlesRegistry.has(next)) {
    return { ok: false, message: `HandleId '${next}' already exists` }
  }
  const handle = ctx.handlesRegistry.get(oldId)
  if (!handle) return { ok: false, message: `Handle '${oldId}' not found` }

  ctx.handlesRegistry.delete(oldId)
  handle.HandleId = next
  ctx.handlesRegistry.set(next, handle)
  rewriteHandleRefIds(ctx, oldId, next)
  return { ok: true }
}

/**
 * In-place Data mutation under known root keys.
 * Diffs outbound HandleRefs in those fields, then runs field effects.
 * Prefer typed topology APIs (setHandleRef / addHandleRefs / …) when writing refs by shape.
 */
export function mutateHandleData(
  ctx: AnimgraphMutationCtx,
  handleId: string,
  rootKeys: readonly string[],
  mutator: (data: AnimgraphObject) => void
): boolean {
  const handle = ctx.handlesRegistry.get(handleId)
  if (!handle?.Data) return false
  const keys = rootKeys.filter((k) => k.length > 0)
  if (keys.length === 0) return false

  const before = collectHandleFieldRefs(handle, keys)
  mutator(handle.Data)
  const after = collectHandleFieldRefs(handle, keys)
  reconcileOutboundRefs(ctx, handleId, before, after)
  applyOwnerFieldEffects(ctx, handleId, keys)
  return true
}

/**
 * Replace entire handle.Data (history / type swap). Full outbound-ref reconcile.
 */
export function replaceHandleData(
  ctx: AnimgraphMutationCtx,
  handleId: string,
  data: AnimgraphObject
): boolean {
  const handle = ctx.handlesRegistry.get(handleId)
  if (!handle) return false
  const before = collectHandleDataRefs(handle)
  handle.Data = data
  const after = collectHandleDataRefs(handle)
  reconcileOutboundRefs(ctx, handleId, before, after)
  const keys = Object.keys(data).filter((k) => k !== '$type')
  if (keys.length > 0) applyOwnerFieldEffects(ctx, handleId, keys)
  return true
}
