import { getWorldPosition } from '../utils/graph/DiagramGeometry'
import { applyFootprintsForIds } from '../utils/graph/diagramNodeEdits'
import type { DiagramConnection } from '../utils/graph/diagramTypes'
import type { PinWireApplyResult } from '../utils/graph/pinWireActions'
import { isPropertyGroupNode } from '../utils/graph/diagramAddPolicy'
import { PixiGraphRenderer } from '../utils/PixiGraphRenderer'
import {
  forEachDiagramViewRenderer,
  getActiveDiagramRenderer,
} from './diagramRenderers'
import { requireRenderData } from './graphProject'
import { bumpConnectionsRevision } from './graphSession'

/** Local edits stay on the active view renderer — parents resync once on resume. */
export const updateActiveNodes = (
  nodeIds: string[],
  options?: {
    contentChangedIds?: ReadonlySet<string>
  }
) => {
  getActiveDiagramRenderer()?.updateNodes(nodeIds, options)
}

export const collectWireRenderers = (): Set<PixiGraphRenderer> => {
  const renderers = new Set<PixiGraphRenderer>()
  forEachDiagramViewRenderer((renderer) => {
    renderers.add(renderer)
  })
  const active = getActiveDiagramRenderer()
  if (active) renderers.add(active)
  return renderers
}

export const refreshPinFootprints = (diagramId: string, boxIds: readonly string[]) => {
  if (boxIds.length === 0) return
  const diagramData = requireRenderData(diagramId)
  const unique = applyFootprintsForIds(diagramData, boxIds)
  const contentChangedIds = new Set(unique)
  // Windows stay unsuspended; suspended parents no-op and rebuild on resume.
  collectWireRenderers().forEach((r) => r.updateNodes(unique, { contentChangedIds }))
}

export const broadcastAddConnection = (connection: DiagramConnection) => {
  collectWireRenderers().forEach((r) => r.addConnection(connection))
}

export const broadcastDeleteConnection = (connection: DiagramConnection) => {
  collectWireRenderers().forEach((r) => r.deleteConnection(connection))
}

export const broadcastRekeyConnection = (rekey: {
  oldKey: string
  connection: DiagramConnection
}) => {
  collectWireRenderers().forEach((r) =>
    r.rekeyConnection(rekey.oldKey, rekey.connection)
  )
}

export const broadcastRemovePortalNodes = (portalIds: readonly string[]) => {
  if (portalIds.length === 0) return
  collectWireRenderers().forEach((r) => {
    for (const id of portalIds) r.removeNode(id)
  })
}

/** Apply connection/portal visual delta without full reloadConnections. */
export const applyWireRenderDelta = (result: PinWireApplyResult) => {
  for (const removed of result.removedConnections) {
    broadcastDeleteConnection(removed)
  }
  for (const rekey of result.rekeyedConnections) {
    broadcastRekeyConnection(rekey)
  }
  broadcastRemovePortalNodes(result.removedPortalIds)
}

/** Full rebuild only when new portal boxes appear (nodes must be mounted). */
export const needsConnectionReload = (result: PinWireApplyResult): boolean =>
  result.createdPortalIds.length > 0

export const reloadAllConnectionRenderers = () => {
  collectWireRenderers().forEach((r) => r.reloadConnections())
}

/** Incremental add, or full reload when portals need mounting. */
export const syncConnectionRenderAfterConnect = (
  result: PinWireApplyResult,
  _appendTargetNodeId?: string
) => {
  if (!result.connection) return
  if (needsConnectionReload(result)) {
    // New portal boxes are not created via addConnection; full wire rebuild for now.
    reloadAllConnectionRenderers()
    return
  }
  applyWireRenderDelta(result)
  broadcastAddConnection(result.connection)
}

export const updateGraphBounds = (diagramId: string) => {
  const diagramData = requireRenderData(diagramId)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  diagramData.allNodes.forEach((node) => {
    const world = getWorldPosition(node)
    if (!world) return
    minX = Math.min(minX, world.x)
    minY = Math.min(minY, world.y)
    maxX = Math.max(maxX, world.x + node.size.width)
    maxY = Math.max(maxY, world.y + node.size.height)
  })

  if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
    diagramData.bounds = {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    }
  }
}

/**
 * Shared paint path for newly added diagram nodes (add / paste / history redo).
 */
export const paintAddedNodes = (
  diagramId: string,
  opts: {
    nodeIds: readonly string[]
    parentRefreshIds?: readonly string[]
    /** Prefer active renderer only (add/paste). History paints all wire renderers. */
    activeOnly?: boolean
  }
) => {
  const diagramData = requireRenderData(diagramId)

  const renderers = opts.activeOnly
    ? (() => {
        const active = getActiveDiagramRenderer()
        return active ? [active] : []
      })()
    : [...collectWireRenderers()]

  if (renderers.length === 0) return

  updateGraphBounds(diagramId)

  const restoredSizeIds = new Set<string>()
  for (const renderer of renderers) {
    for (const diagramNodeId of opts.nodeIds) {
      const diagramNode = diagramData.allNodes.get(diagramNodeId)
      if (!diagramNode || !renderer.isDiagramNodeBelongToThisView(diagramNode)) continue
      if (!opts.activeOnly && isPropertyGroupNode(diagramNode)) {
        restoredSizeIds.add(diagramNodeId)
      }
      renderer.addNode(diagramNode)
    }
  }

  const batchIds = [
    ...new Set([...(opts.parentRefreshIds ?? []), ...restoredSizeIds]),
  ]
  if (batchIds.length > 0) {
    if (opts.activeOnly) {
      updateActiveNodes(batchIds, { contentChangedIds: new Set(batchIds) })
    } else {
      refreshPinFootprints(diagramId, batchIds)
    }
  }
}

/** After wire topology change — bump derived connection panels. */
export function afterWireChangePanels(diagramId: string) {
  bumpConnectionsRevision(diagramId)
}
