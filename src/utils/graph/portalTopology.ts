import type {
  CrossViewConnection,
  DiagramConnection,
  RenderData,
  RenderNode,
} from './diagramTypes'
import { crossViewWireKey, isCrossViewConnection } from './diagramModel'

export type { CrossViewConnection } from './diagramTypes'
export { crossViewWireKey, isCrossViewConnection } from './diagramModel'

const DIAGRAM_PORTAL_TYPE = 'diagram-portal'

export function isDeepPortalNode(node: RenderNode): boolean {
  return node.type === DIAGRAM_PORTAL_TYPE && node.id.startsWith('diagram_portal_in_')
}

/** Bridge / state-entry portal parked as sibling of an overview host. */
export function isBridgePortalNode(node: RenderNode): boolean {
  return (
    node.type === DIAGRAM_PORTAL_TYPE &&
    (node.id.startsWith('diagram_portal_host_') || node.id.startsWith('diagram_portal_state_'))
  )
}

export function parseIndexedPortalEntityId(portalId: string, prefix: string): string | null {
  if (!portalId.startsWith(prefix)) return null
  const rest = portalId.slice(prefix.length)
  const match = rest.match(/^(.+)_(\d+)$/)
  return match ? match[1]! : null
}

export function bridgePortalHostId(portal: RenderNode): string | null {
  return (
    parseIndexedPortalEntityId(portal.id, 'diagram_portal_host_') ??
    parseIndexedPortalEntityId(portal.id, 'diagram_portal_state_')
  )
}

/** Portal-box outbound: diagram `from` is not the logical source. */
export function isCrossViewPortalHop(conn: CrossViewConnection): boolean {
  return conn.from !== conn.metadata.originalFrom
}

export function isPortalHopConnection(conn: DiagramConnection): conn is CrossViewConnection {
  return isCrossViewConnection(conn) && isCrossViewPortalHop(conn)
}

export function crossViewKeysMatch(
  conn: DiagramConnection,
  originalFrom: string,
  originalTo: string,
  pinName: string
): boolean {
  return (
    conn.metadata?.originalFrom === originalFrom &&
    conn.metadata?.originalTo === originalTo &&
    (conn.pinName ?? '') === pinName
  )
}

function wireKeyOfHop(conn: DiagramConnection): string | null {
  const originalFrom = conn.metadata?.originalFrom
  const originalTo = conn.metadata?.originalTo
  if (typeof originalFrom !== 'string' || originalFrom === '') return null
  if (typeof originalTo !== 'string' || originalTo === '') return null
  return crossViewWireKey(originalFrom, originalTo, conn.pinName ?? '')
}

type PortalHopIndex = {
  /** Portal box id → its single outbound hop. */
  outboundByFrom: Map<string, DiagramConnection>
  hopsByWireKey: Map<string, DiagramConnection[]>
}

function buildPortalHopIndex(connections: DiagramConnection[]): PortalHopIndex {
  const outboundByFrom = new Map<string, DiagramConnection>()
  const hopsByWireKey = new Map<string, DiagramConnection[]>()
  for (const c of connections) {
    if (!isPortalHopConnection(c)) continue
    if (!outboundByFrom.has(c.from)) outboundByFrom.set(c.from, c)
    const key = wireKeyOfHop(c)
    if (!key) continue
    let list = hopsByWireKey.get(key)
    if (!list) {
      list = []
      hopsByWireKey.set(key, list)
    }
    list.push(c)
  }
  return { outboundByFrom, hopsByWireKey }
}

function hopsForWire(
  hopIndex: PortalHopIndex,
  originalFrom: string,
  originalTo: string,
  pinName: string
): DiagramConnection[] {
  return hopIndex.hopsByWireKey.get(crossViewWireKey(originalFrom, originalTo, pinName)) ?? []
}

type CrossViewPortalPinIndex = {
  hopIndex: PortalHopIndex
  crossViewConns: CrossViewConnection[]
  connByPinPortalId: Map<string, DiagramConnection>
}

type IndexCacheEntry = {
  connectionsRef: DiagramConnection[]
  index: CrossViewPortalPinIndex
}

const indexCache = new WeakMap<RenderData, IndexCacheEntry>()

export function invalidateCrossViewPortalPinIndex(renderData: RenderData): void {
  indexCache.delete(renderData)
}

function buildCrossViewPortalPinIndex(diagramData: RenderData): CrossViewPortalPinIndex {
  const hopIndex = buildPortalHopIndex(diagramData.connections)
  const crossViewConns = diagramData.connections.filter(
    (c): c is CrossViewConnection => isCrossViewConnection(c) && !isCrossViewPortalHop(c)
  )
  const connByPinPortalId = new Map<string, DiagramConnection>()
  const connByWireKey = new Map<string, DiagramConnection>()

  for (const conn of crossViewConns) {
    connByWireKey.set(
      crossViewWireKey(conn.metadata.originalFrom, conn.metadata.originalTo, conn.pinName ?? ''),
      conn
    )
  }

  hopIndex.outboundByFrom.forEach((hop, portalId) => {
    const key = wireKeyOfHop(hop)
    if (!key) return
    const conn = connByWireKey.get(key)
    if (conn) connByPinPortalId.set(portalId, conn)
  })

  return { hopIndex, crossViewConns, connByPinPortalId }
}

function getCrossViewPortalPinIndex(renderData: RenderData): CrossViewPortalPinIndex {
  const cached = indexCache.get(renderData)
  if (cached && cached.connectionsRef === renderData.connections) {
    return cached.index
  }
  const index = buildCrossViewPortalPinIndex(renderData)
  indexCache.set(renderData, { connectionsRef: renderData.connections, index })
  return index
}

/** Single outbound hop from a portal box, or null if the box is orphaned. */
export function findOutboundPortalHop(
  renderData: RenderData,
  portalId: string
): DiagramConnection | null {
  return getCrossViewPortalPinIndex(renderData).hopIndex.outboundByFrom.get(portalId) ?? null
}

function findDeepPortalForWireIndexed(
  renderData: RenderData,
  originalTo: string,
  originalFrom: string,
  pinName: string,
  index: CrossViewPortalPinIndex
): RenderNode | null {
  for (const hop of hopsForWire(index.hopIndex, originalFrom, originalTo, pinName)) {
    if (hop.to !== originalTo) continue
    const node = renderData.allNodes.get(hop.from)
    if (node && isDeepPortalNode(node)) return node
  }
  return null
}

/** Deep portal whose single outbound hop is this logical wire into `originalTo`. */
export function findDeepPortalForWire(
  renderData: RenderData,
  originalTo: string,
  originalFrom: string,
  pinName: string
): RenderNode | null {
  return findDeepPortalForWireIndexed(
    renderData,
    originalTo,
    originalFrom,
    pinName,
    getCrossViewPortalPinIndex(renderData)
  )
}

export function findCrossViewConnForPinPortal(
  renderData: RenderData,
  pinPortal: RenderNode
): DiagramConnection | null {
  const index = getCrossViewPortalPinIndex(renderData)
  const direct = index.connByPinPortalId.get(pinPortal.id)
  if (direct) return direct

  const hop = index.hopIndex.outboundByFrom.get(pinPortal.id)
  const key = hop ? wireKeyOfHop(hop) : null
  if (!key) return null
  return (
    index.crossViewConns.find(
      (c) =>
        crossViewWireKey(c.metadata.originalFrom, c.metadata.originalTo, c.pinName ?? '') === key
    ) ?? null
  )
}

/** Bridge parked beside `host` whose outbound hop is this logical wire. */
export function findBridgePortalForWire(
  renderData: RenderData,
  parent: RenderNode,
  hostId: string,
  originalFrom: string,
  originalTo: string,
  pinName: string
): RenderNode | null {
  const index = getCrossViewPortalPinIndex(renderData)
  for (const hop of hopsForWire(index.hopIndex, originalFrom, originalTo, pinName)) {
    if (hop.to !== hostId) continue
    const node = renderData.allNodes.get(hop.from)
    if (
      node &&
      isBridgePortalNode(node) &&
      node.parent?.id === parent.id &&
      bridgePortalHostId(node) === hostId
    ) {
      return node
    }
  }
  return null
}

/** Portal boxes whose outbound hop belongs to this logical wire. */
export function collectPortalChainForCrossView(
  renderData: RenderData,
  conn: DiagramConnection
): Set<string> {
  const portals = new Set<string>()
  const originalFrom = conn.metadata?.originalFrom
  const originalTo = conn.metadata?.originalTo
  if (typeof originalFrom !== 'string' || originalFrom === '') return portals
  if (typeof originalTo !== 'string' || originalTo === '') return portals

  const pinName = conn.pinName ?? ''
  const index = getCrossViewPortalPinIndex(renderData)
  for (const hop of hopsForWire(index.hopIndex, originalFrom, originalTo, pinName)) {
    const from = renderData.allNodes.get(hop.from)
    if (from?.type === DIAGRAM_PORTAL_TYPE) portals.add(from.id)
  }
  return portals
}

export function collectHostBoxIdsForPortalChain(
  renderData: RenderData,
  portalIds: Iterable<string>
): string[] {
  const hosts = new Set<string>()
  for (const id of portalIds) {
    const portal = renderData.allNodes.get(id)
    if (!portal) continue
    const hostId = bridgePortalHostId(portal)
    if (hostId) hosts.add(hostId)
    let sm: RenderNode | null = portal
    while (sm) {
      if (
        sm.type === 'animAnimNode_StateMachine' ||
        sm.type === 'animAnimNode_StateMachineDiagram'
      ) {
        hosts.add(sm.id)
        break
      }
      sm = sm.parent ?? null
    }
  }
  return [...hosts]
}
