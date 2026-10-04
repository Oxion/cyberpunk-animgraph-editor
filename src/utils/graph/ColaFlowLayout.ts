import { Layout, type Link, type Node as ColaNode } from 'webcola'
import {
  buildCompoundElkGraph,
  compareDirectInputPinOrder,
  type CompoundLayoutGraph,
} from './ElkGraphLayout'
import type {
  DirectChildrenLayoutContext,
  DirectChildrenLayoutInput,
  DirectChildrenLayoutOutput,
  LayoutDebugContainer,
} from './DirectChildrenLayout'
import { throwDirectChildrenLayoutError } from './DirectChildrenLayout'

const DEFAULT_NODE_SPACING = 28
const DEFAULT_LAYER_SPACING = 56
const COMPOUND_PADDING = 12
const COLA_UNCONSTRAINED_ITERATIONS = 40
const COLA_CONSTRAINT_ITERATIONS = 60
const COLA_OVERLAP_ITERATIONS = 120
const COLA_MAX_LAYOUT_SPAN = 2_000_000
/** Temporary: cola only, skip hub column packing pass. */
const ENABLE_HUB_PACK_PASS = false

type LayoutNode = DirectChildrenLayoutInput['nodes'][number]

interface ColaFlowLink extends Link<number> {
  fromId: string
  toId: string
}

type ColaLayoutEdge = {
  from: string
  to: string
  pinName?: string
}

interface LayoutSlot {
  id: string
  width: number
  height: number
  innerSlots?: LayoutSlot[]
  innerSlotPositions?: Map<string, { x: number; y: number }>
  /** Inner hub that wires out of this nested input container. */
  innerHubId?: string
}

interface CompoundGraphLayout {
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
  debugContainers: LayoutDebugContainer[]
  slots: LayoutSlot[]
  slotPositions: Map<string, { x: number; y: number }>
  hubSlotId?: string
}

function measureSlotsBounds(
  slots: LayoutSlot[],
  slotPositions: Map<string, { x: number; y: number }>
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const slot of slots) {
    const pos = slotPositions.get(slot.id)
    if (!pos) continue
    minX = Math.min(minX, pos.x)
    minY = Math.min(minY, pos.y)
    maxX = Math.max(maxX, pos.x + slot.width)
    maxY = Math.max(maxY, pos.y + slot.height)
  }

  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}

function normalizeCompoundPositions(
  positions: Map<string, { x: number; y: number }>,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  padding: number
): Map<string, { x: number; y: number }> {
  const normalized = new Map<string, { x: number; y: number }>()
  for (const [id, pos] of positions) {
    normalized.set(id, {
      x: pos.x - bounds.minX + padding,
      y: pos.y - bounds.minY + padding,
    })
  }
  return normalized
}

function offsetDebugContainers(
  boxes: LayoutDebugContainer[],
  dx: number,
  dy: number
): LayoutDebugContainer[] {
  if (dx === 0 && dy === 0) return boxes
  return boxes.map((box) => ({ ...box, x: box.x + dx, y: box.y + dy }))
}

function normalizeDebugContainers(
  boxes: LayoutDebugContainer[],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  padding: number
): LayoutDebugContainer[] {
  return offsetDebugContainers(boxes, -bounds.minX + padding, -bounds.minY + padding)
}

function collectSlotDebugContainers(
  slots: LayoutSlot[],
  slotPositions: Map<string, { x: number; y: number }>,
  hubSlotId: string | undefined,
  depth: number
): LayoutDebugContainer[] {
  const boxes: LayoutDebugContainer[] = []
  for (const slot of slots) {
    const pos = slotPositions.get(slot.id)
    if (!pos) continue
    const isHub = slot.id === hubSlotId
    if (slot.innerSlots?.length || !isHub) {
      boxes.push({
        id: slot.id,
        x: pos.x,
        y: pos.y,
        width: slot.width,
        height: slot.height,
        role: isHub ? 'hub' : 'input',
        innerHubId: slot.innerHubId ?? (slot.innerSlots?.length ? undefined : slot.id),
        depth,
      })
    }
    if (slot.innerSlots?.length && slot.innerSlotPositions) {
      boxes.push(
        ...offsetDebugContainers(
          collectSlotDebugContainers(
            slot.innerSlots,
            slot.innerSlotPositions,
            slot.innerHubId,
            depth + 1
          ),
          pos.x,
          pos.y
        )
      )
    }
  }
  return boxes
}

function nodeByIdMap(nodes: LayoutNode[]): Map<string, LayoutNode> {
  return new Map(nodes.map((node) => [node.id, node]))
}

function typicalLinkIdeal(
  nodes: LayoutNode[],
  nodeSpacing: number,
  layerSpacing: number
): number {
  const avg =
    nodes.reduce((sum, node) => sum + Math.max(node.width, node.height), 0) /
    Math.max(nodes.length, 1)
  return Math.max(layerSpacing + nodeSpacing, Math.round(avg * 0.55 + nodeSpacing))
}

function flowGapBetween(
  from: LayoutNode,
  to: LayoutNode,
  nodeSpacing: number,
  layerSpacing: number
): number {
  return Math.max(
    layerSpacing + nodeSpacing,
    (from.width + to.width) / 2 + nodeSpacing
  )
}

function initialCentroids(
  nodes: LayoutNode[],
  nodeSpacing: number,
  layerSpacing: number
): Array<{ x: number; y: number }> {
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  const positions: Array<{ x: number; y: number }> = []
  let xCursor = 0
  let yCursor = 0
  let rowHeight = 0

  for (let i = 0; i < nodes.length; i++) {
    if (i > 0 && i % cols === 0) {
      yCursor += rowHeight + nodeSpacing
      xCursor = 0
      rowHeight = 0
    }

    const node = nodes[i]
    positions.push({
      x: xCursor + node.width / 2,
      y: yCursor + node.height / 2,
    })
    xCursor += node.width + layerSpacing
    rowHeight = Math.max(rowHeight, node.height)
  }

  return positions
}

function findHubTargetId(edges: ColaLayoutEdge[]): string | undefined {
  if (edges.length === 0) return undefined
  const hubId = edges[0].to
  return edges.every((edge) => edge.to === hubId) ? hubId : undefined
}

/** Star edges, else last leaf (same fallback cola uses for a target container). */
function resolveHubSlotId(
  slots: LayoutSlot[],
  edges: ColaLayoutEdge[],
  leafIds: Set<string>
): string | undefined {
  const fromEdges = findHubTargetId(edges)
  if (fromEdges && slots.some((slot) => slot.id === fromEdges)) return fromEdges
  const last = slots[slots.length - 1]
  if (last && slots.length > 1 && leafIds.has(last.id)) return last.id
  return undefined
}

function pinNameForInput(
  inputId: string,
  targetId: string,
  edges: ColaLayoutEdge[]
): string | undefined {
  let best: string | undefined
  for (const edge of edges) {
    if (edge.from !== inputId || edge.to !== targetId) continue
    if (best === undefined || compareDirectInputPinOrder(edge.pinName, best) < 0) {
      best = edge.pinName
    }
  }
  return best
}

/** Input node indices top→bottom: earlier pins first, same array pin name stays together. */
function hubInputOrder(
  nodes: LayoutNode[],
  edges: ColaLayoutEdge[],
  targetIndex: number
): number[] {
  const targetId = nodes[targetIndex]?.id
  const indices: number[] = []
  for (let i = 0; i < nodes.length; i++) {
    if (i !== targetIndex) indices.push(i)
  }
  if (!targetId) return indices

  indices.sort((a, b) => {
    const pinCmp = compareDirectInputPinOrder(
      pinNameForInput(nodes[a].id, targetId, edges),
      pinNameForInput(nodes[b].id, targetId, edges)
    )
    if (pinCmp !== 0) return pinCmp
    return a - b
  })
  return indices
}

function inputOrderYConstraints(
  nodes: LayoutNode[],
  inputOrder: number[],
  nodeSpacing: number
): Array<{ type: string; axis: string; left: number; right: number; gap: number }> {
  const constraints: Array<{
    type: string
    axis: string
    left: number
    right: number
    gap: number
  }> = []
  for (let i = 0; i < inputOrder.length - 1; i++) {
    const above = inputOrder[i]
    const below = inputOrder[i + 1]
    constraints.push({
      type: 'separation',
      axis: 'y',
      left: above,
      right: below,
      gap: (nodes[above].height + nodes[below].height) / 2 + nodeSpacing,
    })
  }
  return constraints
}

/** Ideal center distance for stress: pull inputs toward target (minimize edge length). */
function hubInputLinkIdeal(
  from: LayoutNode,
  to: LayoutNode,
  nodeSpacing: number
): number {
  const touchX = (from.width + to.width) / 2 + nodeSpacing
  return Math.max(nodeSpacing * 2, touchX)
}

/**
 * Column seed for input-hub layouts: inputs stacked on the left, target on the right.
 * Cola still optimizes positions afterward (stress + flow), this is only the start.
 */
function initialInputColumnCentroids(
  nodes: LayoutNode[],
  targetIndex: number,
  inputOrder: number[],
  nodeSpacing: number,
  layerSpacing: number
): Array<{ x: number; y: number }> {
  const target = nodes[targetIndex]
  const centers: Array<{ x: number; y: number }> = new Array(nodes.length)

  let inputY = 0
  let maxInputWidth = 0
  for (const i of inputOrder) {
    const node = nodes[i]
    centers[i] = {
      x: node.width / 2,
      y: inputY + node.height / 2,
    }
    inputY += node.height + nodeSpacing
    maxInputWidth = Math.max(maxInputWidth, node.width)
  }

  const inputsHeight = Math.max(0, inputY - nodeSpacing)
  centers[targetIndex] = {
    x: maxInputWidth + layerSpacing + target.width / 2,
    y: Math.max(target.height / 2, inputsHeight / 2),
  }

  return centers
}

interface ColaBoxLayoutOptions {
  /** Star inputs → one target: column seed + short link ideals to minimize input edge length. */
  hubInputLayout?: boolean
}


function readPositions(
  nodes: LayoutNode[],
  colaNodes: ColaNode[],
  idToIndex: Map<string, number>,
  boxPad: number,
  context?: DirectChildrenLayoutContext
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const halfPad = boxPad / 2

  for (const node of nodes) {
    const index = idToIndex.get(node.id)
    if (index === undefined) continue

    const { x, y } = colaNodes[index]
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throwDirectChildrenLayoutError(context, 'cola flow layout failed', 'non-finite node coordinates')
    }

    const topLeft = {
      x: x - node.width / 2 + halfPad,
      y: y - node.height / 2 + halfPad,
    }
    positions.set(node.id, topLeft)

    minX = Math.min(minX, topLeft.x)
    minY = Math.min(minY, topLeft.y)
    maxX = Math.max(maxX, topLeft.x + node.width)
    maxY = Math.max(maxY, topLeft.y + node.height)
  }

  if (positions.size === 0) {
    throwDirectChildrenLayoutError(context, 'cola flow layout failed', 'no node positions produced')
  }

  const spanX = maxX - minX
  const spanY = maxY - minY
  if (!Number.isFinite(spanX) || !Number.isFinite(spanY)) {
    throwDirectChildrenLayoutError(context, 'cola flow layout failed', 'invalid layout bounds')
  }
  if (spanX > COLA_MAX_LAYOUT_SPAN || spanY > COLA_MAX_LAYOUT_SPAN) {
    throwDirectChildrenLayoutError(
      context,
      'cola flow layout failed',
      `layout span ${Math.round(spanX)}×${Math.round(spanY)} exceeds ${COLA_MAX_LAYOUT_SPAN}`
    )
  }

  return positions
}

function edgeEndpoint(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) return value
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) {
    return value[0]
  }
  return undefined
}

function compoundGraphEdges(
  graph: CompoundLayoutGraph
): ColaLayoutEdge[] {
  const edges: ColaLayoutEdge[] = []
  for (const edge of graph.edges ?? []) {
    const record = edge as {
      sources?: unknown
      targets?: unknown
      from?: unknown
      to?: unknown
      pinName?: string
    }
    const from = edgeEndpoint(record.sources) ?? edgeEndpoint(record.from)
    const to = edgeEndpoint(record.targets) ?? edgeEndpoint(record.to)
    if (from && to) edges.push({ from, to, pinName: record.pinName })
  }
  return edges
}

function runColaOnBoxNodes(
  nodes: LayoutNode[],
  edges: ColaLayoutEdge[],
  nodeSpacing: number,
  layerSpacing: number,
  context?: DirectChildrenLayoutContext,
  detail?: string,
  options?: ColaBoxLayoutOptions
): Map<string, { x: number; y: number }> {
  if (nodes.length === 0) {
    return new Map()
  }

  const boxPad = nodeSpacing
  const nodeMap = nodeByIdMap(nodes)

  const idToIndex = new Map<string, number>()
  nodes.forEach((node, index) => idToIndex.set(node.id, index))

  const hubTargetId = findHubTargetId(edges)
  let targetIndex = hubTargetId !== undefined ? idToIndex.get(hubTargetId) : undefined
  if (targetIndex === undefined && options?.hubInputLayout && nodes.length > 1) {
    targetIndex = nodes.length - 1
  }

  const hubInputLayout =
    targetIndex !== undefined && (options?.hubInputLayout === true || hubTargetId !== undefined)

  const inputOrder =
    hubInputLayout && targetIndex !== undefined
      ? hubInputOrder(nodes, edges, targetIndex)
      : []

  const centroids =
    hubInputLayout && targetIndex !== undefined
      ? initialInputColumnCentroids(nodes, targetIndex, inputOrder, nodeSpacing, layerSpacing)
      : initialCentroids(nodes, nodeSpacing, layerSpacing)

  const colaNodes: ColaNode[] = nodes.map((node, index) => {
    const c = centroids[index]
    return {
      index,
      x: c.x,
      y: c.y,
      width: Math.max(node.width, 1) + boxPad,
      height: Math.max(node.height, 1) + boxPad,
    }
  })

  const colaLinks: ColaFlowLink[] = []
  for (const edge of edges) {
    const source = idToIndex.get(edge.from)
    const target = idToIndex.get(edge.to)
    if (source === undefined || target === undefined || source === target) continue
    colaLinks.push({ source, target, fromId: edge.from, toId: edge.to })
  }

  try {
    const layout = new Layout()
      .nodes(colaNodes)
      .links(colaLinks)
      .avoidOverlaps(true)
      .handleDisconnected(!hubInputLayout)
      .flowLayout('x', (link: ColaFlowLink) => {
        const from = nodeMap.get(link.fromId)
        const to = nodeMap.get(link.toId)
        if (!from || !to) return layerSpacing + nodeSpacing
        return flowGapBetween(from, to, nodeSpacing, layerSpacing)
      })

    if (hubInputLayout && inputOrder.length > 1) {
      layout.constraints(inputOrderYConstraints(nodes, inputOrder, nodeSpacing))
    }

    if (hubInputLayout) {
      layout
        .linkDistance((link: ColaFlowLink) => {
          const from = nodeMap.get(link.fromId)
          const to = nodeMap.get(link.toId)
          if (!from || !to) return layerSpacing + nodeSpacing
          return hubInputLinkIdeal(from, to, nodeSpacing)
        })
        .symmetricDiffLinkLengths(nodeSpacing + layerSpacing, 0.95)
    } else {
      const linkIdeal = typicalLinkIdeal(nodes, nodeSpacing, layerSpacing)
      layout.jaccardLinkLengths(linkIdeal, 0.65)
    }

    layout.start(
      COLA_UNCONSTRAINED_ITERATIONS,
      COLA_CONSTRAINT_ITERATIONS,
      COLA_OVERLAP_ITERATIONS,
      0,
      false,
      false
    )

    return readPositions(nodes, colaNodes, idToIndex, boxPad, context)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('[layout error]')) {
      throw err
    }
    throwDirectChildrenLayoutError(
      context,
      'cola flow layout failed',
      detail ?? (err instanceof Error ? err.message : String(err))
    )
  }
}

function resolveCompoundChild(
  child: CompoundLayoutGraph,
  nodeMap: Map<string, LayoutNode>,
  leafIds: Set<string>,
  nodeSpacing: number,
  layerSpacing: number,
  padding: number,
  context: DirectChildrenLayoutContext | undefined,
  depth: number
): LayoutSlot {
  if (child.children && child.children.length > 0) {
    const inner = layoutCompoundGraph(
      child,
      nodeMap,
      leafIds,
      nodeSpacing,
      layerSpacing,
      padding,
      context,
      depth + 1
    )
    if (inner.positions.size === 0) {
      throwDirectChildrenLayoutError(
        context,
        'cola compound layout failed',
        `empty inner layout for container ${child.id}`
      )
    }

    return {
      id: child.id,
      width: inner.width,
      height: inner.height,
      innerSlots: inner.slots,
      innerSlotPositions: inner.slotPositions,
      innerHubId: inner.hubSlotId,
    }
  }

  const node = nodeMap.get(child.id)
  if (!node) {
    throwDirectChildrenLayoutError(
      context,
      'cola compound layout failed',
      `unknown leaf child ${child.id}`
    )
  }

  return {
    id: child.id,
    width: Math.max(child.width ?? node.width, 1),
    height: Math.max(child.height ?? node.height, 1),
  }
}

function yShiftLimitsForInnerSlot(
  moving: LayoutSlot,
  movingPos: { x: number; y: number },
  siblings: LayoutSlot[],
  positions: Map<string, { x: number; y: number }>,
  slotHeight: number,
  gap: number
): { minShift: number; maxShift: number } {
  let minShift = -movingPos.y
  let maxShift = slotHeight - (movingPos.y + moving.height)

  for (const other of siblings) {
    if (other.id === moving.id) continue
    const pos = positions.get(other.id)
    if (!pos) continue
    const xOverlap =
      movingPos.x < pos.x + other.width && pos.x < movingPos.x + moving.width
    if (!xOverlap) continue
    const movingBottom = movingPos.y + moving.height
    const otherBottom = pos.y + other.height
    if (pos.y >= movingPos.y) {
      maxShift = Math.min(maxShift, pos.y - gap - movingBottom)
    }
    if (otherBottom <= movingBottom) {
      minShift = Math.max(minShift, otherBottom + gap - movingPos.y)
    }
  }

  return { minShift, maxShift }
}

function nestedSlotHub(slot: LayoutSlot): LayoutSlot | undefined {
  if (!slot.innerSlots?.length) return undefined
  if (slot.innerHubId) {
    const found = slot.innerSlots.find((inner) => inner.id === slot.innerHubId)
    if (found) return found
  }
  return slot.innerSlots[slot.innerSlots.length - 1]
}

function measureInputColumnBounds(
  inputSlots: LayoutSlot[],
  slotPositions: Map<string, { x: number; y: number }>
): { minY: number; maxY: number; centerY: number } | null {
  let minY = Infinity
  let maxY = -Infinity
  for (const slot of inputSlots) {
    const pos = slotPositions.get(slot.id)
    if (!pos) continue
    minY = Math.min(minY, pos.y)
    maxY = Math.max(maxY, pos.y + slot.height)
  }
  if (!Number.isFinite(minY)) return null
  return { minY, maxY, centerY: (minY + maxY) / 2 }
}

function inputSlotsTopToBottom(
  inputSlots: LayoutSlot[],
  slotPositions: Map<string, { x: number; y: number }>
): LayoutSlot[] {
  return [...inputSlots].sort((a, b) => {
    const ay = slotPositions.get(a.id)?.y ?? 0
    const by = slotPositions.get(b.id)?.y ?? 0
    if (ay !== by) return ay - by
    return a.id.localeCompare(b.id)
  })
}

function innerHubShiftLimits(
  slot: LayoutSlot,
  nodeSpacing: number
): {
  hub: LayoutSlot
  hubPos: { x: number; y: number }
  positions: Map<string, { x: number; y: number }>
  minShift: number
  maxShift: number
} | null {
  const hub = nestedSlotHub(slot)
  const positions = slot.innerSlotPositions
  if (!hub || !positions) return null
  const hubPos = positions.get(hub.id)
  if (!hubPos) return null
  const { minShift, maxShift } = yShiftLimitsForInnerSlot(
    hub,
    hubPos,
    slot.innerSlots ?? [],
    positions,
    slot.height,
    nodeSpacing
  )
  if (maxShift < minShift) return null
  return { hub, hubPos, positions, minShift, maxShift }
}

/** Nested slot whose inner hub was already packed one level down — do not move it again. */
function innerHubAlreadyPacked(slot: LayoutSlot): boolean {
  return slot.innerSlots != null && slot.innerSlots.length > 0
}

/** Pack connecting node to the slot's bottom (true) or top (false) border. */
function slideInnerHubToBorder(
  slot: LayoutSlot,
  nodeSpacing: number,
  toBottom: boolean
) {
  if (innerHubAlreadyPacked(slot)) return
  const limits = innerHubShiftLimits(slot, nodeSpacing)
  if (!limits) return
  const shiftY = toBottom ? limits.maxShift : limits.minShift
  if (shiftY === 0) return
  limits.positions.set(limits.hub.id, {
    x: limits.hubPos.x,
    y: limits.hubPos.y + shiftY,
  })
}

/**
 * Slide each nested input's connecting hub toward targetY, staying inside the slot.
 */
function slideInnerHubsTowardY(
  inputSlots: LayoutSlot[],
  slotPositions: Map<string, { x: number; y: number }>,
  targetY: number,
  nodeSpacing: number
) {
  for (const slot of inputSlots) {
    if (innerHubAlreadyPacked(slot)) continue
    const pos = slotPositions.get(slot.id)
    if (!pos) continue
    const limits = innerHubShiftLimits(slot, nodeSpacing)
    if (!limits) continue
    const currentCenterY = pos.y + limits.hubPos.y + limits.hub.height / 2
    const shiftY = Math.min(
      limits.maxShift,
      Math.max(limits.minShift, targetY - currentCenterY)
    )
    if (shiftY === 0) continue
    limits.positions.set(limits.hub.id, {
      x: limits.hubPos.x,
      y: limits.hubPos.y + shiftY,
    })
  }
}

function shiftHubToCenterY(
  hubSlot: LayoutSlot,
  slotPositions: Map<string, { x: number; y: number }>,
  allSlots: LayoutSlot[],
  targetCenterY: number
) {
  const hubPos = slotPositions.get(hubSlot.id)
  if (!hubPos) return
  const bounds = measureSlotsBounds(allSlots, slotPositions)
  let nextY = targetCenterY - hubSlot.height / 2
  if (bounds) {
    nextY = Math.min(bounds.maxY - hubSlot.height, Math.max(bounds.minY, nextY))
  }
  const shiftY = nextY - hubPos.y
  if (shiftY === 0) return
  slotPositions.set(hubSlot.id, { x: hubPos.x, y: hubPos.y + shiftY })
}

/**
 * Steps 1–3: only leaf input slots (nested hubs already packed below).
 * Step 4: move this level's hub to the middle-column center.
 */
function packHubInputColumn(
  slots: LayoutSlot[],
  slotPositions: Map<string, { x: number; y: number }>,
  hubSlotId: string,
  nodeSpacing: number
) {
  const hubSlot = slots.find((slot) => slot.id === hubSlotId)
  const hubPos = slotPositions.get(hubSlotId)
  if (!hubSlot || !hubPos) return

  const inputSlots = slots.filter((slot) => slot.id !== hubSlotId)
  if (inputSlots.length === 0) return

  const ordered = inputSlotsTopToBottom(inputSlots, slotPositions)

  if (ordered.length === 1) {
    const only = ordered[0]!
    const pos = slotPositions.get(only.id)
    if (!pos) return
    const centerY = pos.y + only.height / 2
    slideInnerHubsTowardY(ordered, slotPositions, centerY, nodeSpacing)
    shiftHubToCenterY(hubSlot, slotPositions, slots, centerY)
    return
  }

  const top = ordered[0]!
  const bottom = ordered[ordered.length - 1]!
  const middle = ordered.slice(1, -1)

  slideInnerHubToBorder(top, nodeSpacing, true)
  slideInnerHubToBorder(bottom, nodeSpacing, false)

  const middleBounds = measureInputColumnBounds(middle, slotPositions)
  if (middle.length > 0 && middleBounds) {
    slideInnerHubsTowardY(middle, slotPositions, middleBounds.centerY, nodeSpacing)
  }

  let middleCenterY: number | undefined
  if (middleBounds) {
    middleCenterY = middleBounds.centerY
  } else {
    const topPos = slotPositions.get(top.id)
    const bottomPos = slotPositions.get(bottom.id)
    if (topPos && bottomPos) {
      middleCenterY = (topPos.y + top.height + bottomPos.y) / 2
    }
  }
  if (middleCenterY === undefined) return
  shiftHubToCenterY(hubSlot, slotPositions, slots, middleCenterY)
}

/** After cola: pack innermost hubs first, then parents. Step 4 moves each hub. */
function packSlotTree(
  slots: LayoutSlot[],
  slotPositions: Map<string, { x: number; y: number }>,
  hubSlotId: string | undefined,
  nodeSpacing: number
) {
  for (const slot of slots) {
    if (hubSlotId && slot.id === hubSlotId) continue
    if (!slot.innerSlots?.length || !slot.innerSlotPositions) continue
    packSlotTree(slot.innerSlots, slot.innerSlotPositions, slot.innerHubId, nodeSpacing)
  }
  if (hubSlotId) {
    packHubInputColumn(slots, slotPositions, hubSlotId, nodeSpacing)
  }
}

function mergeSlotTree(
  slots: LayoutSlot[],
  slotPositions: Map<string, { x: number; y: number }>,
  leafIds: Set<string>
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()

  for (const slot of slots) {
    const pos = slotPositions.get(slot.id)
    if (!pos) continue

    if (slot.innerSlots?.length && slot.innerSlotPositions) {
      const inner = mergeSlotTree(slot.innerSlots, slot.innerSlotPositions, leafIds)
      for (const [id, innerPos] of inner) {
        result.set(id, { x: pos.x + innerPos.x, y: pos.y + innerPos.y })
      }
      continue
    }

    if (leafIds.has(slot.id)) {
      result.set(slot.id, { x: pos.x, y: pos.y })
    }
  }

  return result
}

function measureLeafBounds(
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

function emptyCompoundLayout(padding: number): CompoundGraphLayout {
  return {
    positions: new Map(),
    width: padding * 2,
    height: padding * 2,
    debugContainers: [],
    slots: [],
    slotPositions: new Map(),
  }
}

/**
 * Recursively layout compound input containers with Cola only.
 * Packing is a separate top-down pass after the full tree is built.
 */
function layoutCompoundGraph(
  graph: CompoundLayoutGraph,
  nodeMap: Map<string, LayoutNode>,
  leafIds: Set<string>,
  nodeSpacing: number,
  layerSpacing: number,
  padding: number,
  context: DirectChildrenLayoutContext | undefined,
  depth: number
): CompoundGraphLayout {
  const children = graph.children
  if (!children || children.length === 0) {
    if (graph.id && leafIds.has(graph.id)) {
      return {
        positions: new Map([[graph.id, { x: padding, y: padding }]]),
        width: Math.max(nodeMap.get(graph.id)?.width ?? 1, 1) + padding * 2,
        height: Math.max(nodeMap.get(graph.id)?.height ?? 1, 1) + padding * 2,
        debugContainers: [],
        slots: [],
        slotPositions: new Map(),
      }
    }
    return emptyCompoundLayout(padding)
  }

  const slots: LayoutSlot[] = []
  for (const child of children) {
    slots.push(
      resolveCompoundChild(
        child,
        nodeMap,
        leafIds,
        nodeSpacing,
        layerSpacing,
        padding,
        context,
        depth
      )
    )
  }

  const colaNodes: LayoutNode[] = slots.map((slot) => ({
    id: slot.id,
    width: slot.width,
    height: slot.height,
  }))
  const levelEdges = compoundGraphEdges(graph)
  const rawPositions = runColaOnBoxNodes(
    colaNodes,
    levelEdges,
    nodeSpacing,
    layerSpacing,
    context,
    `compound level ${graph.id}`,
    { hubInputLayout: true }
  )

  const hubSlotId = resolveHubSlotId(slots, levelEdges, leafIds)
  const bounds = measureSlotsBounds(slots, rawPositions)
  if (!bounds) {
    throwDirectChildrenLayoutError(
      context,
      'cola compound layout failed',
      `could not measure bounds at ${graph.id}`
    )
  }

  const slotPositions = normalizeCompoundPositions(rawPositions, bounds, padding)
  const merged = mergeSlotTree(slots, slotPositions, leafIds)
  return {
    positions: merged,
    width: bounds.maxX - bounds.minX + padding * 2,
    height: bounds.maxY - bounds.minY + padding * 2,
    debugContainers: [],
    slots,
    slotPositions,
    hubSlotId,
  }
}

function finishPackedLayout(
  layout: CompoundGraphLayout,
  nodeMap: Map<string, LayoutNode>,
  leafIds: Set<string>,
  nodeSpacing: number,
  padding: number,
  context: DirectChildrenLayoutContext | undefined
): CompoundGraphLayout {
  if (ENABLE_HUB_PACK_PASS) {
    packSlotTree(layout.slots, layout.slotPositions, layout.hubSlotId, nodeSpacing)
  }
  const merged = mergeSlotTree(layout.slots, layout.slotPositions, leafIds)
  const debugContainers = collectSlotDebugContainers(
    layout.slots,
    layout.slotPositions,
    layout.hubSlotId ?? layout.slots[layout.slots.length - 1]?.id,
    0
  )
  const bounds = measureLeafBounds(merged, nodeMap) ?? measureSlotsBounds(layout.slots, layout.slotPositions)
  if (!bounds) {
    throwDirectChildrenLayoutError(context, 'cola compound layout failed', 'could not measure packed bounds')
  }
  return {
    positions: normalizeCompoundPositions(merged, bounds, padding),
    width: bounds.maxX - bounds.minX + padding * 2,
    height: bounds.maxY - bounds.minY + padding * 2,
    debugContainers: normalizeDebugContainers(debugContainers, bounds, padding),
    slots: layout.slots,
    slotPositions: layout.slotPositions,
    hubSlotId: layout.hubSlotId,
  }
}

function runColaFlatFlowLayout(
  input: DirectChildrenLayoutInput
): Map<string, { x: number; y: number }> {
  const nodeSpacing = input.nodeNodeSpacing ?? DEFAULT_NODE_SPACING
  const layerSpacing = input.layerSpacing ?? DEFAULT_LAYER_SPACING
  const edges = input.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    pinName: edge.pinName,
  }))
  return runColaOnBoxNodes(
    input.nodes,
    edges,
    nodeSpacing,
    layerSpacing,
    input.layoutContext,
    'flat cola flow'
  )
}

/**
 * Cola.js with compound input containers (virtual matryoshka, same tree as ELK compound).
 */
export async function runColaFlowLayout(
  input: DirectChildrenLayoutInput
): Promise<DirectChildrenLayoutOutput> {
  if (input.nodes.length === 0) {
    return { positions: new Map() }
  }

  const nodeSpacing = input.nodeNodeSpacing ?? DEFAULT_NODE_SPACING
  const layerSpacing = input.layerSpacing ?? DEFAULT_LAYER_SPACING
  const nodeMap = nodeByIdMap(input.nodes)
  const leafIds = new Set(input.nodes.map((node) => node.id))
  const context = input.layoutContext

  const compoundGraph = buildCompoundElkGraph(input.nodes, input.edges, {
    nodeNodeSpacing: nodeSpacing,
    layerSpacing,
    padding: COMPOUND_PADDING,
    direction: input.direction ?? 'RIGHT',
  })

  if (compoundGraph) {
    const compoundLayout = layoutCompoundGraph(
      compoundGraph,
      nodeMap,
      leafIds,
      nodeSpacing,
      layerSpacing,
      COMPOUND_PADDING,
      context,
      0
    )
    const packed = finishPackedLayout(
      compoundLayout,
      nodeMap,
      leafIds,
      nodeSpacing,
      COMPOUND_PADDING,
      context
    )
    if (packed.positions.size === 0) {
      throwDirectChildrenLayoutError(context, 'cola compound layout failed', 'no positions produced')
    }
    return {
      positions: packed.positions,
      debugContainers: packed.debugContainers,
    }
  }

  return { positions: runColaFlatFlowLayout(input) }
}
