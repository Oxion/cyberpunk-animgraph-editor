/**
 * Apply type-specific delete side effects.
 */

import type { AnimgraphNode } from '../../animgraphTypes'
import type { RenderData, RenderNode } from '../../diagramTypes'
import { isDiagramPortalNode } from '../../DiagramConversion'
import { ANIM_NODE_STATE_TYPE_SET } from '../../animNodeStateTypes'
import {
  ANIM_NODE_TYPE_CONDITIONAL_ENTRY,
  ANIM_NODE_TYPE_TRANSITION_DESCRIPTION,
} from '../../animNodeTypes'
import {
  DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE,
  DIAGRAM_TRANSITION_WRAPPER_TYPE,
} from '../../diagramNodeTypes'
import { fitPropertyGroupToChildren, propertyGroupContentOrigin } from '../../nodeAddBootstrap'
import { DEFAULT_CHILD_SLOT, getChildSlot } from '../../nodeChildSlots'
import { getSmPropertyGroup } from '../../StateMachineDetailLayout'
import { orderStateBoxesByHandleArray } from '../../smStateSlot'
import type {
  RemapOutTransitionIndicesAction,
  RemapTargetStateIndicesAction,
  ReindexSmStatesAction,
  RestackPropertyGroupAction,
  SyncSmSectionMetadataAction,
} from '../types'

function readTargetStateIndex(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null
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

function groupSpacing(pg: RenderNode): number {
  return (pg as { spacing?: number }).spacing ?? 16
}

export function applyReindexSmStates(
  renderData: RenderData,
  action: ReindexSmStatesAction,
  markDirty: (id: string) => void
): void {
  const sm = renderData.allNodes.get(action.smId)
  const group = renderData.allNodes.get(action.statesGroupId)
  if (!sm || !group) return

  const smHandleId = String(sm.data?.originalNodeId ?? sm.id)
  const smHandle = renderData.handlesRegistry.get(smHandleId)
  const orderedIds: string[] = []

  if (smHandle && Array.isArray(smHandle.Data?.states)) {
    for (const ref of smHandle.Data.states) {
      if (
        ref &&
        typeof ref === 'object' &&
        'HandleRefId' in ref &&
        typeof (ref as { HandleRefId: string }).HandleRefId === 'string'
      ) {
        orderedIds.push(String((ref as { HandleRefId: string }).HandleRefId))
      }
    }
  } else {
    for (const child of getChildSlot(group, DEFAULT_CHILD_SLOT)) {
      if (ANIM_NODE_STATE_TYPE_SET.has(child.type)) {
        orderedIds.push(String(child.data?.originalNodeId ?? child.id))
      }
    }
  }

  const byHandleOrId = new Map<string, RenderNode>()
  for (const child of getChildSlot(group, DEFAULT_CHILD_SLOT)) {
    if (!ANIM_NODE_STATE_TYPE_SET.has(child.type)) continue
    byHandleOrId.set(child.id, child)
    const oid = child.data?.originalNodeId
    if (typeof oid === 'string') byHandleOrId.set(oid, child)
  }

  const stateIds: string[] = []
  orderedIds.forEach((hid) => {
    const box = byHandleOrId.get(hid)
    if (!box) return
    stateIds.push(box.id)
    markDirty(box.id)
  })

  sm.metadata = {
    ...sm.metadata,
    stateIds,
    smPropertyChildCounts: {
      ...((sm.metadata?.smPropertyChildCounts as Record<string, number> | undefined) ??
        {}),
      states: stateIds.length,
    },
  }
  markDirty(sm.id)
  markDirty(group.id)
}

export function applyRemapTargetStateIndices(
  renderData: RenderData,
  action: RemapTargetStateIndicesAction,
  markDirty: (id: string) => void
): void {
  const sm = renderData.allNodes.get(action.smId)
  if (!sm) return
  const deleted = action.deletedStateIndex

  const touchBox = (box: RenderNode) => {
    const hid = resolveHandleId(box)
    const handle = renderData.handlesRegistry.get(hid)
    if (!handle?.Data) return
    const cur = readTargetStateIndex(handle.Data as Record<string, unknown>)
    if (cur === null) return
    let next = cur
    if (cur === deleted) next = -1
    else if (cur > deleted) next = cur - 1
    if (next === cur) return
    writeTargetStateIndex(handle, next)
    box.metadata = { ...box.metadata, targetStateIndex: next }
    markDirty(box.id)
  }

  for (const slot of ['transitions', 'globalTransitions', 'conditionalEntries'] as const) {
    const group = getSmPropertyGroup(sm, slot, renderData.allNodes)
    if (!group) continue
    for (const child of getChildSlot(group, DEFAULT_CHILD_SLOT)) {
      if (isTransitionLikeBox(child)) touchBox(child)
    }
  }
  markDirty(sm.id)
}

export function applyRemapOutTransitionIndices(
  renderData: RenderData,
  action: RemapOutTransitionIndicesAction,
  markDirty: (id: string) => void
): void {
  const sm = renderData.allNodes.get(action.smId)
  if (!sm) return
  const deleted = action.deletedIndex
  const statesGroup = getSmPropertyGroup(sm, 'states', renderData.allNodes)
  if (!statesGroup) return

  for (const stateBox of getChildSlot(statesGroup, DEFAULT_CHILD_SLOT)) {
    if (!ANIM_NODE_STATE_TYPE_SET.has(stateBox.type)) continue
    const hid = resolveHandleId(stateBox)
    const handle = renderData.handlesRegistry.get(hid)
    const indices = handle?.Data?.outTransitionIndices
    if (!handle?.Data || !Array.isArray(indices)) continue

    const next: number[] = []
    let changed = false
    for (const idx of indices) {
      if (typeof idx !== 'number') continue
      if (idx === deleted) {
        changed = true
        continue
      }
      if (idx > deleted) {
        next.push(idx - 1)
        changed = true
      } else {
        next.push(idx)
      }
    }
    if (!changed) continue
    handle.Data.outTransitionIndices = next
    markDirty(stateBox.id)
  }
}

export function applyRestackPropertyGroup(
  renderData: RenderData,
  action: RestackPropertyGroupAction,
  markDirty: (id: string) => void
): void {
  const pg = renderData.allNodes.get(action.groupId)
  if (!pg) return

  const spacing = groupSpacing(pg)
  const origin = propertyGroupContentOrigin(pg)
  const kids = getChildSlot(pg, DEFAULT_CHILD_SLOT)
  const portals = kids.filter(isDiagramPortalNode)
  const indexed = kids.filter((c) => !isDiagramPortalNode(c))

  if (action.sortBy === 'priority') {
    indexed.sort((a, b) => {
      const pa = typeof a.metadata?.priority === 'number' ? a.metadata.priority : 0
      const pb = typeof b.metadata?.priority === 'number' ? b.metadata.priority : 0
      if (pa !== pb) return pa - pb
      return a.id.localeCompare(b.id)
    })
  } else if (action.sortBy === 'stateIndex') {
    const sm = pg.parent
    const smHandle = sm
      ? renderData.handlesRegistry.get(String(sm.data?.originalNodeId ?? sm.id))
      : undefined
    const ordered = orderStateBoxesByHandleArray(pg, smHandle)
    const rank = new Map(ordered.map((box, i) => [box.id, i]))
    indexed.sort((a, b) => {
      const ia = rank.get(a.id) ?? 0
      const ib = rank.get(b.id) ?? 0
      if (ia !== ib) return ia - ib
      return a.id.localeCompare(b.id)
    })
  }

  // Rebuild child slot order: indexed (sorted) then portals (keep relative).
  pg.childSlots = {
    ...pg.childSlots,
    [DEFAULT_CHILD_SLOT]: [...indexed, ...portals],
  }
  for (const child of indexed) {
    child.parent = pg
    child.parentSlot = DEFAULT_CHILD_SLOT
  }
  for (const portal of portals) {
    portal.parent = pg
    portal.parentSlot = DEFAULT_CHILD_SLOT
  }

  let y = origin.y
  const peerX =
    indexed.find((c) => typeof c.position?.x === 'number')?.position?.x ?? origin.x
  for (const child of indexed) {
    const h = child.size?.height ?? 80
    const w = child.size?.width ?? 240
    const x =
      action.sortBy === 'stateIndex' ? (child.position?.x ?? peerX) : peerX
    child.position = { x, y }
    child.bounds = { x, y, width: w, height: h }
    y += h + spacing
    markDirty(child.id)
  }

  fitPropertyGroupToChildren(pg)
  markDirty(pg.id)
}

export function applySyncSmSectionMetadata(
  renderData: RenderData,
  action: SyncSmSectionMetadataAction,
  markDirty: (id: string) => void
): void {
  const sm = renderData.allNodes.get(action.smId)
  if (!sm) return
  const group = getSmPropertyGroup(sm, action.slotName, renderData.allNodes)
  const kids = group
    ? getChildSlot(group, DEFAULT_CHILD_SLOT).filter((c) => !isDiagramPortalNode(c))
    : []
  const counts = {
    ...((sm.metadata?.smPropertyChildCounts as Record<string, number> | undefined) ??
      {}),
    [action.slotName]: kids.length,
  }

  const nextMeta: Record<string, unknown> = {
    ...sm.metadata,
    smPropertyChildCounts: counts,
  }
  if (action.slotName === 'states') nextMeta.stateIds = kids.map((c) => c.id)

  sm.metadata = nextMeta
  markDirty(sm.id)
  if (group) markDirty(group.id)
}
