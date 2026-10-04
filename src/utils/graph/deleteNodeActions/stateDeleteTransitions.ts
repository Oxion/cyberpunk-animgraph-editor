/**
 * Collect SM slot removals + cascade diagram subtrees when a State is deleted.
 * Transitions: outgoing (outTransitionIndices) + incoming (targetStateIndex).
 * Conditional entries: incoming only (targetStateIndex).
 */

import type { AnimgraphNode } from '../animgraphTypes'
import type { RenderData, RenderNode } from '../diagramTypes'
import { findStateMachineDiagramRootAncestor } from '../DiagramConversion'
import { DEFAULT_CHILD_SLOT, getChildSlot, walkSubtree } from '../nodeChildSlots'
import { getSmPropertyGroup } from '../StateMachineDetailLayout'

function resolveBoxHandleId(
  node: RenderNode,
  handlesRegistry: Map<string, AnimgraphNode>
): string | null {
  const fromData = node.data?.originalNodeId
  if (typeof fromData === 'string' && handlesRegistry.has(fromData)) return fromData
  if (handlesRegistry.has(node.id)) return node.id
  return null
}

function isHandleRef(value: unknown): value is { HandleRefId: string } {
  return (
    typeof value === 'object' &&
    value != null &&
    'HandleRefId' in value &&
    typeof (value as { HandleRefId: string }).HandleRefId === 'string'
  )
}

function findHandleIndexInSlot(
  parent: AnimgraphNode,
  slotName: string,
  handleId: string
): number {
  const val = parent.Data?.[slotName]
  if (!Array.isArray(val)) return -1
  return val.findIndex(
    (item) => isHandleRef(item) && String(item.HandleRefId) === handleId
  )
}

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

function readOutTransitionIndices(data: Record<string, unknown> | undefined): number[] {
  if (!data) return []
  const raw = data.outTransitionIndices
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is number => typeof v === 'number')
}

export type SmSlotName = 'transitions' | 'globalTransitions' | 'conditionalEntries'

export type StateDeleteSmSlotRemoval = {
  slotName: SmSlotName
  /** Index in SM slot array before delete. */
  index: number
  handleId: string
}

export function resolveOwnerSm(
  seed: RenderNode,
  renderData: RenderData
): RenderNode | null {
  const fromMeta = seed.metadata?.ownerStateMachineId
  if (typeof fromMeta === 'string') {
    const sm = renderData.allNodes.get(fromMeta)
    if (sm) return sm
  }
  return findStateMachineDiagramRootAncestor(seed)
}

/** Live slot index in SM.Data.states. */
export function resolveDeletedStateIndex(
  smHandle: AnimgraphNode | undefined,
  seedHandleId: string | null,
  _seed: RenderNode
): number {
  if (smHandle && seedHandleId) {
    const slotIdx = findHandleIndexInSlot(smHandle, 'states', seedHandleId)
    if (slotIdx >= 0) return slotIdx
  }
  return -1
}

export function collectStateDeleteSmSlotRemovals(
  renderData: RenderData,
  smHandle: AnimgraphNode,
  deletedStateIndex: number,
  seedStateHandle: AnimgraphNode
): StateDeleteSmSlotRemoval[] {
  const seenHandles = new Set<string>()
  const removals: StateDeleteSmSlotRemoval[] = []

  const schedule = (slotName: SmSlotName, index: number, handleId: string) => {
    if (seenHandles.has(handleId)) return
    seenHandles.add(handleId)
    removals.push({ slotName, index, handleId })
  }

  const outIndices = readOutTransitionIndices(
    seedStateHandle.Data as Record<string, unknown>
  )
  const transitions = smHandle.Data?.transitions
  if (Array.isArray(transitions)) {
    for (const idx of outIndices) {
      const ref = transitions[idx]
      if (isHandleRef(ref)) {
        schedule('transitions', idx, String(ref.HandleRefId))
      }
    }
    for (let i = 0; i < transitions.length; i++) {
      const ref = transitions[i]
      if (!isHandleRef(ref)) continue
      const handleId = String(ref.HandleRefId)
      if (seenHandles.has(handleId)) continue
      const th = renderData.handlesRegistry.get(handleId)
      const target = readTargetStateIndex(th?.Data as Record<string, unknown>)
      if (target === deletedStateIndex) {
        schedule('transitions', i, handleId)
      }
    }
  }

  const globalTransitions = smHandle.Data?.globalTransitions
  if (Array.isArray(globalTransitions)) {
    for (let i = 0; i < globalTransitions.length; i++) {
      const ref = globalTransitions[i]
      if (!isHandleRef(ref)) continue
      const handleId = String(ref.HandleRefId)
      if (seenHandles.has(handleId)) continue
      const th = renderData.handlesRegistry.get(handleId)
      const target = readTargetStateIndex(th?.Data as Record<string, unknown>)
      if (target === deletedStateIndex) {
        schedule('globalTransitions', i, handleId)
      }
    }
  }

  const conditionalEntries = smHandle.Data?.conditionalEntries
  if (Array.isArray(conditionalEntries)) {
    for (let i = 0; i < conditionalEntries.length; i++) {
      const ref = conditionalEntries[i]
      if (!isHandleRef(ref)) continue
      const handleId = String(ref.HandleRefId)
      if (seenHandles.has(handleId)) continue
      const ce = renderData.handlesRegistry.get(handleId)
      const target = readTargetStateIndex(ce?.Data as Record<string, unknown>)
      if (target === deletedStateIndex) {
        schedule('conditionalEntries', i, handleId)
      }
    }
  }

  return removals
}

/** Diagram wrapper (or box) in an SM section for a handle ref. */
export function findSmSlotDiagramSeed(
  renderData: RenderData,
  sm: RenderNode,
  slotName: SmSlotName,
  handleId: string
): RenderNode | null {
  const group = getSmPropertyGroup(sm, slotName, renderData.allNodes)
  if (!group) return null

  for (const child of getChildSlot(group, DEFAULT_CHILD_SLOT)) {
    const direct = resolveBoxHandleId(child, renderData.handlesRegistry)
    if (direct === handleId || child.id === handleId) return child

    let match: RenderNode | null = null
    walkSubtree(child, (sub) => {
      if (match) return
      const hid = resolveBoxHandleId(sub, renderData.handlesRegistry)
      if (hid === handleId) match = child
    })
    if (match) return match
  }
  return null
}

/** Cascade orphaned transitions / conditional entries when one state is removed. */
export function expandTransitionCascadeForStateDelete(
  renderData: RenderData,
  stateNode: RenderNode,
  subtree: RenderNode[],
  affectedSet: Set<string>,
  handleIdSet: Set<string>,
  handleIds: string[]
): void {
  const sm = resolveOwnerSm(stateNode, renderData)
  if (!sm) return

  const smHandleId = String(sm.data?.originalNodeId ?? sm.id)
  const smHandle = renderData.handlesRegistry.get(smHandleId)
  const seedHandleId = resolveBoxHandleId(stateNode, renderData.handlesRegistry)
  const seedStateHandle = seedHandleId
    ? renderData.handlesRegistry.get(seedHandleId)
    : undefined
  if (!smHandle || !seedStateHandle) return

  const deletedStateIndex = resolveDeletedStateIndex(smHandle, seedHandleId, stateNode)
  if (deletedStateIndex < 0) return

  const removals = collectStateDeleteSmSlotRemovals(
    renderData,
    smHandle,
    deletedStateIndex,
    seedStateHandle
  )

  for (const rem of removals) {
    if (!handleIdSet.has(rem.handleId)) {
      handleIdSet.add(rem.handleId)
      handleIds.push(rem.handleId)
    }

    const slotSeed = findSmSlotDiagramSeed(
      renderData,
      sm,
      rem.slotName,
      rem.handleId
    )
    if (!slotSeed) continue

    for (const node of walkSubtreeForDelete(slotSeed)) {
      if (affectedSet.has(node.id)) continue
      affectedSet.add(node.id)
      subtree.push(node)

      const hid = resolveBoxHandleId(node, renderData.handlesRegistry)
      if (!hid || handleIdSet.has(hid)) continue
      handleIdSet.add(hid)
      handleIds.push(hid)
    }
  }
}

function walkSubtreeForDelete(node: RenderNode): RenderNode[] {
  const nodes: RenderNode[] = []
  walkSubtree(node, (n) => {
    nodes.push(n)
  })
  return nodes
}
