/**
 * Thin wrappers over animgraphMutation HandleRef field ops (legacy names).
 * Prefer addHandleRefs / removeHandleRefs directly.
 */

import type { AnimgraphData, AnimgraphNode, AnimgraphNodeLike } from './animgraphTypes'
import { addHandleRefs, removeHandleRefs } from './animgraphMutation'

function animgraphForOptions(options?: {
  animgraph?: AnimgraphData
  nodesToInit?: AnimgraphNodeLike[]
}): AnimgraphData {
  if (options?.animgraph) return options.animgraph
  return {
    nodesToInit: options?.nodesToInit ?? [],
    rootNode: { HandleRefId: '' },
  }
}

export type AttachContainMemberResult =
  | { ok: true; attached: boolean }
  | { ok: false; message: string }

export type AttachContainMemberOptions = {
  kind?: 'array' | 'scalar'
  /** Prefer `animgraph`. When set alone, used as animgraph.nodesToInit. */
  nodesToInit?: AnimgraphNodeLike[]
  animgraph?: AnimgraphData
}

/**
 * Add `{ HandleRefId }` to parent.Data[slotName] if missing.
 */
export function attachContainMember(
  handlesRegistry: Map<string, AnimgraphNode>,
  parent: AnimgraphNode,
  slotName: string,
  memberHandleId: string,
  options?: AttachContainMemberOptions
): AttachContainMemberResult {
  const result = addHandleRefs(
    { handlesRegistry, animgraph: animgraphForOptions(options) },
    parent.HandleId,
    slotName,
    [memberHandleId]
  )
  if (!result.ok) return { ok: false, message: result.message }
  return { ok: true, attached: result.added.length > 0 }
}

export type DetachContainMemberResult = {
  detached: boolean
}

/**
 * Remove member HandleRef from parent.Data[slotName].
 */
export function detachContainMember(
  handlesRegistry: Map<string, AnimgraphNode>,
  parent: AnimgraphNode,
  slotName: string,
  memberHandleId: string,
  options?: { animgraph?: AnimgraphData; nodesToInit?: AnimgraphNodeLike[] }
): DetachContainMemberResult {
  const result = removeHandleRefs(
    { handlesRegistry, animgraph: animgraphForOptions(options) },
    parent.HandleId,
    slotName,
    [memberHandleId]
  )
  return { detached: result.removed.length > 0 }
}
