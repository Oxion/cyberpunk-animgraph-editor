/**
 * Delete-node plan facade — gate → compile → apply + undo snapshot.
 * No UI strings; callers map reason codes.
 */

import type { AnimgraphNode, AnimgraphNodeLike, AnimgraphObject } from './animgraphTypes'
import type { DiagramConnection, RenderData, RenderNode } from './diagramTypes'
import {
  cloneAnimgraphData,
  cloneConnections,
  cloneRenderNodeForHistory,
  collectPortalIdsForConnection,
  captureAddedNodePlacement,
  captureNodeLayout,
  applyNodeLayouts,
  removeNodeFromGraphData,
  restoreNodeToGraphData,
  type AddedNodePlacement,
  type NodeLayoutState,
} from './GraphHistory'
import { isDiagramPortalNode } from './DiagramConversion'
import { getChildSlot, DEFAULT_CHILD_SLOT } from './nodeChildSlots'
import { getSmPropertyGroup } from './StateMachineDetailLayout'
import {
  applyDeleteNodePlan as applyCompiledDeletePlan,
  canDeleteNode,
  compileDeleteNodeActions,
  type CanDeleteNodeResult,
  type DeleteNodeApplyResult,
  type DeleteNodeDenialReason,
  type DeleteNodePlan,
} from './deleteNodeActions'
import { resolveBoxHandleId } from './deleteNodeActions/compile'

export type {
  CanDeleteNodeResult,
  DeleteNodeApplyResult,
  DeleteNodeDenialReason,
  DeleteNodePlan,
} from './deleteNodeActions'

export { canDeleteNode } from './deleteNodeActions'

export type BuildDeleteNodePlanResult =
  | { ok: true; plan: DeleteNodePlan }
  | { ok: false; reasons: DeleteNodeDenialReason[] }

export function buildDeleteNodePlan(
  renderData: RenderData,
  seedId: string
): BuildDeleteNodePlanResult {
  const compiled = compileDeleteNodeActions(renderData, seedId)
  if (!compiled.ok) {
    return { ok: false, reasons: compiled.reasons }
  }
  return { ok: true, plan: compiled.plan }
}

export function applyDeleteNodePlan(
  renderData: RenderData,
  plan: DeleteNodePlan
): DeleteNodeApplyResult {
  return applyCompiledDeletePlan(renderData, plan)
}

function cloneNodesToInit(refs: AnimgraphNodeLike[] | undefined): AnimgraphNodeLike[] {
  if (!refs?.length) return []
  return JSON.parse(JSON.stringify(refs)) as AnimgraphNodeLike[]
}

function cloneFloatingHandleIds(ids: Set<string> | undefined): string[] {
  return ids?.size ? [...ids] : []
}

function cloneHandle(handle: AnimgraphNode): AnimgraphNode {
  return {
    HandleId: handle.HandleId,
    Data: cloneAnimgraphData(handle.Data),
  }
}

/** Surviving handles whose Data may change (disconnect / detach / SM remaps). */
function collectTouchedSurvivingHandleIds(
  renderData: RenderData,
  plan: DeleteNodePlan
): string[] {
  const deleted = new Set(plan.handleIds)
  const touched = new Set<string>()

  const addHandle = (hid: string | null | undefined) => {
    if (!hid || deleted.has(hid)) return
    if (renderData.handlesRegistry.has(hid)) touched.add(hid)
  }

  for (const action of plan.actions) {
    if (action.kind === 'detach-handle-ref') {
      addHandle(action.parentHandleId)
    }
    if (action.kind === 'disconnect-wire') {
      const conn = action.connection
      const toNode = renderData.allNodes.get(conn.to)
      let logicalToId = conn.to
      if (conn.metadata?.originalTo) {
        logicalToId = conn.metadata.originalTo
      } else if (toNode?.data?.originalNodeId) {
        logicalToId = String(toNode.data.originalNodeId)
      } else if (toNode) {
        const hid = resolveBoxHandleId(toNode, renderData.handlesRegistry)
        if (hid) logicalToId = hid
      }
      addHandle(logicalToId)
      const fromNode = renderData.allNodes.get(conn.from)
      addHandle(
        fromNode
          ? resolveBoxHandleId(fromNode, renderData.handlesRegistry)
          : null
      )
    }
    if (action.kind === 'remap-target-state-indices') {
      const sm = renderData.allNodes.get(action.smId)
      if (!sm) continue
      for (const slot of [
        'transitions',
        'globalTransitions',
        'conditionalEntries',
      ] as const) {
        const group = getSmPropertyGroup(sm, slot, renderData.allNodes)
        if (!group) continue
        for (const child of getChildSlot(group, DEFAULT_CHILD_SLOT)) {
          addHandle(resolveBoxHandleId(child, renderData.handlesRegistry))
        }
      }
    }
    if (action.kind === 'remap-out-transition-indices') {
      const sm = renderData.allNodes.get(action.smId)
      if (!sm) continue
      const statesGroup = getSmPropertyGroup(sm, 'states', renderData.allNodes)
      if (!statesGroup) continue
      for (const child of getChildSlot(statesGroup, DEFAULT_CHILD_SLOT)) {
        addHandle(resolveBoxHandleId(child, renderData.handlesRegistry))
      }
    }
  }

  return [...touched]
}

/** Surviving diagram boxes mutated by side effects (layout / metadata). */
function collectSideEffectBoxIds(
  renderData: RenderData,
  plan: DeleteNodePlan
): string[] {
  const deleted = new Set(plan.affectedIds)
  const ids = new Set<string>()

  const add = (id: string | null | undefined) => {
    if (!id || deleted.has(id)) return
    if (renderData.allNodes.has(id)) ids.add(id)
  }

  for (const id of plan.parentRefreshIds) add(id)

  for (const action of plan.actions) {
    if (action.kind === 'restack-property-group') {
      add(action.groupId)
      const group = renderData.allNodes.get(action.groupId)
      if (group) {
        for (const child of getChildSlot(group, DEFAULT_CHILD_SLOT)) add(child.id)
      }
    }
    if (action.kind === 'reindex-sm-states') {
      add(action.smId)
      add(action.statesGroupId)
      const group = renderData.allNodes.get(action.statesGroupId)
      if (group) {
        for (const child of getChildSlot(group, DEFAULT_CHILD_SLOT)) add(child.id)
      }
    }
    if (action.kind === 'sync-sm-section-metadata') add(action.smId)
    if (
      action.kind === 'remap-target-state-indices' ||
      action.kind === 'remap-out-transition-indices'
    ) {
      add(action.smId)
    }
  }

  return [...ids]
}

export interface DeleteNodesSnapshot {
  seedId: string
  /** Removed boxes (leaf-first) — restore parent-first via reverse. */
  placements: AddedNodePlacement[]
  /** Portals GC'd by disconnect outside the subtree — restore after placements. */
  portalPlacements: AddedNodePlacement[]
  /** Cloned handles that were unregistered. */
  deletedHandles: AnimgraphNode[]
  /** Surviving handle Data before mutation. */
  survivingHandleData: Record<string, AnimgraphObject>
  /** Surviving boxes moved/reindexed by side effects. */
  survivingLayouts: NodeLayoutState[]
  /** Surviving box metadata before side effects. */
  survivingNodeMetadata: Record<string, Record<string, unknown>>
  connections: DiagramConnection[]
  nodesToInit: AnimgraphNodeLike[]
  floatingHandleIds: string[]
  parentRefreshIds: string[]
  label: string
}

export function captureDeleteNodesSnapshot(
  renderData: RenderData,
  plan: DeleteNodePlan
): DeleteNodesSnapshot {
  const subtreeIds = new Set(plan.affectedIds)
  const placements: AddedNodePlacement[] = []
  for (const action of plan.actions) {
    if (action.kind === 'remove-diagram-node') {
      placements.push({
        ...action.placement,
        node: cloneRenderNodeForHistory(action.placement.node),
      })
    }
  }

  const portalPlacements: AddedNodePlacement[] = []
  const portalSeen = new Set<string>()
  for (const action of plan.actions) {
    if (action.kind !== 'disconnect-wire') continue
    for (const portalId of collectPortalIdsForConnection(
      renderData,
      action.connection
    )) {
      if (subtreeIds.has(portalId) || portalSeen.has(portalId)) continue
      const portal = renderData.allNodes.get(portalId)
      if (!portal || !isDiagramPortalNode(portal)) continue
      portalSeen.add(portalId)
      const placement = captureAddedNodePlacement(
        renderData,
        portal,
        portal.parent ?? null
      )
      portalPlacements.push({
        ...placement,
        node: cloneRenderNodeForHistory(placement.node),
      })
    }
  }

  const deletedHandles: AnimgraphNode[] = []
  for (const hid of plan.handleIds) {
    const handle = renderData.handlesRegistry.get(hid)
    if (handle) deletedHandles.push(cloneHandle(handle))
  }

  const survivingHandleData: Record<string, AnimgraphObject> = {}
  for (const hid of collectTouchedSurvivingHandleIds(renderData, plan)) {
    const handle = renderData.handlesRegistry.get(hid)
    if (handle?.Data) {
      survivingHandleData[hid] = cloneAnimgraphData(handle.Data)
    }
  }

  const survivingLayouts: NodeLayoutState[] = []
  const survivingNodeMetadata: Record<string, Record<string, unknown>> = {}
  for (const id of collectSideEffectBoxIds(renderData, plan)) {
    const node = renderData.allNodes.get(id)
    if (!node) continue
    survivingLayouts.push(captureNodeLayout(node))
    survivingNodeMetadata[id] = { ...(node.metadata ?? {}) }
  }

  return {
    seedId: plan.seedId,
    placements,
    portalPlacements,
    deletedHandles,
    survivingHandleData,
    survivingLayouts,
    survivingNodeMetadata,
    connections: cloneConnections(renderData.connections),
    nodesToInit: cloneNodesToInit(renderData.originalAnimgraph?.nodesToInit),
    floatingHandleIds: cloneFloatingHandleIds(renderData.floatingHandleIds),
    parentRefreshIds: [...plan.parentRefreshIds],
    label:
      plan.affectedIds.length > 1
        ? `Delete node + ${plan.affectedIds.length - 1} children`
        : 'Delete node',
  }
}

export function restoreDeleteNodesSnapshot(
  renderData: RenderData,
  snapshot: DeleteNodesSnapshot
): void {
  // Restore handles first so attach/refs make sense when boxes remount.
  for (const handle of snapshot.deletedHandles) {
    renderData.handlesRegistry.set(String(handle.HandleId), cloneHandle(handle))
  }

  for (const [hid, data] of Object.entries(snapshot.survivingHandleData)) {
    const handle = renderData.handlesRegistry.get(hid)
    if (handle) {
      handle.Data = cloneAnimgraphData(data)
    }
  }

  if (renderData.originalAnimgraph) {
    renderData.originalAnimgraph.nodesToInit = cloneNodesToInit(snapshot.nodesToInit)
  }
  renderData.floatingHandleIds = new Set(snapshot.floatingHandleIds)

  // Parent-first: reverse of leaf-first capture order.
  for (const placement of [...snapshot.placements].reverse()) {
    if (renderData.allNodes.has(placement.node.id)) continue
    restoreNodeToGraphData(renderData, {
      ...placement,
      node: cloneRenderNodeForHistory(placement.node),
    })
  }

  for (const placement of snapshot.portalPlacements ?? []) {
    if (renderData.allNodes.has(placement.node.id)) continue
    restoreNodeToGraphData(renderData, {
      ...placement,
      node: cloneRenderNodeForHistory(placement.node),
    })
  }

  for (const [id, meta] of Object.entries(snapshot.survivingNodeMetadata ?? {})) {
    const node = renderData.allNodes.get(id)
    if (node) node.metadata = { ...meta }
  }
  if (snapshot.survivingLayouts?.length) {
    applyNodeLayouts(renderData, snapshot.survivingLayouts)
  }

  renderData.connections = cloneConnections(snapshot.connections)
}

/** Node ids in mount order (parent before children) for renderer undo/redo. */
export function getDeleteNodesRestoreNodeIds(snapshot: DeleteNodesSnapshot): string[] {
  const fromPlacements = [...snapshot.placements].reverse().map((p) => p.node.id)
  const fromPortals = (snapshot.portalPlacements ?? []).map((p) => p.node.id)
  return [...fromPlacements, ...fromPortals]
}

/** Re-apply delete from a restored graph (redo). */
export function replayDeleteNodes(
  renderData: RenderData,
  snapshot: DeleteNodesSnapshot
): DeleteNodeApplyResult {
  const built = buildDeleteNodePlan(renderData, snapshot.seedId)
  if (!built.ok) {
    return {
      ok: false,
      message: `Cannot redo delete: ${built.reasons.join(', ')}`,
    }
  }
  return applyDeleteNodePlan(renderData, built.plan)
}

/** Remove placements without touching handles (unused helper for partial rollback). */
export function removeDeleteNodePlacements(
  renderData: RenderData,
  placements: AddedNodePlacement[]
): void {
  for (const placement of placements) {
    removeNodeFromGraphData(renderData, placement)
  }
}

export function gateDeleteNode(
  node: RenderNode | null | undefined,
  ctx?: { handlesRegistry?: Map<string, AnimgraphNode> }
): CanDeleteNodeResult {
  return canDeleteNode(node, ctx)
}
