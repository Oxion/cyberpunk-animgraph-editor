/**
 * Animgraph HandleRef CRUD + topology consistency.
 * Gated contain/pin writes; pin storage addressing is internal.
 * Projection NodeInputHandler adapters call into these APIs.
 */

import { NodeDefinitionRegistry } from '../../NodeDefinition'
import { isAnimType } from '../../animTypes'
import type { AnimgraphNode, AnimgraphObject } from '../animgraphTypes'
import type { AnimgraphMutationCtx } from './ctx'
import { afterHandleRefRemoved } from './consistency'
import { hasMembershipSlot } from './containPromote'
import { applyOwnerFieldEffects } from './fieldEffects'
import { resolvePinStorage } from './pinStorage'
import { isExecutionInitAnchor } from '../executionCore/resolve'
import {
  asHandleRef,
  collectHandleDataRefs,
  collectHandleFieldRefs,
  countInboundPinHandleRefs,
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

function assertContainField(
  owner: AnimgraphNode,
  field: string
): { ok: true; parentType: string } | { ok: false; message: string } {
  const parentType = ownerTypeOf(owner)
  if (!parentType) {
    return { ok: false, message: 'Owner handle has no $type' }
  }
  if (!NodeDefinitionRegistry.isChildField(parentType, field)) {
    return {
      ok: false,
      message: `${parentType}.${field} is not a contain field`,
    }
  }
  return { ok: true, parentType }
}

function assertMemberTypesAllowed(
  parentType: string,
  field: string,
  memberIds: readonly string[],
  ctx: AnimgraphMutationCtx
): { ok: true } | { ok: false; message: string } {
  const slot = NodeDefinitionRegistry.getChildSlot(
    NodeDefinitionRegistry.getNodeDefinition(parentType),
    field,
    parentType
  )
  if (!slot?.allowedTypes?.length) return { ok: true }
  for (const memberId of memberIds) {
    const member = ctx.handlesRegistry.get(memberId)
    const memberType = String(member?.Data?.$type ?? '')
    if (!memberType) {
      return { ok: false, message: `Member '${memberId}' has no $type` }
    }
    if (!slot.allowedTypes.some((base) => isAnimType(memberType, base))) {
      return {
        ok: false,
        message: `${memberType} not allowed in ${parentType}.${field}`,
      }
    }
  }
  return { ok: true }
}

/**
 * Resolve contain owner → addContainRefs.
 * @returns owner handle id, or null if no resolver / no owner / gate fail.
 */
export function promoteContainMembership(
  ctx: AnimgraphMutationCtx,
  memberId: string
): string | null {
  const resolve = ctx.resolveContainOwner
  if (!resolve) return null

  const owner = resolve(memberId)
  if (!owner) return null

  const ownerHandle = ctx.handlesRegistry.get(owner.ownerId)
  const parentType = String(ownerHandle?.Data?.$type ?? '')
  if (!parentType || !hasMembershipSlot(parentType, owner.slot)) return null

  const result = addContainRefs(ctx, owner.ownerId, owner.slot, [memberId])
  return result.ok ? owner.ownerId : null
}

/**
 * If member has no remaining pin inbound uses, remove membership contain.
 * Skips execution init anchors (e.g. State Output that must stay in nodes).
 * @returns owner handle id when membership was removed.
 */
export function demoteContainMembership(
  ctx: AnimgraphMutationCtx,
  memberId: string
): string | null {
  if (!memberId) return null
  const member = ctx.handlesRegistry.get(memberId)
  const memberType = String(member?.Data?.$type ?? '')
  if (memberType && isExecutionInitAnchor(memberType)) return null
  if (countInboundPinHandleRefs(ctx, memberId) > 0) return null

  const resolve = ctx.resolveContainOwner
  if (!resolve) return null
  const owner = resolve(memberId)
  if (!owner) return null

  const ownerHandle = ctx.handlesRegistry.get(owner.ownerId)
  const parentType = String(ownerHandle?.Data?.$type ?? '')
  if (!parentType || !hasMembershipSlot(parentType, owner.slot)) return null

  const { removed } = removeContainRefs(
    ctx,
    owner.ownerId,
    owner.slot,
    [memberId]
  )
  return removed.length > 0 ? owner.ownerId : null
}

/**
 * Batch-add HandleRefs on a contain field (array push / scalar set).
 * Floating clear is diagram-layer (caller).
 */
export function addContainRefs(
  ctx: AnimgraphMutationCtx,
  ownerId: string,
  field: string,
  memberIds: readonly string[]
): AddHandleRefsResult {
  const owner = ctx.handlesRegistry.get(ownerId)
  if (!owner?.Data) {
    return { ok: false, message: 'Owner handle has no Data', added: [] }
  }
  const gate = assertContainField(owner, field)
  if (!gate.ok) return { ok: false, message: gate.message, added: [] }

  const typesOk = assertMemberTypesAllowed(gate.parentType, field, memberIds, ctx)
  if (!typesOk.ok) return { ok: false, message: typesOk.message, added: [] }

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

/** @deprecated Use addContainRefs */
export const addHandleRefs = addContainRefs

export type RemoveHandleRefsResult = {
  removed: string[]
  orphaned: string[]
}

/**
 * Batch-remove HandleRefs from a contain field.
 * Orphaned = removed members with zero outbound / not contained / not root.
 */
export function removeContainRefs(
  ctx: AnimgraphMutationCtx,
  ownerId: string,
  field: string,
  memberIds: readonly string[]
): RemoveHandleRefsResult {
  const owner = ctx.handlesRegistry.get(ownerId)
  if (!owner?.Data) return { removed: [], orphaned: [] }
  if (!assertContainField(owner, field).ok) return { removed: [], orphaned: [] }

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

/** @deprecated Use removeContainRefs */
export const removeHandleRefs = removeContainRefs

function extractRefFromStorageValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'object' && value && 'node' in value) {
    return handleRefIdOf((value as { node: unknown }).node)
  }
  return handleRefIdOf(value)
}

function pinStorageFor(
  owner: AnimgraphNode,
  field: string
): ReturnType<typeof resolvePinStorage> {
  const ownerType = ownerTypeOf(owner)
  if (!ownerType) return null
  if (!NodeDefinitionRegistry.isInputField(ownerType, field)) return null
  return resolvePinStorage(ownerType, field)
}

/** Read pin-array / nested-slot length. */
export function countPinSlots(
  ctx: AnimgraphMutationCtx,
  ownerId: string,
  field: string
): number {
  const owner = ctx.handlesRegistry.get(ownerId)
  if (!owner?.Data) return 0
  const storage = pinStorageFor(owner, field)
  if (!storage) return 0
  return storage.count(owner)
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
  const storage = pinStorageFor(owner, field)
  if (!storage) return null
  return storage.get(owner, index)
}

/**
 * Write pin-slot value (HandleRef or inline embed Data).
 * Reconciles refs; when value is a HandleRef, promoteContainMembership(nextId).
 */
export function setPinSlot(
  ctx: AnimgraphMutationCtx,
  ownerId: string,
  field: string,
  index: number,
  value: unknown
): { previousId: string | null; containOwnerId: string | null } {
  const owner = ctx.handlesRegistry.get(ownerId)
  if (!owner?.Data) return { previousId: null, containOwnerId: null }
  const storage = pinStorageFor(owner, field)
  if (!storage) return { previousId: null, containOwnerId: null }

  const previousId = extractRefFromStorageValue(storage.get(owner, index))
  storage.set(owner, value, index)
  const nextId = extractRefFromStorageValue(value)

  let demotedOwnerId: string | null = null
  if (previousId && previousId !== nextId) {
    afterHandleRefRemoved(ctx, previousId)
    demotedOwnerId = demoteContainMembership(ctx, previousId)
  }
  applyOwnerFieldEffects(ctx, ownerId, [field])
  const promotedOwnerId = nextId ? promoteContainMembership(ctx, nextId) : null
  return { previousId, containOwnerId: promotedOwnerId ?? demotedOwnerId }
}

/**
 * Indexed / scalar pin HandleRef write — delegates to setPinSlot.
 */
export function setHandleRef(
  ctx: AnimgraphMutationCtx,
  ownerId: string,
  field: string,
  index: number,
  targetId: string
): { previousId: string | null; containOwnerId: string | null } {
  return setPinSlot(ctx, ownerId, field, index, { HandleRefId: targetId })
}

/**
 * Clear pin slot (clearLink if available, else delete). Consistency on previous target.
 */
export function clearHandleRef(
  ctx: AnimgraphMutationCtx,
  ownerId: string,
  field: string,
  index: number
): {
  previousId: string | null
  lengthChanged: boolean
  linkCleared: boolean
  containOwnerId: string | null
} {
  const ownerAnimgraphNode = ctx.handlesRegistry.get(ownerId)
  if (!ownerAnimgraphNode?.Data) {
    return {
      previousId: null,
      lengthChanged: false,
      linkCleared: false,
      containOwnerId: null,
    }
  }

  const storage = pinStorageFor(ownerAnimgraphNode, field)
  if (!storage) {
    return {
      previousId: null,
      lengthChanged: false,
      linkCleared: false,
      containOwnerId: null,
    }
  }
  const previousId = extractRefFromStorageValue(
    storage.get(ownerAnimgraphNode, index)
  )
  const beforeLen = storage.count(ownerAnimgraphNode)

  let linkCleared = false
  if (storage.clearLink) {
    linkCleared = storage.clearLink(ownerAnimgraphNode, index)
  } else {
    storage.delete(ownerAnimgraphNode, index)
  }

  const afterLen = storage.count(ownerAnimgraphNode)

  let containOwnerId: string | null = null
  if (previousId) {
    afterHandleRefRemoved(ctx, previousId)
    containOwnerId = demoteContainMembership(ctx, previousId)
  }
  applyOwnerFieldEffects(ctx, ownerId, [field])

  return {
    previousId,
    lengthChanged: beforeLen !== afterLen,
    linkCleared,
    containOwnerId,
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
 * Prefer typed topology APIs (setHandleRef / addContainRefs / …) when writing refs by shape.
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
