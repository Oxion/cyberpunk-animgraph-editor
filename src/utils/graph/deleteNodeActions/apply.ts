/**
 * Apply compiled delete-node actions to RenderData.
 */

import type { DiagramConnection, RenderData } from '../diagramTypes'
import { NodeDefinitionRegistry } from '../../NodeDefinition'
import { isPropertyGroupNode } from '../diagramAddPolicy'
import { isPortalHopConnection } from '../portalTopology'
import { removeFloatingHandle } from '../floatingHandles'
import { removeNodeFromGraphData } from '../GraphHistory'
import { fitPropertyGroupToChildren } from '../nodeAddBootstrap'
import { applyDisconnectPlan } from '../pinWireActions'
import { collectDisconnectWires } from './compile'
import {
  applyReindexSmStates,
  applyRemapOutTransitionIndices,
  applyRemapTargetStateIndices,
  applyRestackPropertyGroup,
  applySyncSmSectionMetadata,
} from './sideEffects'
import type {
  DeleteNodeAction,
  DeleteNodeApplyResult,
  DeleteNodePlan,
  DetachHandleRefAction,
} from './types'

function removeFromNodesToInit(renderData: RenderData, handleId: string): void {
  const nodesToInit = renderData.originalAnimgraph?.nodesToInit
  if (!nodesToInit) return
  for (let i = nodesToInit.length - 1; i >= 0; i--) {
    const ref = nodesToInit[i]
    if (
      typeof ref === 'object' &&
      ref &&
      'HandleRefId' in ref &&
      String((ref as { HandleRefId: string }).HandleRefId) === handleId
    ) {
      nodesToInit.splice(i, 1)
    }
  }
}

function applyDetachHandleRef(
  renderData: RenderData,
  action: DetachHandleRefAction
): void {
  const parent = renderData.handlesRegistry.get(action.parentHandleId)
  if (!parent?.Data) return
  const slot = parent.Data[action.slotName]
  if (action.index < 0) {
    if (
      slot &&
      typeof slot === 'object' &&
      'HandleRefId' in slot &&
      String((slot as { HandleRefId: string }).HandleRefId) === action.handleId
    ) {
      delete parent.Data[action.slotName]
    }
    return
  }
  if (!Array.isArray(slot)) return
  const idx = slot.findIndex(
    (item) =>
      item &&
      typeof item === 'object' &&
      'HandleRefId' in item &&
      String((item as { HandleRefId: string }).HandleRefId) === action.handleId
  )
  if (idx < 0) return
  slot.splice(idx, 1)
  parent.Data[action.slotName] = slot
  const parentType = String(parent.Data.$type ?? '')
  const handler = NodeDefinitionRegistry.getHandleTypeChildrenHandler(
    parentType,
    action.slotName
  )
  handler?.ensureOrder(renderData.handlesRegistry, parent, action.slotName)
}

/** Find live wire after array-pin reindex (same from/to, possibly new pinName). */
function findLiveDisconnectTarget(
  renderData: RenderData,
  conn: DiagramConnection
): DiagramConnection | null {
  const exact = renderData.connections.find(
    (c) =>
      c.from === conn.from &&
      c.to === conn.to &&
      c.pinName === conn.pinName
  )
  if (exact) return exact

  const sameEnds = renderData.connections.find((c) => {
    if (isPortalHopConnection(c)) {
      return false
    }
    if (c.from !== conn.from) return false
    if (c.to === conn.to) return true
    if (
      conn.metadata?.originalTo &&
      c.metadata?.originalTo === conn.metadata.originalTo
    ) {
      return true
    }
    return false
  })
  return sameEnds ?? null
}

function stripDeadConnections(renderData: RenderData, deadIds: Set<string>): void {
  renderData.connections = renderData.connections.filter((c) => {
    if (deadIds.has(c.from) || deadIds.has(c.to)) return false
    const meta = c.metadata
    if (!meta) return true
    if (typeof meta.originalTo === 'string' && deadIds.has(meta.originalTo)) {
      return false
    }
    if (typeof meta.originalFrom === 'string' && deadIds.has(meta.originalFrom)) {
      return false
    }
    return true
  })
}

export function applyDeleteNodeActions(
  renderData: RenderData,
  actions: readonly DeleteNodeAction[],
  options?: { affectedIds?: readonly string[] }
): {
  footprintDirtyBoxIds: string[]
  removedPortalIds: string[]
  removedNodeIds: string[]
  removedHandleIds: string[]
} {
  const footprintDirtyBoxIds: string[] = []
  const removedPortalIds: string[] = []
  const removedNodeIds: string[] = []
  const removedHandleIds: string[] = []
  const deadIds = new Set<string>()
  const affectedSet = new Set(options?.affectedIds ?? [])

  const markDirty = (id: string | undefined | null) => {
    if (!id) return
    if (!footprintDirtyBoxIds.includes(id)) footprintDirtyBoxIds.push(id)
  }

  const runDisconnect = (conn: DiagramConnection) => {
    const live = findLiveDisconnectTarget(renderData, conn)
    if (!live) return
    const result = applyDisconnectPlan(renderData, live)
    for (const id of result.footprintDirtyBoxIds) markDirty(id)
    for (const id of result.removedPortalIds) {
      if (!removedPortalIds.includes(id)) removedPortalIds.push(id)
      deadIds.add(id)
    }
  }

  // Phase 1: disconnect while boxes/handles still exist.
  for (const action of actions) {
    if (action.kind === 'disconnect-wire') runDisconnect(action.connection)
  }
  if (affectedSet.size > 0) {
    let guard = 0
    while (guard++ < 1000) {
      const leftover = collectDisconnectWires(renderData, affectedSet)
      if (leftover.length === 0) break
      runDisconnect(leftover[0]!)
    }
  }

  // Phase 2: detach contain refs on surviving parents.
  for (const action of actions) {
    if (action.kind === 'detach-handle-ref') applyDetachHandleRef(renderData, action)
  }

  // Phase 3: unregister handles.
  for (const action of actions) {
    if (action.kind !== 'unregister-handle') continue
    if (!renderData.handlesRegistry.has(action.handleId)) continue
    removeFromNodesToInit(renderData, action.handleId)
    if (renderData.floatingHandleIds?.has(action.handleId)) {
      removeFloatingHandle(renderData, action.handleId, {
        deleteFromRegistry: true,
      })
    } else {
      renderData.handlesRegistry.delete(action.handleId)
    }
    removedHandleIds.push(action.handleId)
  }

  // Phase 4: remove diagram boxes (leaf-first order preserved in actions list).
  for (const action of actions) {
    if (action.kind !== 'remove-diagram-node') continue
    const id = action.placement.node.id
    if (!renderData.allNodes.has(id)) continue
    removeNodeFromGraphData(renderData, action.placement)
    removedNodeIds.push(id)
    deadIds.add(id)
  }

  // Phase 5: fit surviving property groups (generic).
  for (const action of actions) {
    if (action.kind !== 'fit-parent-group') continue
    const parent = renderData.allNodes.get(action.parentId)
    if (parent && isPropertyGroupNode(parent)) {
      fitPropertyGroupToChildren(parent)
      markDirty(parent.id)
    }
  }

  // Phase 6: type-specific side effects (reindex / remap / restack).
  for (const action of actions) {
    switch (action.kind) {
      case 'reindex-sm-states':
        applyReindexSmStates(renderData, action, markDirty)
        break
      case 'remap-target-state-indices':
        applyRemapTargetStateIndices(renderData, action, markDirty)
        break
      case 'remap-out-transition-indices':
        applyRemapOutTransitionIndices(renderData, action, markDirty)
        break
      case 'restack-property-group':
        applyRestackPropertyGroup(renderData, action, markDirty)
        break
      case 'sync-sm-section-metadata':
        applySyncSmSectionMetadata(renderData, action, markDirty)
        break
      default:
        break
    }
  }

  stripDeadConnections(renderData, deadIds)
  return {
    footprintDirtyBoxIds,
    removedPortalIds,
    removedNodeIds,
    removedHandleIds,
  }
}

export function applyDeleteNodePlan(
  renderData: RenderData,
  plan: DeleteNodePlan
): DeleteNodeApplyResult {
  if (!renderData.allNodes.has(plan.seedId)) {
    return { ok: false, message: `Node '${plan.seedId}' not found` }
  }

  const applied = applyDeleteNodeActions(renderData, plan.actions, {
    affectedIds: plan.affectedIds,
  })
  const parentRefreshIds = [...plan.parentRefreshIds]
  for (const id of applied.footprintDirtyBoxIds) {
    if (!parentRefreshIds.includes(id) && renderData.allNodes.has(id)) {
      parentRefreshIds.push(id)
    }
  }

  return {
    ok: true,
    seedId: plan.seedId,
    removedNodeIds: applied.removedNodeIds,
    removedHandleIds: applied.removedHandleIds,
    parentRefreshIds,
    footprintDirtyBoxIds: applied.footprintDirtyBoxIds,
    removedPortalIds: applied.removedPortalIds,
    label:
      applied.removedNodeIds.length > 1
        ? `Delete node + ${applied.removedNodeIds.length - 1} children`
        : 'Delete node',
  }
}
