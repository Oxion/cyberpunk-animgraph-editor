/**
 * Animgraph SM index consistency after states / transitions array membership changes.
 * Diagram-free: walks SM.Data HandleRef slots + handlesRegistry only.
 */

import {
  ANIM_NODE_TYPE_STATE,
  ANIM_NODE_TYPE_STATE_FROZEN,
  ANIM_NODE_TYPE_STATE_MACHINE,
} from '../../animNodeTypes'
import type { AnimgraphNode } from '../../animgraphTypes'
import type { AnimgraphMutationCtx } from '../ctx'
import { isHandleRef } from '../refWalk'
import type { OwnerFieldChange } from '../fieldChangeTypes'
import { registerFieldChangeEffect } from './registry'

export const FIELD_CHANGE_EFFECT_SM_INDEX_REMAP = 'sm-index-remap'

function isSmType(typeName: string): boolean {
  return typeName === ANIM_NODE_TYPE_STATE_MACHINE
}

function isStateType(typeName: string): boolean {
  return (
    typeName === ANIM_NODE_TYPE_STATE || typeName === ANIM_NODE_TYPE_STATE_FROZEN
  )
}

function readTargetStateIndex(data: Record<string, unknown>): number | null {
  const raw = data.targetStateIndex
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (raw && typeof raw === 'object' && '$value' in raw) {
    const n = Number((raw as { $value: unknown }).$value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function writeTargetStateIndex(handle: AnimgraphNode, next: number): void {
  if (!handle.Data) return
  const raw = handle.Data.targetStateIndex
  if (raw && typeof raw === 'object' && '$value' in (raw as object)) {
    handle.Data.targetStateIndex = { ...(raw as object), $value: next }
  } else {
    handle.Data.targetStateIndex = next
  }
}

function forEachRefInSlot(
  owner: AnimgraphNode,
  slotName: string,
  visit: (handleId: string) => void
): void {
  const slot = owner.Data?.[slotName]
  if (!Array.isArray(slot)) return
  for (const item of slot) {
    if (!isHandleRef(item)) continue
    visit(String(item.HandleRefId))
  }
}

/** Remap transition/CE targetStateIndex after a state is removed at `deletedStateIndex`. */
export function remapTargetStateIndices(
  ctx: AnimgraphMutationCtx,
  sm: AnimgraphNode,
  deletedStateIndex: number
): void {
  if (deletedStateIndex < 0) return
  for (const slot of ['transitions', 'globalTransitions', 'conditionalEntries'] as const) {
    forEachRefInSlot(sm, slot, (hid) => {
      const handle = ctx.handlesRegistry.get(hid)
      if (!handle?.Data) return
      if (!('targetStateIndex' in handle.Data)) return
      const cur = readTargetStateIndex(handle.Data as Record<string, unknown>)
      if (cur === null) return
      let next = cur
      if (cur === deletedStateIndex) next = -1
      else if (cur > deletedStateIndex) next = cur - 1
      if (next !== cur) writeTargetStateIndex(handle, next)
    })
  }

  const def = sm.Data?.defaultStateIndex
  if (typeof def === 'number' && Number.isFinite(def)) {
    let next = def
    if (def === deletedStateIndex) next = 0
    else if (def > deletedStateIndex) next = def - 1
    if (next !== def) sm.Data!.defaultStateIndex = next
  }
}

/** Remap State.outTransitionIndices after a transition is removed from SM.transitions. */
export function remapOutTransitionIndices(
  ctx: AnimgraphMutationCtx,
  sm: AnimgraphNode,
  deletedIndex: number
): void {
  if (deletedIndex < 0) return
  forEachRefInSlot(sm, 'states', (hid) => {
    const handle = ctx.handlesRegistry.get(hid)
    if (!handle?.Data) return
    const t = String(handle.Data.$type ?? '')
    if (!isStateType(t)) return
    const indices = handle.Data.outTransitionIndices
    if (!Array.isArray(indices)) return
    const next: number[] = []
    let changed = false
    for (const idx of indices) {
      if (typeof idx !== 'number') continue
      if (idx === deletedIndex) {
        changed = true
        continue
      }
      if (idx > deletedIndex) {
        next.push(idx - 1)
        changed = true
      } else {
        next.push(idx)
      }
    }
    if (changed) handle.Data.outTransitionIndices = next
  })
}

/**
 * Built-in SM field-change effects. Call from applyOwnerFieldEffects.
 */
export function applySmIndexRemapEffects(
  ctx: AnimgraphMutationCtx,
  owner: AnimgraphNode,
  changes: readonly OwnerFieldChange[]
): void {
  const typeName = String(owner.Data?.$type ?? '')
  if (!isSmType(typeName)) return

  for (const change of changes) {
    const indices = [...(change.removedIndices ?? [])].sort((a, b) => b - a)
    if (indices.length === 0) continue

    if (change.field === 'states') {
      for (const idx of indices) remapTargetStateIndices(ctx, owner, idx)
      continue
    }
    if (change.field === 'transitions') {
      for (const idx of indices) remapOutTransitionIndices(ctx, owner, idx)
    }
  }
}

registerFieldChangeEffect(
  FIELD_CHANGE_EFFECT_SM_INDEX_REMAP,
  applySmIndexRemapEffects
)