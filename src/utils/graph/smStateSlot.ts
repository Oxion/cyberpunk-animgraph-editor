/**
 * Live SM.states array helpers. Slot order is the source of truth for state index
 * — do not store index on RenderNode.metadata.
 */

import type { AnimgraphNode } from './animgraphTypes'
import type { RenderData, RenderNode } from './diagramTypes'
import { ANIM_NODE_STATE_TYPE_SET } from './animNodeStateTypes'
import { isStateMachineNodeType } from './animNodeTypeUtils'
import { DEFAULT_CHILD_SLOT, getChildSlot } from './nodeChildSlots'
import { getSmPropertyGroup } from './StateMachineDetailLayout'

export function isHandleRef(value: unknown): value is { HandleRefId: string } {
  return (
    typeof value === 'object' &&
    value != null &&
    'HandleRefId' in value &&
    typeof (value as { HandleRefId: string }).HandleRefId === 'string'
  )
}

export function readHandleRefIds(parent: AnimgraphNode, slotName: string): string[] {
  const val = parent.Data?.[slotName]
  if (!Array.isArray(val)) return []
  const ids: string[] = []
  for (const item of val) {
    if (isHandleRef(item)) ids.push(String(item.HandleRefId))
  }
  return ids
}

export function findHandleIndexInSlot(
  parent: AnimgraphNode,
  slotName: string,
  handleId: string
): number {
  const val = parent.Data?.[slotName]
  if (!Array.isArray(val)) return -1
  return val.findIndex((item) => isHandleRef(item) && String(item.HandleRefId) === handleId)
}

export function resolveBoxHandleId(
  node: RenderNode,
  handlesRegistry: Map<string, AnimgraphNode>
): string | null {
  const fromData = node.data?.originalNodeId
  if (typeof fromData === 'string' && handlesRegistry.has(fromData)) return fromData
  if (handlesRegistry.has(node.id)) return node.id
  return null
}

export function resolveStateSMOwnerDiagramNode(stateDiagramNode: RenderNode, diagramData: RenderData): RenderNode | null {
  const fromMeta = stateDiagramNode.metadata?.ownerStateMachineId
  if (typeof fromMeta === 'string') {
    const sm = diagramData.allNodes.get(fromMeta)
    if (sm) return sm
  }
  let current: RenderNode | null = stateDiagramNode
  while (current) {
    if (isStateMachineNodeType(current.type)) return current
    current = current.parent ?? null
  }
  return null
}

/** Index among State siblings in the parent group (matches slot order when kept in sync). */
export function getStateIndexFromSiblings(node: RenderNode): number | null {
  const parent = node.parent
  if (!parent) return null
  const states = getChildSlot(parent, DEFAULT_CHILD_SLOT).filter((c) =>
    ANIM_NODE_STATE_TYPE_SET.has(c.type)
  )
  const i = states.findIndex((c) => c.id === node.id)
  return i >= 0 ? i : null
}

/** Live index in SM.Data.states; sibling order is fallback. */
export function resolveLiveStateIndex(
  renderData: RenderData,
  state: RenderNode
): number | null {
  const sm = resolveStateSMOwnerDiagramNode(state, renderData)
  if (sm) {
    const smHandle = renderData.handlesRegistry.get(String(sm.data?.originalNodeId ?? sm.id))
    const hid = resolveBoxHandleId(state, renderData.handlesRegistry)
    if (smHandle && hid) {
      const idx = findHandleIndexInSlot(smHandle, 'states', hid)
      if (idx >= 0) return idx
    }
  }
  return getStateIndexFromSiblings(state)
}

export function orderStateBoxesByHandleArray(
  group: RenderNode,
  smHandle: AnimgraphNode | undefined
): RenderNode[] {
  const kids = getChildSlot(group, DEFAULT_CHILD_SLOT)
  const states = kids.filter((c) => ANIM_NODE_STATE_TYPE_SET.has(c.type))
  if (!smHandle) return states

  const orderedIds = readHandleRefIds(smHandle, 'states')
  if (orderedIds.length === 0) return states

  const byHandleOrId = new Map<string, RenderNode>()
  for (const box of states) {
    byHandleOrId.set(box.id, box)
    const oid = box.data?.originalNodeId
    if (typeof oid === 'string') byHandleOrId.set(oid, box)
  }

  const seen = new Set<string>()
  const ordered: RenderNode[] = []
  for (const hid of orderedIds) {
    const box = byHandleOrId.get(hid)
    if (!box || seen.has(box.id)) continue
    seen.add(box.id)
    ordered.push(box)
  }
  for (const box of states) {
    if (!seen.has(box.id)) ordered.push(box)
  }
  return ordered
}

export function syncStatesGroupChildOrder(
  group: RenderNode,
  smHandle: AnimgraphNode | undefined
): RenderNode[] {
  const kids = getChildSlot(group, DEFAULT_CHILD_SLOT)
  const states = orderStateBoxesByHandleArray(group, smHandle)
  const stateIds = new Set(states.map((s) => s.id))
  const rest = kids.filter((c) => !stateIds.has(c.id))
  const next = [...states, ...rest]
  group.childSlots = {
    ...group.childSlots,
    [DEFAULT_CHILD_SLOT]: next,
  }
  for (const child of next) {
    child.parent = group
    child.parentSlot = DEFAULT_CHILD_SLOT
  }
  return states
}

export function mapIndexAfterMove(oldIndex: number, from: number, to: number): number {
  if (oldIndex === from) return to
  if (from < to) {
    if (oldIndex > from && oldIndex <= to) return oldIndex - 1
  } else if (to < from) {
    if (oldIndex >= to && oldIndex < from) return oldIndex + 1
  }
  return oldIndex
}

export function moveArrayItem<T>(arr: T[], from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return
  const [item] = arr.splice(from, 1)
  if (item === undefined) return
  arr.splice(to, 0, item)
}

export function readNumericHandleField(
  data: Record<string, unknown> | undefined,
  key: string
): number | null {
  if (!data) return null
  const raw = data[key]
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (raw && typeof raw === 'object' && '$value' in raw) {
    const n = Number((raw as { $value: unknown }).$value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function writeNumericHandleField(
  handle: AnimgraphNode,
  key: string,
  next: number
): void {
  if (!handle.Data) return
  const raw = handle.Data[key]
  if (raw && typeof raw === 'object' && '$value' in (raw as object)) {
    handle.Data[key] = { ...(raw as object), $value: next }
  } else {
    handle.Data[key] = next
  }
}

export function getStatesGroupForSm(
  sm: RenderNode,
  renderData: RenderData
): RenderNode | null {
  return getSmPropertyGroup(sm, 'states', renderData.allNodes) ?? null
}

export type SmStateMoveTarget = {
  state: RenderNode
  sm: RenderNode
  group: RenderNode
  smHandle: AnimgraphNode
  /** Registry key used to look up `smHandle`. */
  smHandleRegistryId: string
  handleId: string
  fromIndex: number
  toIndex: number
}

export type MoveSmStateDenial = 'not-found' | 'not-in-array' | 'same-index' | 'bad-index'

export function resolveMoveSmStateTarget(
  renderData: RenderData,
  stateId: string,
  toIndex: number
): { ok: true; target: SmStateMoveTarget } | { ok: false; reason: MoveSmStateDenial } {
  const state = renderData.allNodes.get(stateId)
  if (!state) return { ok: false, reason: 'not-found' }

  const sm = resolveStateSMOwnerDiagramNode(state, renderData)
  if (!sm) return { ok: false, reason: 'not-in-array' }

  const group = getStatesGroupForSm(sm, renderData)
  if (!group) return { ok: false, reason: 'not-in-array' }

  const smHandleRegistryId = String(sm.data?.originalNodeId ?? sm.id)
  const smHandle = renderData.handlesRegistry.get(smHandleRegistryId)
  const handleId = resolveBoxHandleId(state, renderData.handlesRegistry)
  if (!smHandle || !handleId) return { ok: false, reason: 'not-in-array' }

  const fromIndex = findHandleIndexInSlot(smHandle, 'states', handleId)
  if (fromIndex < 0) return { ok: false, reason: 'not-in-array' }

  const list = smHandle.Data?.states
  if (!Array.isArray(list)) return { ok: false, reason: 'not-in-array' }
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= list.length) {
    return { ok: false, reason: 'bad-index' }
  }
  if (toIndex === fromIndex) return { ok: false, reason: 'same-index' }

  return {
    ok: true,
    target: {
      state,
      sm,
      group,
      smHandle,
      smHandleRegistryId,
      handleId,
      fromIndex,
      toIndex,
    },
  }
}

export function canMoveSmStateByDelta(
  renderData: RenderData,
  stateId: string,
  delta: -1 | 1
): boolean {
  const state = renderData.allNodes.get(stateId)
  if (!state) return false
  const from = resolveLiveStateIndex(renderData, state)
  if (from === null) return false
  return resolveMoveSmStateTarget(renderData, stateId, from + delta).ok
}
