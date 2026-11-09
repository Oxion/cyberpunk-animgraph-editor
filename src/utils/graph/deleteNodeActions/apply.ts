/**
 * Apply compiled delete-node actions to RenderData.
 */

import type { DiagramConnection, RenderData } from '../diagramTypes'
import { deleteHandles } from '../animgraphMutation'
import { mutationCtxFromRenderData } from '../diagramMutationCtx'
import { isPropertyGroupNode } from '../diagramAddPolicy'
import { isPortalHopConnection } from '../portalTopology'
import { removeFloatingHandle } from '../floatingHandles'
import { removeNodeFromGraphData } from '../GraphHistory'
import { fitPropertyGroupToChildren } from '../nodeAddBootstrap'
import { applyDisconnectPlan } from '../pinWireActions'
import { collectDisconnectWires } from './compile'
import {
  applyReindexSmStates,
  applyRestackPropertyGroup,
  applySyncSmSectionMetadata,
} from './sideEffects'
import type {
  DeleteNodeAction,
  DeleteNodeApplyResult,
  DeleteNodePlan,
} from './types'

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

  // Phase 2: animgraph deleteHandles (strip inbound + registry).
  for (const action of actions) {
    if (action.kind !== 'delete-animgraph-handles') continue
    const ctx = mutationCtxFromRenderData(renderData)
    for (const handleId of action.handleIds) {
      if (renderData.floatingHandleIds?.has(handleId)) {
        // Clear floating mark; registry delete is done by deleteHandles.
        removeFloatingHandle(renderData, handleId, { deleteFromRegistry: false })
      }
    }
    const { deleted } = deleteHandles(ctx, action.handleIds)
    removedHandleIds.push(...deleted)
  }

  // Phase 3: remove diagram boxes (leaf-first order preserved in actions list).
  for (const action of actions) {
    if (action.kind !== 'remove-diagram-node') continue
    const id = action.placement.node.id
    if (!renderData.allNodes.has(id)) continue
    removeNodeFromGraphData(renderData, action.placement)
    removedNodeIds.push(id)
    deadIds.add(id)
  }

  // Phase 4: fit surviving property groups (generic).
  for (const action of actions) {
    if (action.kind !== 'fit-parent-group') continue
    const parent = renderData.allNodes.get(action.parentId)
    if (parent && isPropertyGroupNode(parent)) {
      fitPropertyGroupToChildren(parent)
      markDirty(parent.id)
    }
  }

  // Phase 5: type-specific side effects (reindex / remap / restack).
  for (const action of actions) {
    switch (action.kind) {
      case 'reindex-sm-states':
        applyReindexSmStates(renderData, action, markDirty)
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
