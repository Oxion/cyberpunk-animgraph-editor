import { compareDirectInputPinOrder, type ElkLayeredEdgeInput } from './ElkGraphLayout'
import type {
  DirectChildrenLayoutInput,
  DirectChildrenLayoutOutput,
  LayoutDebugContainer,
} from './DirectChildrenLayout'
import { throwDirectChildrenLayoutError } from './DirectChildrenLayout'

const DEFAULT_NODE_SPACING = 28
const DEFAULT_LAYER_SPACING = 56
const LAYOUT_PADDING = 12

type LayoutNode = DirectChildrenLayoutInput['nodes'][number]

interface BranchLayout {
  positions: Map<string, { x: number; y: number }>
  minX: number
  minY: number
  maxX: number
  maxY: number
  debugContainers: LayoutDebugContainer[]
  splitNodeId: string
  splitY: number
}

function nodeByIdMap(nodes: LayoutNode[]): Map<string, LayoutNode> {
  return new Map(nodes.map((node) => [node.id, node]))
}

function middleOutIndices(count: number): number[] {
  if (count <= 0) return []
  const mid = Math.floor((count - 1) / 2)
  const order = [mid]
  let up = mid - 1
  let down = mid + 1
  while (up >= 0 || down < count) {
    if (up >= 0) order.push(up--)
    if (down < count) order.push(down++)
  }
  return order
}

function directInputIds(
  hubId: string,
  nodeIds: Set<string>,
  edges: ElkLayeredEdgeInput[]
): string[] {
  const found: Array<{ from: string; edgeId: string; pinName?: string }> = []
  for (const edge of edges) {
    if (edge.to !== hubId || !nodeIds.has(edge.from) || edge.from === hubId) continue
    found.push({ from: edge.from, edgeId: edge.id, pinName: edge.pinName })
  }
  found.sort((a, b) => {
    const pinOrder = compareDirectInputPinOrder(a.pinName, b.pinName)
    if (pinOrder !== 0) return pinOrder
    return a.edgeId.localeCompare(b.edgeId)
  })
  const seen = new Set<string>()
  const ids: string[] = []
  for (const item of found) {
    if (seen.has(item.from)) continue
    seen.add(item.from)
    ids.push(item.from)
  }
  return ids
}

function findSinkIds(nodeIds: Set<string>, edges: ElkLayeredEdgeInput[]): string[] {
  const hasOutgoing = new Set<string>()
  for (const edge of edges) {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) hasOutgoing.add(edge.from)
  }
  const sinks = [...nodeIds].filter((id) => !hasOutgoing.has(id))
  return sinks.length > 0 ? sinks : [...nodeIds]
}

function distanceToSinkMap(
  nodeIds: Set<string>,
  edges: ElkLayeredEdgeInput[]
): Map<string, number> {
  const dist = new Map<string, number>()
  const reverse = new Map<string, string[]>()
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to) continue
    const list = reverse.get(edge.to)
    if (list) list.push(edge.from)
    else reverse.set(edge.to, [edge.from])
  }
  const queue = findSinkIds(nodeIds, edges)
  for (const id of queue) dist.set(id, 0)
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!
    const d = dist.get(id) ?? 0
    for (const from of reverse.get(id) ?? []) {
      if (dist.has(from)) continue
      dist.set(from, d + 1)
      queue.push(from)
    }
  }
  return dist
}

/** Own the node for the consumer closest to a sink (rightmost). */
function primaryConsumerMap(
  nodeIds: Set<string>,
  edges: ElkLayeredEdgeInput[]
): Map<string, string> {
  const dist = distanceToSinkMap(nodeIds, edges)
  const owner = new Map<string, string>()
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to) continue
    const d = dist.get(edge.to) ?? Number.POSITIVE_INFINITY
    const prev = owner.get(edge.from)
    if (!prev) {
      owner.set(edge.from, edge.to)
      continue
    }
    const prevD = dist.get(prev) ?? Number.POSITIVE_INFINITY
    if (d < prevD) owner.set(edge.from, edge.to)
  }
  return owner
}

function translateBranch(branch: BranchLayout, dx: number, dy: number): BranchLayout {
  if (dx === 0 && dy === 0) return branch
  const positions = new Map<string, { x: number; y: number }>()
  for (const [id, pos] of branch.positions) {
    positions.set(id, { x: pos.x + dx, y: pos.y + dy })
  }
  return {
    positions,
    minX: branch.minX + dx,
    minY: branch.minY + dy,
    maxX: branch.maxX + dx,
    maxY: branch.maxY + dy,
    debugContainers: branch.debugContainers.map((box) => ({
      ...box,
      x: box.x + dx,
      y: box.y + dy,
    })),
    splitNodeId: branch.splitNodeId,
    splitY: branch.splitY + dy,
  }
}

function measurePositions(
  positions: Map<string, { x: number; y: number }>,
  nodeMap: Map<string, LayoutNode>
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [id, pos] of positions) {
    const node = nodeMap.get(id)
    const width = node?.width ?? 1
    const height = node?.height ?? 1
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
    maxX = Math.max(maxX, pos.x + width)
    maxY = Math.max(maxY, pos.y + height)
  }
  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}

function pinConnectingNode(branch: BranchLayout, nodeId: string): BranchLayout {
  const local = branch.positions.get(nodeId) ?? { x: 0, y: 0 }
  return translateBranch(branch, -local.x, -local.y)
}

function emptyBranch(hubId: string): BranchLayout {
  return {
    positions: new Map(),
    minX: 0,
    minY: 0,
    maxX: 1,
    maxY: 1,
    debugContainers: [],
    splitNodeId: hubId,
    splitY: 0,
  }
}

interface LayoutRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function nodeRect(x: number, y: number, node: LayoutNode): LayoutRect {
  return { minX: x, minY: y, maxX: x + node.width, maxY: y + node.height }
}

function aabbOfIds(
  positions: Map<string, { x: number; y: number }>,
  ids: Iterable<string>,
  nodeMap: Map<string, LayoutNode>
): LayoutRect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const id of ids) {
    const pos = positions.get(id)
    const node = nodeMap.get(id)
    if (!pos || !node) continue
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
    maxX = Math.max(maxX, pos.x + node.width)
    maxY = Math.max(maxY, pos.y + node.height)
  }
  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}

function rectsOverlap(a: LayoutRect, b: LayoutRect, spacing: number): boolean {
  return (
    a.minX < b.maxX + spacing &&
    a.maxX + spacing > b.minX &&
    a.minY < b.maxY + spacing &&
    a.maxY + spacing > b.minY
  )
}

function pushDyToClearBoxes(
  boxes: LayoutRect[],
  occupied: LayoutRect[],
  direction: 'up' | 'down',
  spacing: number
): number {
  if (boxes.length === 0 || occupied.length === 0) return 0
  let dy = 0
  const limit = occupied.length * boxes.length + 8
  for (let step = 0; step < limit; step++) {
    let next = dy
    let hit = false
    for (const box of boxes) {
      const shifted: LayoutRect = {
        minX: box.minX,
        maxX: box.maxX,
        minY: box.minY + dy,
        maxY: box.maxY + dy,
      }
      for (const rect of occupied) {
        if (!rectsOverlap(shifted, rect, spacing)) continue
        hit = true
        if (direction === 'up') {
          next = Math.min(next, rect.minY - spacing - box.maxY)
        } else {
          next = Math.max(next, rect.maxY + spacing - box.minY)
        }
      }
    }
    if (!hit) return dy
    if (next === dy) return dy
    dy = next
  }
  return dy
}

type TreeSide = 'high' | 'low' | 'center'

function subtreeSide(index: number, count: number, parentSide: TreeSide): TreeSide {
  if (parentSide === 'high') return 'high'
  if (parentSide === 'low') return 'low'
  if (count <= 1) return 'center'
  if (count === 2) return index === 0 ? 'high' : 'low'
  const mid = (count - 1) / 2
  if (index < mid) return 'high'
  if (index > mid) return 'low'
  return 'center'
}

interface PreparedChild {
  id: string
  node: LayoutNode
  layout: BranchLayout
  connectX: number
  extraDx: number
  localPositions: Map<string, { x: number; y: number }>
  boxes: LayoutRect[]
}

function prepareChild(
  child: { id: string; node: LayoutNode; layout: BranchLayout },
  columnWidth: number,
  nodeMap: Map<string, LayoutNode>
): PreparedChild {
  const connectX = columnWidth - child.node.width
  const deeperIds = [...child.layout.positions.keys()].filter((id) => id !== child.id)
  const deepLocal = aabbOfIds(child.layout.positions, deeperIds, nodeMap)
  const extraDx = deepLocal ? Math.min(0, -deepLocal.maxX) : 0
  const localPositions = new Map<string, { x: number; y: number }>()
  const boxes: LayoutRect[] = []
  localPositions.set(child.id, { x: connectX, y: 0 })
  boxes.push(nodeRect(connectX, 0, child.node))
  for (const [id, pos] of child.layout.positions) {
    if (id === child.id) continue
    const node = nodeMap.get(id)
    if (!node) continue
    const local = { x: pos.x + extraDx + connectX, y: pos.y }
    localPositions.set(id, local)
    boxes.push(nodeRect(local.x, local.y, node))
  }
  return {
    id: child.id,
    node: child.node,
    layout: child.layout,
    connectX,
    extraDx,
    localPositions,
    boxes,
  }
}

function commitChild(
  child: PreparedChild,
  dy: number,
  merged: Map<string, { x: number; y: number }>,
  occupied: LayoutRect[],
  debugContainers: LayoutDebugContainer[],
  nodeMap: Map<string, LayoutNode>
): void {
  for (const [id, pos] of child.localPositions) {
    const world = { x: pos.x, y: pos.y + dy }
    merged.set(id, world)
    const node = nodeMap.get(id)
    if (node) occupied.push(nodeRect(world.x, world.y, node))
  }
  for (const box of child.layout.debugContainers) {
    debugContainers.push({
      ...box,
      x: box.x + child.extraDx + child.connectX,
      y: box.y + dy,
    })
  }
}

function placeChild(
  child: PreparedChild,
  occupied: LayoutRect[],
  direction: 'up' | 'down',
  nodeSpacing: number,
  merged: Map<string, { x: number; y: number }>,
  debugContainers: LayoutDebugContainer[],
  nodeMap: Map<string, LayoutNode>
): number {
  const dy = pushDyToClearBoxes(child.boxes, occupied, direction, nodeSpacing)
  commitChild(child, dy, merged, occupied, debugContainers, nodeMap)
  return dy
}

function placeOutward(
  children: PreparedChild[],
  direction: 'up' | 'down',
  nodeSpacing: number,
  merged: Map<string, { x: number; y: number }>,
  occupied: LayoutRect[],
  debugContainers: LayoutDebugContainer[],
  nodeMap: Map<string, LayoutNode>
): void {
  const order = direction === 'up' ? [...children].reverse() : children
  for (const child of order) {
    placeChild(child, occupied, direction, nodeSpacing, merged, debugContainers, nodeMap)
  }
}

/**
 * Right-to-left tidy tree (Reingold–Tilford): hub on the trunk side, branches grow outward.
 * High subtrees expand up, low subtrees down. Siblings pack by subtree contour.
 */
function layoutTree(
  hubId: string,
  nodeMap: Map<string, LayoutNode>,
  nodeIds: Set<string>,
  edges: ElkLayeredEdgeInput[],
  claimed: Set<string>,
  primaryConsumer: Map<string, string>,
  nodeSpacing: number,
  layerSpacing: number,
  depth: number,
  side: TreeSide
): BranchLayout {
  const hub = nodeMap.get(hubId)
  if (!hub) return emptyBranch(hubId)

  claimed.add(hubId)
  const inputs = directInputIds(hubId, nodeIds, edges).filter((id) => {
    if (!nodeMap.has(id) || claimed.has(id)) return false
    const owner = primaryConsumer.get(id)
    return !owner || owner === hubId
  })

  if (inputs.length === 0) {
    return {
      positions: new Map([[hubId, { x: 0, y: 0 }]]),
      minX: 0,
      minY: 0,
      maxX: hub.width,
      maxY: hub.height,
      debugContainers: [],
      splitNodeId: hubId,
      splitY: hub.height / 2,
    }
  }

  const children = inputs.flatMap((inputId, index) => {
    const node = nodeMap.get(inputId)
    if (!node) return []
    return [
      {
        id: inputId,
        node,
        layout: pinConnectingNode(
          layoutTree(
            inputId,
            nodeMap,
            nodeIds,
            edges,
            claimed,
            primaryConsumer,
            nodeSpacing,
            layerSpacing,
            depth + 1,
            subtreeSide(index, inputs.length, side)
          ),
          inputId
        ),
      },
    ]
  })

  const columnWidth = Math.max(...children.map((child) => child.node.width), 1)
  const hubX = columnWidth + layerSpacing
  const prepared = children.map((child) => prepareChild(child, columnWidth, nodeMap))
  const merged = new Map<string, { x: number; y: number }>()
  const debugContainers: LayoutDebugContainer[] = []
  const occupied: LayoutRect[] = []

  if (side === 'high') {
    placeOutward(prepared, 'up', nodeSpacing, merged, occupied, debugContainers, nodeMap)
  } else if (side === 'low') {
    placeOutward(prepared, 'down', nodeSpacing, merged, occupied, debugContainers, nodeMap)
  } else {
    const mid = (prepared.length - 1) / 2
    const high = prepared.filter((_, index) => index < mid)
    const low = prepared.filter((_, index) => index > mid)
    const center = Number.isInteger(mid) ? prepared[mid] : undefined
    if (center) {
      placeChild(center, occupied, 'down', nodeSpacing, merged, debugContainers, nodeMap)
    }
    placeOutward(high, 'up', nodeSpacing, merged, occupied, debugContainers, nodeMap)
    placeOutward(low, 'down', nodeSpacing, merged, occupied, debugContainers, nodeMap)
  }

  let connectTop = Infinity
  let connectBottom = -Infinity
  let firstConnect: { y: number; height: number } | null = null
  let lastConnect: { y: number; height: number } | null = null
  for (const child of prepared) {
    const pos = merged.get(child.id)
    if (!pos) continue
    if (!firstConnect) firstConnect = { y: pos.y, height: child.node.height }
    lastConnect = { y: pos.y, height: child.node.height }
    connectTop = Math.min(connectTop, pos.y)
    connectBottom = Math.max(connectBottom, pos.y + child.node.height)
  }

  const hubY = (() => {
    if (side === 'high' && lastConnect) {
      return lastConnect.y + lastConnect.height / 2 - hub.height / 2
    }
    if (side === 'low' && firstConnect) {
      return firstConnect.y + firstConnect.height / 2 - hub.height / 2
    }
    if (Number.isFinite(connectTop)) {
      return (connectTop + connectBottom) / 2 - hub.height / 2
    }
    return 0
  })()
  merged.set(hubId, { x: hubX, y: hubY })

  const bounds = measurePositions(merged, nodeMap) ?? {
    minX: hubX,
    minY: hubY,
    maxX: hubX + hub.width,
    maxY: hubY + hub.height,
  }
  const splitY = hubY + hub.height / 2

  debugContainers.push({
    id: `${hubId}::tidy-column`,
    x: 0,
    y: Number.isFinite(connectTop) ? connectTop : hubY,
    width: columnWidth,
    height: Number.isFinite(connectTop) ? connectBottom - connectTop : hub.height,
    role: 'input',
    innerHubId: hubId,
    depth,
  })
  debugContainers.push({
    id: `${hubId}::tidy-split`,
    x: 0,
    y: splitY - 1,
    width: columnWidth + layerSpacing + hub.width,
    height: 2,
    role: 'hub',
    innerHubId: hubId,
    depth,
  })

  return {
    positions: merged,
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
    debugContainers,
    splitNodeId: hubId,
    splitY,
  }
}

function stackBranches(branches: BranchLayout[], nodeSpacing: number): BranchLayout {
  if (branches.length === 0) return emptyBranch('')
  if (branches.length === 1) return branches[0]!

  const mid = Math.floor((branches.length - 1) / 2)
  const merged = new Map<string, { x: number; y: number }>()
  const debugContainers: LayoutDebugContainer[] = []
  let occMinY = Infinity
  let occMaxY = -Infinity
  let occMinX = Infinity
  let occMaxX = -Infinity

  for (const index of middleOutIndices(branches.length)) {
    const branch = branches[index]!
    let dy: number
    if (!Number.isFinite(occMinY)) {
      dy = -branch.minY
    } else if (index < mid) {
      dy = occMinY - nodeSpacing - branch.maxY
    } else {
      dy = occMaxY + nodeSpacing - branch.minY
    }
    const placed = translateBranch(branch, -branch.minX, dy)
    for (const [id, pos] of placed.positions) merged.set(id, pos)
    debugContainers.push(...placed.debugContainers)
    occMinY = Math.min(occMinY, placed.minY)
    occMaxY = Math.max(occMaxY, placed.maxY)
    occMinX = Math.min(occMinX, placed.minX)
    occMaxX = Math.max(occMaxX, placed.maxX)
  }

  return {
    positions: merged,
    minX: occMinX,
    minY: occMinY,
    maxX: occMaxX,
    maxY: occMaxY,
    debugContainers,
    splitNodeId: branches[mid]?.splitNodeId ?? '',
    splitY: branches[mid]?.splitY ?? 0,
  }
}

export async function runTidyTreeLayout(
  input: DirectChildrenLayoutInput
): Promise<DirectChildrenLayoutOutput> {
  if (input.nodes.length === 0) {
    return { positions: new Map() }
  }

  const nodeSpacing = input.nodeNodeSpacing ?? DEFAULT_NODE_SPACING
  const layerSpacing = input.layerSpacing ?? DEFAULT_LAYER_SPACING
  const nodeMap = nodeByIdMap(input.nodes)
  const nodeIds = new Set(input.nodes.map((node) => node.id))
  const context = input.layoutContext
  const claimed = new Set<string>()
  const primaryConsumer = primaryConsumerMap(nodeIds, input.edges)
  const sinks = findSinkIds(nodeIds, input.edges)

  const branches: BranchLayout[] = []
  for (const sinkId of sinks) {
    if (claimed.has(sinkId) || !nodeMap.has(sinkId)) continue
    branches.push(
      layoutTree(
        sinkId,
        nodeMap,
        nodeIds,
        input.edges,
        claimed,
        primaryConsumer,
        nodeSpacing,
        layerSpacing,
        0,
        'center'
      )
    )
  }

  for (const id of nodeIds) {
    if (claimed.has(id) || !nodeMap.has(id)) continue
    branches.push(
      layoutTree(
        id,
        nodeMap,
        nodeIds,
        input.edges,
        claimed,
        primaryConsumer,
        nodeSpacing,
        layerSpacing,
        0,
        'center'
      )
    )
  }

  const packed = stackBranches(branches, nodeSpacing)
  const bounds = measurePositions(packed.positions, nodeMap)
  if (!bounds || packed.positions.size === 0) {
    throwDirectChildrenLayoutError(context, 'tidy-tree layout failed', 'no positions produced')
  }

  const positions = new Map<string, { x: number; y: number }>()
  for (const [id, pos] of packed.positions) {
    positions.set(id, {
      x: pos.x - bounds.minX + LAYOUT_PADDING,
      y: pos.y - bounds.minY + LAYOUT_PADDING,
    })
  }

  return {
    positions,
    debugContainers: packed.debugContainers.map((box) => ({
      ...box,
      x: box.x - bounds.minX + LAYOUT_PADDING,
      y: box.y - bounds.minY + LAYOUT_PADDING,
    })),
  }
}
