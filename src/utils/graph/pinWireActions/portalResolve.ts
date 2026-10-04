import type { RenderData, RenderNode } from '../diagramTypes'
import {
  collectOverviewHostChain,
  isDiagramPortalNode,
  parsePortalPinId,
} from '../DiagramConversion'
import {
  findCrossViewConnByPinId,
  isCrossViewPinId,
} from '../crossViewPinIds'
import {
  findCrossViewConnForPinPortal,
  findOutboundPortalHop,
} from '../portalTopology'

export type ConnectEndpoints = {
  logicalFrom: RenderNode
  logicalTo: RenderNode
  logicalPinName: string
  diagramFromId: string
  diagramToId: string
  /** Overview hosts from innermost → outermost that `from` is outside of. */
  hostChain: RenderNode[]
  needsPortal: boolean
}

function resolveLogicalSinkFromCrossViewPin(
  renderData: RenderData,
  host: RenderNode,
  pinName: string
): { sink: RenderNode; diagramHostId: string; pinName: string } | null {
  const conn = findCrossViewConnByPinId(renderData, host, pinName)
  if (!conn) return null
  const sink = renderData.allNodes.get(conn.metadata?.originalTo ?? '')
  if (!sink) return null
  return {
    sink,
    diagramHostId: conn.to,
    pinName: conn.pinName ?? '',
  }
}

/** Legacy `portal:<nodeId>` — resolve via the box's outbound hop wire. */
function resolveLogicalSinkFromLegacyPortalPin(
  renderData: RenderData,
  portalId: string
): { sink: RenderNode; diagramHostId: string; pinName: string } | null {
  const portal = renderData.allNodes.get(portalId)
  if (!portal) return null
  const conn = findCrossViewConnForPinPortal(renderData, portal)
  if (!conn) return null
  const sink = renderData.allNodes.get(conn.metadata?.originalTo ?? '')
  if (!sink) return null
  return {
    sink,
    diagramHostId: conn.to,
    pinName: conn.pinName ?? '',
  }
}

function resolveLogicalSinkFromPortalNode(
  renderData: RenderData,
  portal: RenderNode
): RenderNode | null {
  const hop = findOutboundPortalHop(renderData, portal.id)
  if (!hop) return null
  const originalTo = hop.metadata?.originalTo
  if (typeof originalTo === 'string' && originalTo) {
    return renderData.allNodes.get(originalTo) ?? null
  }
  const sink = renderData.allNodes.get(hop.to)
  if (sink && !isDiagramPortalNode(sink)) return sink
  return null
}

/**
 * Resolve UI endpoints to logical animgraph pin owner + portal hop needs.
 */
export function resolveConnectEndpoints(
  renderData: RenderData,
  fromId: string,
  toId: string,
  pinName: string
): ConnectEndpoints | null {
  const fromNode = renderData.allNodes.get(fromId)
  const toNode = renderData.allNodes.get(toId)
  if (!fromNode || !toNode) return null

  let logicalPinName = pinName
  let logicalTo = toNode
  let diagramToId = toId

  if (isCrossViewPinId(pinName)) {
    const resolved = resolveLogicalSinkFromCrossViewPin(renderData, toNode, pinName)
    if (!resolved) return null
    logicalTo = resolved.sink
    diagramToId = resolved.diagramHostId
    logicalPinName = resolved.pinName
  } else if (pinName.startsWith('portal:')) {
    const portalId = parsePortalPinId(pinName)
    if (!portalId) return null
    const resolved = resolveLogicalSinkFromLegacyPortalPin(renderData, portalId)
    if (!resolved) return null
    logicalTo = resolved.sink
    diagramToId = resolved.diagramHostId
    logicalPinName = resolved.pinName
  } else if (isDiagramPortalNode(toNode)) {
    const sink = resolveLogicalSinkFromPortalNode(renderData, toNode)
    if (sink) logicalTo = sink
  }

  const hostChain = collectOverviewHostChain(logicalTo, fromNode)
  const needsPortal = hostChain.length > 0

  return {
    logicalFrom: fromNode,
    logicalTo,
    logicalPinName,
    diagramFromId: fromId,
    diagramToId,
    hostChain,
    needsPortal,
  }
}

export { makePortalPinId, parsePortalPinId } from '../DiagramConversion'
