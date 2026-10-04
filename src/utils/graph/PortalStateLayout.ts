import { runElkLayeredLayout } from './ElkGraphLayout'

export interface PortalStateLayoutNode {
  id: string
  width: number
  height: number
}

export interface PortalStateBlockInput {
  state: PortalStateLayoutNode
  portals: PortalStateLayoutNode[]
}

export interface PortalStateLayoutOptions {
  stateBlocks: PortalStateBlockInput[]
  /** Vertical gap between state blocks in the column. */
  columnGap?: number
  /** Padding around the union bbox → group size. */
  padding?: number
  nodeNodeSpacing?: number
  layerSpacing?: number
}

export interface PortalStateLayoutResult {
  /** Local positions relative to the states PropertyGroup content origin. */
  positions: Map<string, { x: number; y: number }>
  groupSize: { width: number; height: number }
}

function nodeSize(node: PortalStateLayoutNode): { width: number; height: number } {
  return {
    width: Math.max(1, node.width),
    height: Math.max(1, node.height),
  }
}

function shiftToOrigin(
  positions: Map<string, { x: number; y: number }>
): Map<string, { x: number; y: number }> {
  let minX = Infinity
  let minY = Infinity
  for (const pos of positions.values()) {
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
  }
  if (!Number.isFinite(minX)) return positions

  const out = new Map<string, { x: number; y: number }>()
  for (const [id, pos] of positions) {
    out.set(id, { x: pos.x - minX, y: pos.y - minY })
  }
  return out
}

function measureBlock(
  positions: Map<string, { x: number; y: number }>,
  nodes: PortalStateLayoutNode[]
): { width: number; height: number } {
  let maxX = 0
  let maxY = 0
  for (const node of nodes) {
    const pos = positions.get(node.id)
    if (!pos) continue
    const size = nodeSize(node)
    maxX = Math.max(maxX, pos.x + size.width)
    maxY = Math.max(maxY, pos.y + size.height)
  }
  return { width: maxX, height: maxY }
}

/** Fixed fallback: stack portals left of state, vertically centered. */
function layoutBlockFixed(block: PortalStateBlockInput): Map<string, { x: number; y: number }> {
  const gap = 28
  const stackGap = 8
  const stateSize = nodeSize(block.state)
  const positions = new Map<string, { x: number; y: number }>()

  if (block.portals.length === 0) {
    positions.set(block.state.id, { x: 0, y: 0 })
    return positions
  }

  const portalSizes = block.portals.map(nodeSize)
  const portalsHeight =
    portalSizes.reduce((sum, s) => sum + s.height, 0) +
    Math.max(0, block.portals.length - 1) * stackGap
  const portalsWidth = Math.max(...portalSizes.map((s) => s.width), 1)

  let portalY = Math.max(0, (stateSize.height - portalsHeight) / 2)
  block.portals.forEach((portal, i) => {
    const size = portalSizes[i]!
    positions.set(portal.id, { x: 0, y: portalY })
    portalY += size.height + stackGap
  })

  positions.set(block.state.id, {
    x: portalsWidth + gap,
    y: Math.max(0, (portalsHeight - stateSize.height) / 2),
  })
  return positions
}

async function layoutBlockWithElk(
  block: PortalStateBlockInput,
  options: {
    nodeNodeSpacing: number
    layerSpacing: number
  }
): Promise<Map<string, { x: number; y: number }>> {
  if (block.portals.length === 0) {
    return new Map([[block.state.id, { x: 0, y: 0 }]])
  }

  const nodes = [
    ...block.portals.map((p) => ({ id: p.id, ...nodeSize(p) })),
    { id: block.state.id, ...nodeSize(block.state) },
  ]
  const edges = block.portals.map((portal, i) => ({
    id: `portal-state-${portal.id}-${block.state.id}-${i}`,
    from: portal.id,
    to: block.state.id,
    inputEdge: true,
  }))

  const elkPositions = await runElkLayeredLayout({
    nodes,
    edges,
    direction: 'RIGHT',
    nodeNodeSpacing: options.nodeNodeSpacing,
    layerSpacing: options.layerSpacing,
    padding: 0,
  })

  if (!elkPositions || elkPositions.size === 0) {
    return layoutBlockFixed(block)
  }

  for (const node of nodes) {
    if (!elkPositions.has(node.id)) {
      return layoutBlockFixed(block)
    }
  }

  return shiftToOrigin(elkPositions)
}

/**
 * Per-state ELK (portals → state), then stack blocks in a column with states
 * right-aligned so every State shares the same right edge (portals stick left).
 * Pure layout helper — safe to call again for rearrange.
 */
export async function layoutPortalStateBlocks(
  options: PortalStateLayoutOptions
): Promise<PortalStateLayoutResult> {
  const columnGap = options.columnGap ?? 16
  const padding = options.padding ?? 10
  const nodeNodeSpacing = options.nodeNodeSpacing ?? 16
  const layerSpacing = options.layerSpacing ?? 28

  type PlacedBlock = {
    local: Map<string, { x: number; y: number }>
    width: number
    height: number
    y: number
  }

  const placed: PlacedBlock[] = []
  let cursorY = padding
  let maxWidth = 0

  for (const block of options.stateBlocks) {
    const local = await layoutBlockWithElk(block, { nodeNodeSpacing, layerSpacing })
    const measured = measureBlock(local, [block.state, ...block.portals])
    placed.push({
      local,
      width: measured.width,
      height: measured.height,
      y: cursorY,
    })
    maxWidth = Math.max(maxWidth, measured.width)
    cursorY += measured.height + columnGap
  }

  if (options.stateBlocks.length > 0) {
    cursorY -= columnGap
  }

  const positions = new Map<string, { x: number; y: number }>()
  for (const block of placed) {
    // Right-align block content so State columns line up; portals overhang left.
    const shiftX = padding + (maxWidth - block.width)
    for (const [id, pos] of block.local) {
      positions.set(id, { x: shiftX + pos.x, y: block.y + pos.y })
    }
  }

  return {
    positions,
    groupSize: {
      width: Math.max(maxWidth + padding * 2, 100),
      height: Math.max(cursorY + padding, 80),
    },
  }
}
