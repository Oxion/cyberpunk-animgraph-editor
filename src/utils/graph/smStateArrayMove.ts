/**
 * Move a State HandleRef inside SM.Data.states and keep diagram + index refs in sync.
 */

import type { AnimgraphNode } from './animgraphTypes'
import type { RenderData, RenderNode } from './diagramTypes'
import {
  ANIM_NODE_TYPE_CONDITIONAL_ENTRY,
  ANIM_NODE_TYPE_TRANSITION_DESCRIPTION,
} from './animNodeTypes'
import {
  DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE,
  DIAGRAM_TRANSITION_WRAPPER_TYPE,
} from './diagramNodeTypes'
import { layoutStatesGroupWithPortals } from './DiagramConversion'
import {
  captureNodeLayout,
  type NodeLayoutState,
} from './GraphHistory'
import { DEFAULT_CHILD_SLOT, getChildSlot } from './nodeChildSlots'
import { getSmPropertyGroup } from './StateMachineDetailLayout'
import {
  mapIndexAfterMove,
  moveArrayItem,
  readNumericHandleField,
  resolveMoveSmStateTarget,
  syncStatesGroupChildOrder,
  type MoveSmStateDenial,
  type SmStateMoveTarget,
  writeNumericHandleField,
} from './smStateSlot'

const INDEX_REF_SLOTS = ['transitions', 'globalTransitions', 'conditionalEntries'] as const

function isTransitionLikeBox(node: RenderNode): boolean {
  return (
    node.type === DIAGRAM_TRANSITION_WRAPPER_TYPE ||
    node.type === DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE ||
    node.type === ANIM_NODE_TYPE_TRANSITION_DESCRIPTION ||
    node.type === ANIM_NODE_TYPE_CONDITIONAL_ENTRY
  )
}

function resolveHandleId(node: RenderNode): string {
  return String(node.data?.originalNodeId ?? node.id)
}

function cloneJson<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

export type SmStateMoveIndexFieldSnap = {
  handleId: string
  boxId: string
  targetStateIndex: unknown
  metadataTarget: unknown
}

export type SmStateMoveAnimgraphSnapshot = {
  smHandleId: string
  smId: string
  groupId: string
  states: unknown
  defaultStateIndex: unknown
  stateIds: unknown
  childOrder: string[]
  indexFields: SmStateMoveIndexFieldSnap[]
}

function collectIndexFieldSnaps(
  renderData: RenderData,
  sm: RenderNode
): SmStateMoveIndexFieldSnap[] {
  const snaps: SmStateMoveIndexFieldSnap[] = []
  for (const slot of INDEX_REF_SLOTS) {
    const group = getSmPropertyGroup(sm, slot, renderData.allNodes)
    if (!group) continue
    for (const child of getChildSlot(group, DEFAULT_CHILD_SLOT)) {
      if (!isTransitionLikeBox(child)) continue
      const hid = resolveHandleId(child)
      const handle = renderData.handlesRegistry.get(hid)
      snaps.push({
        handleId: hid,
        boxId: child.id,
        targetStateIndex: cloneJson(handle?.Data?.targetStateIndex ?? null),
        metadataTarget: cloneJson(child.metadata?.targetStateIndex ?? undefined),
      })
    }
  }
  return snaps
}

export function snapshotSmStateMoveAnimgraph(
  renderData: RenderData,
  target: SmStateMoveTarget
): SmStateMoveAnimgraphSnapshot {
  const { sm, group, smHandle, smHandleRegistryId } = target
  return {
    smHandleId: smHandleRegistryId,
    smId: sm.id,
    groupId: group.id,
    states: cloneJson(smHandle.Data?.states ?? null),
    defaultStateIndex: cloneJson(smHandle.Data?.defaultStateIndex ?? undefined),
    stateIds: cloneJson(sm.metadata?.stateIds ?? undefined),
    childOrder: getChildSlot(group, DEFAULT_CHILD_SLOT).map((c) => c.id),
    indexFields: collectIndexFieldSnaps(renderData, sm),
  }
}

export function restoreSmStateMoveAnimgraph(
  renderData: RenderData,
  snap: SmStateMoveAnimgraphSnapshot
): string[] {
  const dirty = new Set<string>([snap.smId, snap.groupId])
  const sm = renderData.allNodes.get(snap.smId)
  const smHandle =
    renderData.handlesRegistry.get(snap.smHandleId) ??
    (sm
      ? renderData.handlesRegistry.get(String(sm.data?.originalNodeId ?? sm.id))
      : undefined)
  if (smHandle?.Data) {
    smHandle.Data.states = cloneJson(snap.states)
    if (snap.defaultStateIndex === undefined) {
      delete smHandle.Data.defaultStateIndex
    } else {
      smHandle.Data.defaultStateIndex = cloneJson(snap.defaultStateIndex)
    }
  }

  if (sm) {
    sm.metadata = { ...sm.metadata, stateIds: cloneJson(snap.stateIds) }
  }

  const group = renderData.allNodes.get(snap.groupId)
  if (group) {
    const byId = new Map(
      getChildSlot(group, DEFAULT_CHILD_SLOT).map((c) => [c.id, c] as const)
    )
    const next: RenderNode[] = []
    for (const id of snap.childOrder) {
      const node = byId.get(id)
      if (node) next.push(node)
    }
    for (const child of byId.values()) {
      if (!next.includes(child)) next.push(child)
    }
    group.childSlots = {
      ...group.childSlots,
      [DEFAULT_CHILD_SLOT]: next,
    }
    for (const child of next) {
      child.parent = group
      child.parentSlot = DEFAULT_CHILD_SLOT
      dirty.add(child.id)
    }
    if (smHandle) syncStatesGroupChildOrder(group, smHandle)
  }

  for (const field of snap.indexFields) {
    const handle = renderData.handlesRegistry.get(field.handleId)
    if (handle?.Data) {
      if (field.targetStateIndex === null) {
        delete handle.Data.targetStateIndex
      } else {
        handle.Data.targetStateIndex = cloneJson(field.targetStateIndex)
      }
    }
    const box = renderData.allNodes.get(field.boxId)
    if (box) {
      const nextMeta = { ...box.metadata }
      if (field.metadataTarget === undefined) delete nextMeta.targetStateIndex
      else nextMeta.targetStateIndex = cloneJson(field.metadataTarget)
      box.metadata = nextMeta
      dirty.add(box.id)
    }
  }

  return [...dirty]
}

function remapIndexRefs(
  renderData: RenderData,
  sm: RenderNode,
  fromIndex: number,
  toIndex: number,
  dirty: Set<string>
): void {
  const touchBox = (box: RenderNode) => {
    const hid = resolveHandleId(box)
    const handle = renderData.handlesRegistry.get(hid)
    if (!handle?.Data) return
    const cur = readNumericHandleField(handle.Data as Record<string, unknown>, 'targetStateIndex')
    if (cur === null || cur < 0) return
    const next = mapIndexAfterMove(cur, fromIndex, toIndex)
    if (next === cur) return
    writeNumericHandleField(handle, 'targetStateIndex', next)
    box.metadata = { ...box.metadata, targetStateIndex: next }
    dirty.add(box.id)
  }

  for (const slot of INDEX_REF_SLOTS) {
    const group = getSmPropertyGroup(sm, slot, renderData.allNodes)
    if (!group) continue
    for (const child of getChildSlot(group, DEFAULT_CHILD_SLOT)) {
      if (isTransitionLikeBox(child)) touchBox(child)
    }
  }

  const smHandleId = String(sm.data?.originalNodeId ?? sm.id)
  const smHandle = renderData.handlesRegistry.get(smHandleId)
  if (!smHandle?.Data) return
  const curDefault = readNumericHandleField(
    smHandle.Data as Record<string, unknown>,
    'defaultStateIndex'
  )
  if (curDefault === null || curDefault < 0) return
  const nextDefault = mapIndexAfterMove(curDefault, fromIndex, toIndex)
  if (nextDefault === curDefault) return
  writeNumericHandleField(smHandle, 'defaultStateIndex', nextDefault)
}

function syncSmStateIds(
  sm: RenderNode,
  group: RenderNode,
  smHandle: AnimgraphNode,
  dirty: Set<string>
): void {
  const ordered = syncStatesGroupChildOrder(group, smHandle)
  sm.metadata = {
    ...sm.metadata,
    stateIds: ordered.map((b) => b.id),
    smPropertyChildCounts: {
      ...((sm.metadata?.smPropertyChildCounts as Record<string, number> | undefined) ?? {}),
      states: ordered.length,
    },
  }
  dirty.add(sm.id)
  dirty.add(group.id)
  for (const box of ordered) dirty.add(box.id)
}

export function collectSmStateMoveLayoutNodes(target: SmStateMoveTarget): RenderNode[] {
  const nodes: RenderNode[] = [target.sm, target.group]
  for (const child of getChildSlot(target.group, DEFAULT_CHILD_SLOT)) {
    nodes.push(child)
  }
  return nodes
}

export function captureLayouts(nodes: readonly RenderNode[]): NodeLayoutState[] {
  return nodes.map(captureNodeLayout)
}

export type ApplyMoveSmStateResult =
  | { ok: false; reason: MoveSmStateDenial }
  | {
      ok: true
      fromIndex: number
      toIndex: number
      dirtyIds: string[]
      animgraphBefore: SmStateMoveAnimgraphSnapshot
      animgraphAfter: SmStateMoveAnimgraphSnapshot
    }

export async function applyMoveSmState(
  renderData: RenderData,
  stateId: string,
  toIndex: number
): Promise<ApplyMoveSmStateResult> {
  const resolved = resolveMoveSmStateTarget(renderData, stateId, toIndex)
  if (!resolved.ok) return resolved

  const { target } = resolved
  const { sm, group, smHandle, fromIndex } = target
  const list = smHandle.Data?.states
  if (!Array.isArray(list)) return { ok: false, reason: 'not-in-array' }

  const animgraphBefore = snapshotSmStateMoveAnimgraph(renderData, target)
  const dirty = new Set<string>()

  moveArrayItem(list, fromIndex, toIndex)
  smHandle.Data.states = list
  remapIndexRefs(renderData, sm, fromIndex, toIndex, dirty)
  syncSmStateIds(sm, group, smHandle, dirty)

  const layoutDirty = await layoutStatesGroupWithPortals(renderData, group)
  for (const id of layoutDirty) dirty.add(id)

  const animgraphAfter = snapshotSmStateMoveAnimgraph(renderData, target)
  return {
    ok: true,
    fromIndex,
    toIndex,
    dirtyIds: [...dirty],
    animgraphBefore,
    animgraphAfter,
  }
}
