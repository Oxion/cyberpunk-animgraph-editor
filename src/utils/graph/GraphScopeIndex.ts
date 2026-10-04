import type { RenderData, RenderNode } from './diagramTypes'
import { getWorldPosition } from './DiagramGeometry'
import {
  isDiagramOverviewLeaf,
  isStateMachineDiagramRoot,
} from './DiagramConversion'

export type ConnectionScope = 'global' | 'internal' | 'cross-in' | 'cross-out'

/** Reads diagram flags set during animgraph → diagram conversion */
export class GraphScopeIndex {
  private readonly graphData: RenderData

  constructor(graphData: RenderData) {
    this.graphData = graphData
  }

  getStateMachineAncestor(nodeId: string): string | null {
    const node = this.graphData.allNodes.get(nodeId)
    if (!node) return null
    let current: RenderNode | undefined = node.parent
    while (current) {
      if (isStateMachineDiagramRoot(current)) {
        return current.id
      }
      current = current.parent
    }
    const ownerSmId = node.metadata?.ownerStateMachineId as string | undefined
    if (ownerSmId) {
      const sm = this.graphData.allNodes.get(ownerSmId)
      if (sm && isStateMachineDiagramRoot(sm)) return sm.id
    }
    return null
  }

  isContainerCollapsed(containerId: string): boolean {
    const node = this.graphData.allNodes.get(containerId)
    if (!node) return false
    return isDiagramOverviewLeaf(node)
  }

  setContainerCollapsed(_containerId: string, _collapsed: boolean): void {
    // Collapse is fixed at conversion time for now
  }

  getOverviewSize(containerId: string): { width: number; height: number } | undefined {
    const node = this.graphData.allNodes.get(containerId)
    if (!node?.size) return undefined
    // Collapsed SM / State / conditionalEntry leaves use stored overview footprint.
    return { width: node.size.width, height: node.size.height }
  }

  /**
   * Main canvas: SM diagram roots (and overview leaves under them) hide descendants
   * until a scope view opens them.
   */
  shouldRenderOnMainGraph(node: RenderNode): boolean {
    if (node.visible === false) return false
    let current: RenderNode | undefined = node.parent
    while (current) {
      if (isDiagramOverviewLeaf(current)) return false
      current = current.parent
    }
    return true
  }

  /**
   * Whether to mount `node` in the active renderer.
   * Descendants of an overview leaf stay hidden unless that leaf is the open scope root
   * (wrapper / state / SM detail view).
   */
  shouldPaintInActiveView(node: RenderNode, scopeRootId: string | null): boolean {
    if (node.visible === false) return false
    let current: RenderNode | undefined = node.parent
    while (current) {
      if (isDiagramOverviewLeaf(current)) {
        return scopeRootId === current.id
      }
      current = current.parent
    }
    return true
  }

  getCollapsedContainerForNode(nodeId: string): string | null {
    const node = this.graphData.allNodes.get(nodeId)
    if (!node) return null
    if (isDiagramOverviewLeaf(node)) {
      return node.id
    }
    // Descendants under a State/CE still portal to the outer SM on main;
    // SM-children lens uses painted-endpoint climb instead.
    return this.getStateMachineAncestor(nodeId)
  }

  getPortalPoint(
    containerId: string,
    towardWorld: { x: number; y: number }
  ): { x: number; y: number } {
    const container = this.graphData.allNodes.get(containerId)
    if (!container?.position) {
      return towardWorld
    }

    const width = this.getOverviewSize(containerId)?.width ?? container.size?.width ?? 120
    const height = this.getOverviewSize(containerId)?.height ?? container.size?.height ?? 80
    const world = getWorldPosition(container)
    if (!world) {
      return towardWorld
    }
    const cx = world.x + width / 2
    const cy = world.y + height / 2
    const dx = towardWorld.x - cx
    const dy = towardWorld.y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 1e-6) {
      return { x: world.x + width, y: cy }
    }

    const dirX = dx / dist
    const dirY = dy / dist
    const intersections: { x: number; y: number; t: number }[] = []
    const left = world.x
    const top = world.y
    const right = left + width
    const bottom = top + height

    const addIfOnEdge = (x: number, y: number, t: number) => {
      if (x >= left - 0.5 && x <= right + 0.5 && y >= top - 0.5 && y <= bottom + 0.5) {
        intersections.push({ x, y, t })
      }
    }

    if (Math.abs(dirX) > 1e-10) {
      let t = (left - cx) / dirX
      addIfOnEdge(left, cy + t * dirY, t)
      t = (right - cx) / dirX
      addIfOnEdge(right, cy + t * dirY, t)
    }
    if (Math.abs(dirY) > 1e-10) {
      let t = (top - cy) / dirY
      addIfOnEdge(cx + t * dirX, top, t)
      t = (bottom - cy) / dirY
      addIfOnEdge(cx + t * dirX, bottom, t)
    }

    const best = intersections
      .filter((p) => p.t > 0)
      .sort((a, b) => a.t - b.t)[0]
      ?? intersections.sort((a, b) => Math.abs(a.t) - Math.abs(b.t))[0]

    return best ? { x: best.x, y: best.y } : { x: right, y: cy }
  }
}
