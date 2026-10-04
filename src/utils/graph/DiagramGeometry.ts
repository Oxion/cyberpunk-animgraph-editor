import type { RenderNode } from './diagramTypes'
import { forEachDirectChild } from './nodeChildSlots'

export interface RectBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Absolute (world/stage) top-left of a node.
 * Roots store world in `position`; children store local offsets to parent.
 */
export function getWorldPosition(node: RenderNode): { x: number; y: number } | null {
  if (!node.position) return null
  let x = node.position.x
  let y = node.position.y
  let current = node.parent
  while (current) {
    if (!current.position) return null
    x += current.position.x
    y += current.position.y
    current = current.parent
  }
  return { x, y }
}

export function getNodeDisplaySize(
  node: RenderNode,
  overviewSize?: { width: number; height: number }
): { width: number; height: number } {
  if (overviewSize) return overviewSize
  const w = node.size?.width
  const h = node.size?.height
  return {
    width: w && w > 0 ? w : 120,
    height: h && h > 0 ? h : 80,
  }
}

/** Bounds used for connection anchors (outer visual frame of each node) in WORLD space */
export function getConnectionAnchorBounds(
  node: RenderNode,
  getOverviewSize?: (nodeId: string) => { width: number; height: number } | undefined
): RectBounds | null {
  const world = getWorldPosition(node)
  if (!world) return null
  const size = getNodeDisplaySize(node, getOverviewSize?.(node.id))
  return {
    x: world.x,
    y: world.y,
    width: size.width,
    height: size.height,
  }
}

export function getWorldBounds(
  node: RenderNode,
  getOverviewSize?: (nodeId: string) => { width: number; height: number } | undefined
): RectBounds | null {
  return getConnectionAnchorBounds(node, getOverviewSize)
}

/** Collect descendant node ids (not including `node` itself). */
export function collectDescendantIds(node: RenderNode, out: Set<string> = new Set()): Set<string> {
  forEachDirectChild(node, (child) => {
    if (child.id) out.add(child.id)
    collectDescendantIds(child, out)
  })
  return out
}

/**
 * Expand moved ids with descendants — local coords of children do not change when a
 * parent moves, but their world tiles / connection endpoints do.
 */
export function expandNodeIdsWithDescendants(
  nodeIds: string[],
  allNodes: Map<string, RenderNode>
): string[] {
  const out = new Set(nodeIds)
  for (const id of nodeIds) {
    const node = allNodes.get(id)
    if (node) collectDescendantIds(node, out)
  }
  return [...out]
}

const CONNECTION_BORDER_INSET = 1
const CONNECTION_ARROW_LENGTH = 8

/** Pull line endpoints slightly inward so strokes/arrows sit on the border, not inside the fill */
export function adjustConnectionEndpointsForDrawing(
  from: { x: number; y: number },
  to: { x: number; y: number },
  showArrow = true
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return { from, to }

  const ux = dx / len
  const uy = dy / len
  const endInset = CONNECTION_BORDER_INSET + (showArrow ? CONNECTION_ARROW_LENGTH : CONNECTION_BORDER_INSET)
  const startInset = CONNECTION_BORDER_INSET

  return {
    from: { x: from.x + ux * startInset, y: from.y + uy * startInset },
    to: { x: to.x - ux * endInset, y: to.y - uy * endInset },
  }
}

/** Edge point on rect facing toward another point */
export function borderPointOnRect(
  bounds: RectBounds,
  towardX: number,
  towardY: number
): { x: number; y: number } {
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const dx = towardX - cx
  const dy = towardY - cy
  const distance = Math.sqrt(dx * dx + dy * dy)

  if (distance < 1e-6) {
    return { x: bounds.x + bounds.width, y: cy }
  }

  const dirX = dx / distance
  const dirY = dy / distance
  const intersections: { x: number; y: number; t: number }[] = []
  const left = bounds.x
  const top = bounds.y
  const right = left + bounds.width
  const bottom = top + bounds.height

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

  const best =
    intersections.filter((p) => p.t > 0).sort((a, b) => a.t - b.t)[0] ??
    intersections.sort((a, b) => Math.abs(a.t) - Math.abs(b.t))[0]

  return best ? { x: best.x, y: best.y } : { x: cx, y: cy }
}

export function connectionPointBetweenNodes(
  node: RenderNode,
  other: RenderNode,
  getOverviewSize?: (nodeId: string) => { width: number; height: number } | undefined
): { x: number; y: number } | null {
  const bounds = getConnectionAnchorBounds(node, getOverviewSize)
  const otherBounds = getConnectionAnchorBounds(other, getOverviewSize)
  if (!bounds || !otherBounds) return null
  const otherCx = otherBounds.x + otherBounds.width / 2
  const otherCy = otherBounds.y + otherBounds.height / 2
  return borderPointOnRect(bounds, otherCx, otherCy)
}
