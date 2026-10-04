import type { DiagramConnection, RenderData, RenderNode } from './diagramTypes'
import { borderPointOnRect, getWorldPosition, type RectBounds } from './DiagramGeometry'
import type { PlannedConnection } from './ConnectionDrawPlanner'
import { walkBodySubtree } from './nodeChildSlots'

/** All render node ids in the body subtree rooted at `rootId` (inclusive; default slot only). */
export function collectLensScopeNodeIds(graphData: RenderData, rootId: string): Set<string> {
  const ids = new Set<string>()
  const root = graphData.allNodes.get(rootId)
  if (!root) return ids

  walkBodySubtree(root, (node) => {
    ids.add(node.id)
  })
  return ids
}

/**
 * Connections that touch the lens scope: internal (both ends) or cross-boundary
 * (exactly one end outside — drawn as a portal stub).
 */
export function filterConnectionsForLensScope(
  connections: DiagramConnection[],
  scopeIds: Set<string>
): DiagramConnection[] {
  return connections.filter((c) => scopeIds.has(c.from) || scopeIds.has(c.to))
}

function centerOf(bounds: RectBounds): { x: number; y: number } {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
}

/**
 * Map a world-space direction (outside node vs scope root) onto a point outside
 * the lens-space portal frame, so `borderPointOnRect` lands on the correct edge.
 */
export function lensPortalTowardFromWorld(
  portalBounds: RectBounds,
  outsideNode: RenderNode,
  scopeRoot: RenderNode | null
): { x: number; y: number } {
  const c = centerOf(portalBounds)
  const outWorld = getWorldPosition(outsideNode)
  const rootWorld = scopeRoot ? getWorldPosition(scopeRoot) : null
  if (outWorld && rootWorld) {
    return {
      x: c.x + (outWorld.x - rootWorld.x),
      y: c.y + (outWorld.y - rootWorld.y),
    }
  }
  return { x: portalBounds.x - 80, y: c.y }
}

export function planLensPortalStub(
  insideBounds: RectBounds,
  portalBounds: RectBounds,
  towardOutside: { x: number; y: number },
  insideIsFrom: boolean,
  pinName?: string
): PlannedConnection {
  const portalPt = borderPointOnRect(portalBounds, towardOutside.x, towardOutside.y)
  const insidePt = borderPointOnRect(insideBounds, portalPt.x, portalPt.y)
  if (insideIsFrom) {
    return { from: insidePt, to: portalPt, pinName }
  }
  return { from: portalPt, to: insidePt, pinName }
}

export function planLensInternalEdge(
  fromBounds: RectBounds,
  toBounds: RectBounds,
  pinName?: string
): PlannedConnection {
  const toC = centerOf(toBounds)
  const fromC = centerOf(fromBounds)
  return {
    from: borderPointOnRect(fromBounds, toC.x, toC.y),
    to: borderPointOnRect(toBounds, fromC.x, fromC.y),
    pinName,
  }
}
