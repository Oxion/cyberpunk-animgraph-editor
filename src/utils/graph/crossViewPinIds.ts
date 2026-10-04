import type { DiagramConnection, RenderData, RenderNode } from './diagramTypes'
import type { CrossViewConnection } from './portalTopology'
import {
  collectPortalChainForCrossView,
  crossViewWireKey,
  findCrossViewConnForPinPortal,
  isCrossViewConnection,
  isCrossViewPortalHop,
} from './portalTopology'

export const CROSS_VIEW_PIN_PREFIX = 'xview:'

/** UI pin id for a cross-view diamond row — keyed by logical wire, not portal node id. */
export function makeCrossViewPinId(conn: DiagramConnection): string | null {
  if (!isCrossViewConnection(conn)) return null
  return makeCrossViewConnectionPortalPinId(conn)
}

export function makeCrossViewConnectionPortalPinId(conn: CrossViewConnection): string {
  return `${CROSS_VIEW_PIN_PREFIX}${crossViewWireKey(conn.metadata.originalFrom, conn.metadata.originalTo, conn.pinName)}`
}

export function isCrossViewPinId(pinId: string): boolean {
  return pinId.startsWith(CROSS_VIEW_PIN_PREFIX)
}

/** Cross-view diamond pins and legacy `portal:` ids (read shim). */
export function isVirtualOverviewPinId(pinId: string): boolean {
  return isCrossViewPinId(pinId) || pinId.startsWith('portal:')
}

/** 
 * @todo how its related to pins
 * Cross-view diagram connections whose `to` is this host (pin row lives on `to`). 
 */
export function getCrossViewConnsForHost(
  diagramData: RenderData,
  host: RenderNode
): CrossViewConnection[] {
  return diagramData.connections.filter((conn): conn is CrossViewConnection => {
    return isCrossViewConnection(conn) && conn.to === host.id
  })
}

export function findCrossViewConnByPinId(
  renderData: RenderData,
  host: RenderNode,
  pinId: string
): DiagramConnection | null {
  if (!isCrossViewPinId(pinId)) return null
  return (
    getCrossViewConnsForHost(renderData, host).find(
      (c) => makeCrossViewConnectionPortalPinId(c) === pinId
    ) ?? null
  )
}

/** Cross-view diamond pin id for a portal hop landing on `host`. */
export function resolveCrossViewPinIdForPortal(
  renderData: RenderData,
  portal: RenderNode,
  host: RenderNode
): string | null {
  for (const c of getCrossViewConnsForHost(renderData, host)) {
    const chain = collectPortalChainForCrossView(renderData, c)
    if (chain.has(portal.id)) return makeCrossViewPinId(c)
  }
  const viaPortal = findCrossViewConnForPinPortal(renderData, portal)
  if (viaPortal && viaPortal.to === host.id) return makeCrossViewPinId(viaPortal)
  return null
}

/** Promote a painted hop / materialized edge to the logical cross-view connection. */
export function resolveLogicalConnFromGrab(
  renderData: RenderData,
  grabbed: DiagramConnection
): DiagramConnection {
  if (isCrossViewConnection(grabbed) && !isCrossViewPortalHop(grabbed)) return grabbed

  for (const c of renderData.connections) {
    if (!isCrossViewConnection(c) || isCrossViewPortalHop(c)) continue
    const chain = collectPortalChainForCrossView(renderData, c)
    if (chain.has(grabbed.from) || chain.has(grabbed.to)) return c
  }

  return grabbed
}
