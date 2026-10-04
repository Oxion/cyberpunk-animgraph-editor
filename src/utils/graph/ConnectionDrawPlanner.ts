import type { DiagramConnection, RenderData, RenderNode } from './diagramTypes'
import { GraphScopeIndex } from './GraphScopeIndex'
import { connectionPointBetweenNodes } from './DiagramGeometry'

export interface PlannedConnection {
  from: { x: number; y: number }
  to: { x: number; y: number }
  pinName?: string
  dashed?: boolean
  showArrow?: boolean
}

export type MainGraphVisibility = (node: RenderNode) => boolean

function planEdgeToEdge(
  fromNode: RenderNode,
  toNode: RenderNode,
  overview: (id: string) => { width: number; height: number } | undefined
): PlannedConnection | null {
  const fromPt = connectionPointBetweenNodes(fromNode, toNode, overview)
  const toPt = connectionPointBetweenNodes(toNode, fromNode, overview)
  if (!fromPt || !toPt) return null
  return { from: fromPt, to: toPt }
}

/**
 * Decide whether and where to draw a connection on the main graph.
 * Skips hidden↔hidden links (the main source of lines in empty space).
 */
export function planMainGraphConnection(
  connection: DiagramConnection,
  graphData: RenderData,
  graphScope: GraphScopeIndex,
  isNodeVisible: MainGraphVisibility
): PlannedConnection | undefined {
  const fromNode = graphData.allNodes.get(connection.from)
  const toNode = graphData.allNodes.get(connection.to)
  if (!fromNode || !toNode) return

  const fromVisible = isNodeVisible(fromNode)
  const toVisible = isNodeVisible(toNode)

  if (!fromVisible && !toVisible) {
    return
  }

  const overview = (id: string) => graphScope.getOverviewSize(id)
  const fromContainer = graphScope.getCollapsedContainerForNode(connection.from)
  const toContainer = graphScope.getCollapsedContainerForNode(connection.to)

  if (fromContainer && toContainer && fromContainer === toContainer) {
    return
  }

  if (fromVisible && toVisible) {
    const planned = planEdgeToEdge(fromNode, toNode, overview)
    return planned ? { ...planned, pinName: connection.pinName } : undefined
  }

  if (fromVisible && !toVisible && toContainer) {
    const host = graphData.allNodes.get(toContainer) ?? toNode
    const fromPt = connectionPointBetweenNodes(fromNode, host, overview)
    if (!fromPt) return
    const toPt = graphScope.getPortalPoint(toContainer, fromPt)
    return { from: fromPt, to: toPt, pinName: connection.pinName }
  }

  if (!fromVisible && toVisible && fromContainer) {
    const host = graphData.allNodes.get(fromContainer) ?? fromNode
    const toPt = connectionPointBetweenNodes(toNode, host, overview)
    if (!toPt) return
    const fromPt = graphScope.getPortalPoint(fromContainer, toPt)
    return { from: fromPt, to: toPt, pinName: connection.pinName }
  }

  return
}

/**
 * Connections inside a scoped subgraph (both endpoints in scope).
 * Prefer Pixi/Konva lens planners for portals + nested SM leaves.
 */
export function planScopedConnection(
  connection: DiagramConnection,
  graphData: RenderData,
  scopeIds: Set<string>,
  graphScope: GraphScopeIndex
): PlannedConnection | null {
  if (!scopeIds.has(connection.from) || !scopeIds.has(connection.to)) {
    return null
  }

  const fromNode = graphData.allNodes.get(connection.from)
  const toNode = graphData.allNodes.get(connection.to)
  if (!fromNode || !toNode) return null

  const overview = (id: string) => graphScope.getOverviewSize(id)
  const planned = planEdgeToEdge(fromNode, toNode, overview)
  return planned ? { ...planned, pinName: connection.pinName } : null
}
