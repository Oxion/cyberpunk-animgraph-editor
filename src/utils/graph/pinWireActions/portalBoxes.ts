import type { RenderData } from '../diagramTypes'
import { removeChild } from '../nodeChildSlots'

export function removePortalBox(renderData: RenderData, portalId: string): void {
  const portal = renderData.allNodes.get(portalId)
  if (!portal) return
  if (portal.parent) removeChild(portal.parent, portal)
  renderData.allNodes.delete(portalId)
  renderData.connections = renderData.connections.filter(
    (c) => c.from !== portalId && c.to !== portalId
  )
}