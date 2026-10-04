import ELK from 'elkjs/lib/elk.bundled.js'
import type { DiagramConnection } from './diagramTypes'
import { getConnectionKey } from './diagramModel'
import { DIAGRAM_CONNECTION_TYPE_INPUT } from './diagramConnectionTypes'

const elk = new ELK()

export type ElkArrangeAlgorithm = 'layered' | 'force' | 'mrtree'
/** Arrange Selection tool: ELK algorithms plus opening-animgraph layouts. */
export type ArrangeSelectionAlgorithm = ElkArrangeAlgorithm | 'tidy-tree' | 'cola-flow'
export type ElkLayeredVariant = 'flat' | 'compound' | 'tree'

export interface ElkLayeredNodeInput {
  id: string
  width: number
  height: number
  layerConstraint?: 'LAST'
}

export interface ElkLayeredEdgeInput {
  id: string
  from: string
  to: string
  priority?: number
  pinName?: string
  /** Strong horizontal pull: keep source left of target (input pins). Layered only. */
  inputEdge?: boolean
}

export type ElkDirection = 'RIGHT' | 'DOWN' | 'LEFT' | 'UP'

export interface ElkLayeredLayoutInput {
  nodes: ElkLayeredNodeInput[]
  edges: ElkLayeredEdgeInput[]
  nodeNodeSpacing?: number
  layerSpacing?: number
  padding?: number
  direction?: ElkDirection
}

export interface ElkForceLayoutInput {
  nodes: ElkLayeredNodeInput[]
  edges: ElkLayeredEdgeInput[]
  nodeNodeSpacing?: number
  padding?: number
  iterations?: number
}

export interface ElkMrTreeLayoutInput {
  nodes: ElkLayeredNodeInput[]
  edges: ElkLayeredEdgeInput[]
  nodeNodeSpacing?: number
  padding?: number
}

function buildLayeredEdgeLayoutOptions(edge: ElkLayeredEdgeInput): Record<string, string> | undefined {
  const options: Record<string, string> = {}
  if (edge.priority !== undefined) {
    options['org.eclipse.elk.priority'] = String(edge.priority)
  }
  if (edge.inputEdge) {
    options['org.eclipse.elk.layered.priority.shortness'] = '5'
  }
  return Object.keys(options).length > 0 ? options : undefined
}

function buildForceEdgeLayoutOptions(edge: ElkLayeredEdgeInput): Record<string, string> | undefined {
  if (edge.priority === undefined) return undefined
  return { 'org.eclipse.elk.priority': String(edge.priority) }
}

function buildMrTreeEdgeLayoutOptions(edge: ElkLayeredEdgeInput): Record<string, string> | undefined {
  if (edge.priority === undefined) return undefined
  return { 'org.eclipse.elk.priority': String(edge.priority) }
}

function extractPositions(layouted: { children?: Array<{ id?: string; x?: number; y?: number }> }) {
  const positions = new Map<string, { x: number; y: number }>()
  layouted.children?.forEach((child) => {
    if (child.id != null && child.x != null && child.y != null) {
      positions.set(child.id, { x: child.x, y: child.y })
    }
  })
  return positions
}

type ElkLayoutChild = {
  id?: string
  x?: number
  y?: number
  width?: number
  height?: number
  children?: ElkLayoutChild[]
}

function getLayoutNodeSize(
  node: ElkLayoutChild,
  nodeSizes: Map<string, { width: number; height: number }>
): { width: number; height: number } {
  if (node.width != null && node.height != null) {
    return { width: node.width, height: node.height }
  }
  if (node.id) {
    const fromInput = nodeSizes.get(node.id)
    if (fromInput) return fromInput
  }
  if (node.children && node.children.length > 0) {
    let maxX = 0
    let maxY = 0
    for (const child of node.children) {
      const size = getLayoutNodeSize(child, nodeSizes)
      maxX = Math.max(maxX, (child.x ?? 0) + size.width)
      maxY = Math.max(maxY, (child.y ?? 0) + size.height)
    }
    return { width: Math.max(maxX, 1), height: Math.max(maxY, 1) }
  }
  return { width: 1, height: 1 }
}

function isTargetContainerId(id: string | undefined): boolean {
  return id != null && id.startsWith(ELK_TARGET_PREFIX)
}

type ContainerBounds = { top: number; bottom: number }

/** 1 = fully toward output; 0 = stay at input centroid. */
const COMPOUND_OUTPUT_ALIGN_WEIGHT = 0.65

/** Absolute Y bounds of each __elk_target__* from ELK layout (containers are not moved in pass 2). */
function extractTargetContainerBounds(
  layouted: { children?: ElkLayoutChild[] },
  nodeSizes: Map<string, { width: number; height: number }>
): Map<string, ContainerBounds> {
  const bounds = new Map<string, ContainerBounds>()

  const walk = (children: ElkLayoutChild[] | undefined, offsetX: number, offsetY: number) => {
    children?.forEach((child) => {
      const x = (child.x ?? 0) + offsetX
      const y = (child.y ?? 0) + offsetY
      if (child.id != null && isTargetContainerId(child.id)) {
        const size = getLayoutNodeSize(child, nodeSizes)
        bounds.set(child.id, { top: y, bottom: y + size.height })
      }
      if (child.children && child.children.length > 0) {
        walk(child.children, x, y)
      }
    })
  }

  walk(layouted.children, 0, 0)
  return bounds
}

/**
 * Pass 2: nudge each root sink hub's target node (last child) toward its feed, clamped inside its
 * __elk_target__* container. Nested input hubs are left at ELK pass-1 positions.
 */
function snapCompoundInputPositions(
  layouted: { children?: ElkLayoutChild[] },
  positions: Map<string, { x: number; y: number }>,
  leafIds: Set<string>,
  nodeSizes: Map<string, { width: number; height: number }>,
  edges: ElkLayeredEdgeInput[]
): void {
  const containerBounds = extractTargetContainerBounds(layouted, nodeSizes)

  const getRealTargetNode = (container: ElkLayoutChild): ElkLayoutChild | null => {
    const children = container.children
    if (!children || children.length === 0) return null
    return children[children.length - 1]
  }

  const getDirectInputBranches = (container: ElkLayoutChild): ElkLayoutChild[] => {
    const children = container.children
    if (!children || children.length < 2) return []
    return children.slice(0, -1)
  }

  const nodeCenterYFromId = (nodeId: string) => {
    const pos = positions.get(nodeId)
    if (!pos) return null
    return pos.y + (nodeSizes.get(nodeId)?.height ?? nodeHeight(nodeId, null)) / 2
  }

  /** Vertical centroid of direct input branch targets (hub last child or leaf). */
  const inputCenterYForContainer = (container: ElkLayoutChild): number | null => {
    const centers: number[] = []

    for (const branch of getDirectInputBranches(container)) {
      let nodeId: string | undefined
      if (isTargetContainerId(branch.id)) {
        nodeId = getRealTargetNode(branch)?.id
      } else {
        nodeId = branch.id
      }
      if (!nodeId || !leafIds.has(nodeId)) continue
      const centerY = nodeCenterYFromId(nodeId)
      if (centerY != null) centers.push(centerY)
    }

    if (centers.length === 0) return null
    return centers.reduce((sum, y) => sum + y, 0) / centers.length
  }

  const blendFeedCenterYWithInputs = (
    container: ElkLayoutChild,
    feedCenterY: number,
    outputAlignWeight: number
  ): number => {
    const inputCenterY = inputCenterYForContainer(container)
    if (inputCenterY == null) return feedCenterY
    return inputCenterY + outputAlignWeight * (feedCenterY - inputCenterY)
  }

  const nodeHeight = (nodeId: string, node: ElkLayoutChild | null) =>
    nodeSizes.get(nodeId)?.height ?? getLayoutNodeSize(node ?? { id: nodeId }, nodeSizes).height

  const clampNodeCenterY = (
    nodeId: string,
    node: ElkLayoutChild | null,
    referenceCenterY: number,
    bounds: ContainerBounds
  ) => {
    const pos = positions.get(nodeId)
    if (!pos) return

    const h = nodeHeight(nodeId, node)
    const idealY = referenceCenterY - h / 2
    const maxY = Math.max(bounds.top, bounds.bottom - h)
    const clampedY = Math.max(bounds.top, Math.min(maxY, idealY))

    positions.set(nodeId, { x: pos.x, y: clampedY })
  }

  const feedCenterYForNode = (nodeId: string): number | null => {
    const feedTargetIds = [
      ...new Set(
        edges
          .filter(
            (edge) =>
              edge.from === nodeId &&
              leafIds.has(edge.to) &&
              edge.to !== nodeId &&
              positions.has(edge.to)
          )
          .map((edge) => edge.to)
      ),
    ]

    if (feedTargetIds.length === 0) return null

    const feedCenterYs = feedTargetIds
      .map((id) => {
        const feedPos = positions.get(id)
        if (!feedPos) return null
        return feedPos.y + (nodeSizes.get(id)?.height ?? nodeHeight(id, null)) / 2
      })
      .filter((y): y is number => y != null)

    if (feedCenterYs.length === 0) return null

    return feedCenterYs.length === 1
      ? feedCenterYs[0]
      : feedCenterYs.reduce((sum, y) => sum + y, 0) / feedCenterYs.length
  }

  const snapHubTargetTowardFeed = (
    container: ElkLayoutChild,
    feedCenterY: number
  ) => {
    const containerId = container.id
    if (!containerId) return

    const bounds = containerBounds.get(containerId)
    const targetNode = getRealTargetNode(container)
    const targetId = targetNode?.id
    if (!bounds || !targetId || !leafIds.has(targetId) || !positions.has(targetId)) return

    clampNodeCenterY(targetId, targetNode, feedCenterY, bounds)
  }

  const snapHubTargetTowardGraphFeeds = (
    container: ElkLayoutChild,
    outputAlignWeight = COMPOUND_OUTPUT_ALIGN_WEIGHT
  ) => {
    const targetNode = getRealTargetNode(container)
    const targetId = targetNode?.id
    if (!targetId) return

    const feedCenterY = feedCenterYForNode(targetId)
    if (feedCenterY == null) return

    const referenceCenterY = blendFeedCenterYWithInputs(
      container,
      feedCenterY,
      outputAlignWeight
    )
    snapHubTargetTowardFeed(container, referenceCenterY)
  }

  // Root sink containers only — nested __elk_target__* keep ELK pass-1 positions.
  layouted.children?.forEach((rootChild) => {
    if (isTargetContainerId(rootChild.id)) {
      snapHubTargetTowardGraphFeeds(rootChild)
    }
  })
}

function extractCompoundPositions(
  layouted: { children?: ElkLayoutChild[] },
  leafIds: Set<string>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()

  const walk = (children: ElkLayoutChild[] | undefined, offsetX: number, offsetY: number) => {
    children?.forEach((child) => {
      const x = (child.x ?? 0) + offsetX
      const y = (child.y ?? 0) + offsetY
      if (child.id != null && leafIds.has(child.id)) {
        positions.set(child.id, { x, y })
      }
      if (child.children && child.children.length > 0) {
        walk(child.children, x, y)
      }
    })
  }

  walk(layouted.children, 0, 0)
  return positions
}

interface DirectAnchorEdge {
  from: string
  edgeId: string
  pinName?: string
}

export function compareDirectInputPinOrder(a?: string, b?: string): number {
  const parse = (pin?: string) => {
    if (!pin) return { group: 1, name: '', index: 0 }
    const match = pin.match(/^(.+)\[(\d+)\]$/)
    if (match) {
      const name = match[1]
      const group = name === 'weightNode' ? 2 : 0
      return { group, name, index: Number.parseInt(match[2], 10) }
    }
    if (pin === 'weightNode') return { group: 2, name: pin, index: 0 }
    return { group: 0, name: pin, index: 0 }
  }
  const pinA = parse(a)
  const pinB = parse(b)
  if (pinA.group !== pinB.group) return pinA.group - pinB.group
  if (pinA.name !== pinB.name) return pinA.name.localeCompare(pinB.name)
  return pinA.index - pinB.index
}

function getDirectAnchorEdges(
  anchorId: string,
  nodeIds: Set<string>,
  edges: ElkLayeredEdgeInput[]
): DirectAnchorEdge[] {
  const directEdges: DirectAnchorEdge[] = []

  for (const edge of edges) {
    if (edge.to !== anchorId || !nodeIds.has(edge.from)) continue
    directEdges.push({
      from: edge.from,
      edgeId: edge.id,
      pinName: edge.pinName,
    })
  }

  return directEdges.sort((a, b) => {
    const pinOrder = compareDirectInputPinOrder(a.pinName, b.pinName)
    if (pinOrder !== 0) return pinOrder
    return a.edgeId.localeCompare(b.edgeId)
  })
}

export type CompoundLayoutGraph = {
  id: string
  width?: number
  height?: number
  layoutOptions?: Record<string, string>
  children?: CompoundLayoutGraph[]
  edges?: ReturnType<typeof buildElkEdges>
}

type ElkLayoutGraph = CompoundLayoutGraph

const ELK_TARGET_PREFIX = '__elk_target__'

function sanitizeElkClusterIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_')
}

function hasDirectUpstream(
  nodeId: string,
  nodeIds: Set<string>,
  claimed: Set<string>,
  edges: ElkLayeredEdgeInput[]
): boolean {
  return edges.some(
    (edge) =>
      edge.to === nodeId &&
      nodeIds.has(edge.from) &&
      edge.from !== edge.to &&
      !claimed.has(edge.from)
  )
}

function buildTargetContainerLayoutOptions(
  options: {
    nodeNodeSpacing: number
    layerSpacing: number
    padding: number
    direction?: ElkDirection
  }
) {
  return {
    'elk.algorithm': 'layered',
    'elk.direction': options.direction ?? 'RIGHT',
    'elk.spacing.nodeNode': String(options.nodeNodeSpacing),
    'elk.padding': `[top=${options.padding},left=${options.padding},bottom=${options.padding},right=${options.padding}]`,
    'elk.alignment': 'TOP',
    'elk.contentAlignment': 'V_TOP H_RIGHT',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.cycleBreaking.strategy': 'GREEDY',
    'elk.layered.spacing.nodeNodeBetweenLayers': String(options.layerSpacing),
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    // 'elk.layered.nodePlacement.bk.edgeStraightening': 'NONE',
  }
}

/** Spacing only — no algorithm (nested tree nodes use root INCLUDE_CHILDREN layout). */
function buildNestedTreeLayoutOptions(options: { nodeNodeSpacing: number; padding: number }) {
  return {
    'elk.padding': `[top=${options.padding},left=${options.padding},bottom=${options.padding},right=${options.padding}]`,
    'elk.spacing.nodeNode': String(options.nodeNodeSpacing),
  }
}

function buildInputElkChild(
  directEdge: DirectAnchorEdge,
  nodeIds: Set<string>,
  edges: ElkLayeredEdgeInput[],
  nodeById: Map<string, ElkLayeredNodeInput>,
  claimed: Set<string>,
  options: {
    nodeNodeSpacing: number
    layerSpacing: number
    padding: number
    direction: ElkDirection
  }
): ElkLayoutGraph | null {
  const inputId = directEdge.from
  if (claimed.has(inputId)) return null

  const inputNode = nodeById.get(inputId)
  if (!inputNode) return null

  claimed.add(inputId)

  if (hasDirectUpstream(inputId, nodeIds, claimed, edges)) {
    return buildTargetContainerElk(inputId, nodeIds, edges, nodeById, claimed, options)
  }

  return buildElkChildren([inputNode], true)[0]
}

/**
 * Matryoshka: input containers (or leaves) + target node as direct siblings.
 * Walk direct inputs recursively; claimed prevents double-use across branches.
 */
function buildTargetContainerElk(
  targetId: string,
  nodeIds: Set<string>,
  edges: ElkLayeredEdgeInput[],
  nodeById: Map<string, ElkLayeredNodeInput>,
  claimedNodeIds: Set<string>,
  options: {
    nodeNodeSpacing: number
    layerSpacing: number
    padding: number
    direction: ElkDirection
  }
): ElkLayoutGraph | null {
  const targetNode = nodeById.get(targetId)
  if (!targetNode) return null

  claimedNodeIds.add(targetId)

  const directEdges = getDirectAnchorEdges(targetId, nodeIds, edges).filter(
    (edge) => !claimedNodeIds.has(edge.from)
  )
  if (directEdges.length === 0) {
    return buildElkChildren([targetNode], true)[0]
  }

  const containerId = `${ELK_TARGET_PREFIX}${sanitizeElkClusterIdPart(targetId)}`

  const inputChildren: ElkLayoutGraph[] = []
  const containerEdges: ElkLayeredEdgeInput[] = []

  for (const directEdge of directEdges) {
    const branchChild = buildInputElkChild(
      directEdge,
      nodeIds,
      edges,
      nodeById,
      claimedNodeIds,
      options
    )
    if (!branchChild) continue

    inputChildren.push(branchChild)
    containerEdges.push({
      id: `${directEdge.edgeId}::to::${targetId}`,
      from: branchChild.id,
      to: targetId,
      pinName: directEdge.pinName,
      priority: 10,
      inputEdge: true,
    })
  }

  if (inputChildren.length === 0) {
    return buildElkChildren([targetNode], true)[0]
  }

  const targetElkChild = buildElkChildren(
    [{ ...targetNode, layerConstraint: 'LAST' as const }],
    true
  )[0]

  return {
    id: containerId,
    layoutOptions: buildTargetContainerLayoutOptions(options),
    children: [...inputChildren, targetElkChild],
    edges: buildElkEdges(containerEdges, buildLayeredEdgeLayoutOptions),
  }
}

function buildInputTreeElkChild(
  directEdge: DirectAnchorEdge,
  nodeIds: Set<string>,
  edges: ElkLayeredEdgeInput[],
  nodeById: Map<string, ElkLayeredNodeInput>,
  claimed: Set<string>,
  options: {
    nodeNodeSpacing: number
    layerSpacing: number
    padding: number
    direction: ElkDirection
  }
): ElkLayoutGraph | null {
  const inputId = directEdge.from
  if (claimed.has(inputId)) return null

  const inputNode = nodeById.get(inputId)
  if (!inputNode) return null

  claimed.add(inputId)

  if (hasDirectUpstream(inputId, nodeIds, claimed, edges)) {
    return buildInputTreeElkNode(inputId, nodeIds, edges, nodeById, claimed, options)
  }

  return buildElkChildren([inputNode], true)[0]
}

/**
 * ELK hierarchy: each node's direct inputs are its children (recursive).
 * Edges run child → parent inside the node compound.
 */
function buildInputTreeElkNode(
  targetId: string,
  nodeIds: Set<string>,
  edges: ElkLayeredEdgeInput[],
  nodeById: Map<string, ElkLayeredNodeInput>,
  claimed: Set<string>,
  options: {
    nodeNodeSpacing: number
    layerSpacing: number
    padding: number
    direction: ElkDirection
  }
): ElkLayoutGraph | null {
  const targetNode = nodeById.get(targetId)
  if (!targetNode) return null

  if (!claimed.has(targetId)) {
    claimed.add(targetId)
  }

  const directEdges = getDirectAnchorEdges(targetId, nodeIds, edges).filter(
    (edge) => !claimed.has(edge.from)
  )

  if (directEdges.length === 0) {
    return buildElkChildren([targetNode], true)[0]
  }

  const inputChildren: ElkLayoutGraph[] = []
  const nodeEdges: ElkLayeredEdgeInput[] = []

  for (const directEdge of directEdges) {
    const child = buildInputTreeElkChild(
      directEdge,
      nodeIds,
      edges,
      nodeById,
      claimed,
      options
    )
    if (!child) continue

    inputChildren.push(child)
    nodeEdges.push({
      id: `${directEdge.edgeId}::to::${targetId}`,
      from: child.id,
      to: targetId,
      pinName: directEdge.pinName,
      priority: 10,
      inputEdge: true,
    })
  }

  if (inputChildren.length === 0) {
    return buildElkChildren([targetNode], true)[0]
  }

  return {
    id: targetId,
    width: targetNode.width,
    height: targetNode.height,
    layoutOptions: buildNestedTreeLayoutOptions({
      nodeNodeSpacing: options.nodeNodeSpacing,
      padding: options.padding,
    }),
    children: inputChildren,
    edges: buildElkEdges(nodeEdges, buildLayeredEdgeLayoutOptions),
  }
}

/** Siblings with no outgoing edge to another sibling — branch endpoints (sinks). */
function findLayoutSinkIds(
  nodeIds: Set<string>,
  edges: ElkLayeredEdgeInput[],
  preferredSinkIds?: string[]
): string[] {
  const hasOutgoing = new Set<string>()
  for (const edge of edges) {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      hasOutgoing.add(edge.from)
    }
  }

  const sinks = [...nodeIds].filter((id) => !hasOutgoing.has(id))
  if (sinks.length === 0) {
    return []
  }

  if (preferredSinkIds && preferredSinkIds.length > 0) {
    const preferred = preferredSinkIds.filter((id) => nodeIds.has(id))
    if (preferred.length > 0) {
      return preferred
    }
  }

  return sinks
}

function buildNodeToRootChildMap(
  rootChildren: ElkLayoutGraph[],
  nodeIds: Set<string>
): Map<string, string> {
  const map = new Map<string, string>()
  const walk = (node: ElkLayoutGraph, rootChildId: string) => {
    if (nodeIds.has(node.id)) {
      map.set(node.id, rootChildId)
    }
    node.children?.forEach((child) => walk(child, rootChildId))
  }
  for (const rootChild of rootChildren) {
    walk(rootChild, rootChild.id)
  }
  return map
}

export function buildCompoundElkGraph(
  nodes: ElkLayeredNodeInput[],
  edges: ElkLayeredEdgeInput[],
  options: {
    nodeNodeSpacing: number
    layerSpacing: number
    padding: number
    direction?: ElkDirection
  },
  preferredSinkIds?: string[]
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const sinks = findLayoutSinkIds(nodeIds, edges, preferredSinkIds)

  if (sinks.length === 0) {
    return null
  }

  const layoutOpts = {
    nodeNodeSpacing: options.nodeNodeSpacing,
    layerSpacing: options.layerSpacing,
    padding: options.padding,
    direction: options.direction ?? 'RIGHT',
  }

  const claimed = new Set<string>()
  const rootChildren: ElkLayoutGraph[] = []

  for (const sinkId of sinks) {
    if (claimed.has(sinkId)) continue

    const container = buildTargetContainerElk(
      sinkId,
      nodeIds,
      edges,
      nodeById,
      claimed,
      layoutOpts
    )
    if (!container) continue

    rootChildren.push(container)
  }

  for (const id of nodeIds) {
    if (claimed.has(id)) continue
    const node = nodeById.get(id)
    if (node) {
      rootChildren.push(...buildElkChildren([node], true))
      claimed.add(id)
    }
  }

  if (rootChildren.length === 0) {
    return null
  }

  const nodeToRootChild = buildNodeToRootChildMap(rootChildren, nodeIds)
  const rootEdges: ElkLayeredEdgeInput[] = []
  const rootEdgeKeys = new Set<string>()

  for (const edge of edges) {
    const fromRoot = nodeToRootChild.get(edge.from)
    const toRoot = nodeToRootChild.get(edge.to)
    if (!fromRoot || !toRoot || fromRoot === toRoot) continue

    const key = `${edge.id}::${fromRoot}->${toRoot}`
    if (rootEdgeKeys.has(key)) continue
    rootEdgeKeys.add(key)
    rootEdges.push({ ...edge, id: key, from: fromRoot, to: toRoot })
  }

  const direction = options.direction ?? 'RIGHT'

  return {
    id: 'elk-root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      // 'elk.separateHierarchy': 'true',
      'elk.spacing.nodeNode': String(options.nodeNodeSpacing),
      'elk.padding': `[top=${options.padding},left=${options.padding},bottom=${options.padding},right=${options.padding}]`,
      'elk.alignment': 'RIGHT',
      'elk.contentAlignment': 'V_TOP H_RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(options.layerSpacing),
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.cycleBreaking.strategy': 'GREEDY',
      'elk.layered.wrapping.strategy': 'OFF',
      'elk.layered.compaction.postCompaction.strategy': 'NONE',
      // 'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      // 'elk.layered.nodePlacement.bk.edgeStraightening': 'NONE',
      'elk.layered.thoroughness': '7',
    },
    children: rootChildren,
    edges: buildElkEdges(rootEdges, buildLayeredEdgeLayoutOptions),
  }
}

function buildRootLayeredLayoutOptions(options: {
  nodeNodeSpacing: number
  layerSpacing: number
  padding: number
  direction?: ElkDirection
  separateHierarchy?: boolean
  hierarchyHandling?: 'INCLUDE_CHILDREN' | 'SEPARATE_CHILDREN'
}) {
  const direction = options.direction ?? 'RIGHT'
  return {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    ...(options.separateHierarchy ? { 'elk.separateHierarchy': 'true' } : {}),
    ...(options.hierarchyHandling
      ? { 'elk.hierarchyHandling': options.hierarchyHandling }
      : {}),
    'elk.spacing.nodeNode': String(options.nodeNodeSpacing),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(options.layerSpacing),
    'elk.padding': `[top=${options.padding},left=${options.padding},bottom=${options.padding},right=${options.padding}]`,
    'elk.alignment': 'V_CENTER',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.cycleBreaking.strategy': 'GREEDY',
    'elk.layered.wrapping.strategy': 'OFF',
    'elk.layered.compaction.postCompaction.strategy': 'NONE',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    'elk.layered.nodePlacement.bk.edgeStraightening': 'NONE',
    'elk.layered.thoroughness': '7',
  }
}

/**
 * Hierarchical ELK graph from sinks: inputs nested as children of their target node.
 */
function buildInputTreeElkGraph(
  nodes: ElkLayeredNodeInput[],
  edges: ElkLayeredEdgeInput[],
  options: {
    nodeNodeSpacing: number
    layerSpacing: number
    padding: number
    direction?: ElkDirection
  },
  preferredSinkIds?: string[]
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const sinks = findLayoutSinkIds(nodeIds, edges, preferredSinkIds)

  if (sinks.length === 0) {
    return null
  }

  const layoutOpts = {
    nodeNodeSpacing: options.nodeNodeSpacing,
    layerSpacing: options.layerSpacing,
    padding: options.padding,
    direction: options.direction ?? 'RIGHT',
  }

  const claimed = new Set<string>()
  const rootChildren: ElkLayoutGraph[] = []

  for (const sinkId of sinks) {
    if (claimed.has(sinkId)) continue

    const tree = buildInputTreeElkNode(
      sinkId,
      nodeIds,
      edges,
      nodeById,
      claimed,
      layoutOpts
    )
    if (!tree) continue

    rootChildren.push(tree)
  }

  for (const id of nodeIds) {
    if (claimed.has(id)) continue
    const node = nodeById.get(id)
    if (node) {
      rootChildren.push(...buildElkChildren([node], true))
      claimed.add(id)
    }
  }

  if (rootChildren.length === 0) {
    return null
  }

  const nodeToRootChild = buildNodeToRootChildMap(rootChildren, nodeIds)
  const rootEdges: ElkLayeredEdgeInput[] = []
  const rootEdgeKeys = new Set<string>()

  for (const edge of edges) {
    const fromRoot = nodeToRootChild.get(edge.from)
    const toRoot = nodeToRootChild.get(edge.to)
    if (!fromRoot || !toRoot || fromRoot === toRoot) continue

    const key = `${edge.id}::${fromRoot}->${toRoot}`
    if (rootEdgeKeys.has(key)) continue
    rootEdgeKeys.add(key)
    rootEdges.push({ ...edge, id: key, from: fromRoot, to: toRoot })
  }

  return {
    id: 'elk-root',
    layoutOptions: buildRootLayeredLayoutOptions({
      ...options,
      hierarchyHandling: 'INCLUDE_CHILDREN',
    }),
    children: rootChildren,
    edges: buildElkEdges(rootEdges, buildLayeredEdgeLayoutOptions),
  }
}

function buildElkChildren(nodes: ElkLayeredNodeInput[], includeLayerConstraints: boolean) {
  return nodes.map((node) => ({
    id: node.id,
    width: node.width,
    height: node.height,
    ...(includeLayerConstraints && node.layerConstraint
      ? {
          layoutOptions: {
            'org.eclipse.elk.layered.layering.layerConstraint': node.layerConstraint,
          },
        }
      : {}),
  }))
}

function buildElkEdges(
  edges: ElkLayeredEdgeInput[],
  buildEdgeOptions: (edge: ElkLayeredEdgeInput) => Record<string, string> | undefined
) {
  return edges.map((edge) => {
    const layoutOptions = buildEdgeOptions(edge)
    return {
      id: edge.id,
      sources: [edge.from],
      targets: [edge.to],
      pinName: edge.pinName,
      ...(layoutOptions ? { layoutOptions } : {}),
    }
  })
}

export async function runElkLayeredLayout(
  input: ElkLayeredLayoutInput
): Promise<Map<string, { x: number; y: number }> | null> {
  if (input.nodes.length === 0) {
    return new Map()
  }

  const nodeNodeSpacing = input.nodeNodeSpacing ?? 28
  const layerSpacing = input.layerSpacing ?? 56
  const padding = input.padding ?? 12
  const direction = input.direction ?? 'RIGHT'

  const graph = {
    id: 'elk-root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.spacing.nodeNode': String(nodeNodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
      'elk.padding': `[top=${padding},left=${padding},bottom=${padding},right=${padding}]`,
      'elk.alignment': 'V_CENTER',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.cycleBreaking.strategy': 'GREEDY',
      'elk.layered.wrapping.strategy': 'OFF',
      'elk.layered.compaction.postCompaction.strategy': 'NONE',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.thoroughness': '7',
    },
    children: buildElkChildren(input.nodes, true),
    edges: buildElkEdges(input.edges, buildLayeredEdgeLayoutOptions),
  }

  try {
    const layouted = await elk.layout(graph)
    return extractPositions(layouted)
  } catch (err) {
    console.warn('elk.layout (layered) failed:', err)
    return null
  }
}

export async function runElkLayeredCompoundLayout(
  input: ElkLayeredLayoutInput,
  preferredSinkIds?: string | string[]
): Promise<Map<string, { x: number; y: number }> | null> {
  if (input.nodes.length === 0) {
    return new Map()
  }

  const nodeNodeSpacing = input.nodeNodeSpacing ?? 28
  const layerSpacing = input.layerSpacing ?? 56
  const padding = input.padding ?? 12
  const sinks = preferredSinkIds
    ? Array.isArray(preferredSinkIds)
      ? preferredSinkIds
      : [preferredSinkIds]
    : undefined

  const compoundGraph = buildCompoundElkGraph(
    input.nodes,
    input.edges,
    {
      nodeNodeSpacing,
      layerSpacing,
      padding,
      direction: input.direction,
    },
    sinks
  )

  const graph =
    compoundGraph ??
    ({
      id: 'elk-root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': input.direction ?? 'RIGHT',
        'elk.spacing.nodeNode': String(nodeNodeSpacing),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(layerSpacing),
        'elk.padding': `[top=${padding},left=${padding},bottom=${padding},right=${padding}]`,
        'elk.alignment': 'V_CENTER',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.layered.cycleBreaking.strategy': 'GREEDY',
        'elk.layered.wrapping.strategy': 'OFF',
        'elk.layered.compaction.postCompaction.strategy': 'NONE',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
        // 'elk.layered.nodePlacement.bk.edgeStraightening': 'NONE',
        'elk.layered.thoroughness': '7',
      },
      children: buildElkChildren(input.nodes, true),
      edges: buildElkEdges(input.edges, buildLayeredEdgeLayoutOptions),
    } as const)

  const leafIds = new Set(input.nodes.map((node) => node.id))
  const nodeSizes = new Map(
    input.nodes.map((node) => [node.id, { width: node.width, height: node.height }])
  )

  try {
    const layouted = await elk.layout(graph)
    if (compoundGraph) {
      const positions = extractCompoundPositions(layouted, leafIds)
      snapCompoundInputPositions(
        layouted as { children?: ElkLayoutChild[] },
        positions,
        leafIds,
        nodeSizes,
        input.edges
      )
      return positions
    }
    return extractPositions(layouted)
  } catch (err) {
    console.warn('elk.layout (layered compound) failed:', err)
    return null
  }
}

export async function runElkLayeredInputTreeLayout(
  input: ElkLayeredLayoutInput,
  preferredSinkIds?: string | string[]
): Promise<Map<string, { x: number; y: number }> | null> {
  if (input.nodes.length === 0) {
    return new Map()
  }

  const nodeNodeSpacing = input.nodeNodeSpacing ?? 28
  const layerSpacing = input.layerSpacing ?? 56
  const padding = input.padding ?? 12
  const sinks = preferredSinkIds
    ? Array.isArray(preferredSinkIds)
      ? preferredSinkIds
      : [preferredSinkIds]
    : undefined

  const treeGraph = buildInputTreeElkGraph(
    input.nodes,
    input.edges,
    {
      nodeNodeSpacing,
      layerSpacing,
      padding,
      direction: input.direction,
    },
    sinks
  )

  const graph =
    treeGraph ??
    ({
      id: 'elk-root',
      layoutOptions: buildRootLayeredLayoutOptions({
        nodeNodeSpacing,
        layerSpacing,
        padding,
        direction: input.direction,
      }),
      children: buildElkChildren(input.nodes, true),
      edges: buildElkEdges(input.edges, buildLayeredEdgeLayoutOptions),
    } as const)

  const leafIds = new Set(input.nodes.map((node) => node.id))

  try {
    const layouted = await elk.layout(graph)
    if (treeGraph) {
      return extractCompoundPositions(layouted, leafIds)
    }
    return extractPositions(layouted)
  } catch (err) {
    console.warn('elk.layout (layered input tree) failed:', err)
    return null
  }
}

export async function runElkForceLayout(
  input: ElkForceLayoutInput
): Promise<Map<string, { x: number; y: number }> | null> {
  if (input.nodes.length === 0) {
    return new Map()
  }

  const nodeNodeSpacing = input.nodeNodeSpacing ?? 40
  const padding = input.padding ?? 12
  const iterations = input.iterations ?? 300

  const graph = {
    id: 'elk-root',
    layoutOptions: {
      'elk.algorithm': 'force',
      'elk.spacing.nodeNode': String(nodeNodeSpacing),
      'elk.padding': `[top=${padding},left=${padding},bottom=${padding},right=${padding}]`,
      'elk.force.iterations': String(iterations),
      'elk.force.repulsivePower': '1',
    },
    children: buildElkChildren(input.nodes, false),
    edges: buildElkEdges(input.edges, buildForceEdgeLayoutOptions),
  }

  try {
    const layouted = await elk.layout(graph)
    return extractPositions(layouted)
  } catch (err) {
    console.warn('elk.layout (force) failed:', err)
    return null
  }
}

export async function runElkMrTreeLayout(
  input: ElkMrTreeLayoutInput
): Promise<Map<string, { x: number; y: number }> | null> {
  if (input.nodes.length === 0) {
    return new Map()
  }

  const nodeNodeSpacing = input.nodeNodeSpacing ?? 40
  const padding = input.padding ?? 12

  const graph = {
    id: 'elk-root',
    layoutOptions: {
      'elk.algorithm': 'mrtree',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': String(nodeNodeSpacing),
      'elk.padding': `[top=${padding},left=${padding},bottom=${padding},right=${padding}]`,
      'elk.alignment': 'V_CENTER',
    },
    children: buildElkChildren(input.nodes, false),
    edges: buildElkEdges(input.edges, buildMrTreeEdgeLayoutOptions),
  }

  try {
    const layouted = await elk.layout(graph)
    return extractPositions(layouted)
  } catch (err) {
    console.warn('elk.layout (mrtree) failed:', err)
    return null
  }
}

export interface ArrangeNodeSetWithElkOptions {
  algorithm?: ArrangeSelectionAlgorithm
  layeredVariant?: ElkLayeredVariant
  anchorNodeId?: string
  nodeNodeSpacing?: number
  layerSpacing?: number
  forceIterations?: number
  padding?: number
}

export async function arrangeNodeSetWithElk(
  nodeIds: string[],
  connections: DiagramConnection[],
  getNodeSize: (nodeId: string) => { width: number; height: number },
  options?: ArrangeNodeSetWithElkOptions
): Promise<Map<string, { x: number; y: number }> | null> {
  if (nodeIds.length === 0) {
    return new Map()
  }

  const algorithm = options?.algorithm ?? 'layered'
  const nodeIdSet = new Set(nodeIds)
  const elkNodes: ElkLayeredNodeInput[] = nodeIds.map((id) => {
    const size = getNodeSize(id)
    return {
      id,
      width: Math.max(size.width, 1),
      height: Math.max(size.height, 1),
    }
  })

  const edgeKeys = new Set<string>()
  const elkEdges: ElkLayeredEdgeInput[] = []

  for (const conn of connections) {
    if (!nodeIdSet.has(conn.from) || !nodeIdSet.has(conn.to)) continue
    if (conn.from === conn.to) continue

    const key = getConnectionKey(conn)
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)

    elkEdges.push({
      id: key,
      from: conn.from,
      to: conn.to,
      pinName: conn.pinName,
      priority: conn.type === DIAGRAM_CONNECTION_TYPE_INPUT ? 10 : 1,
      inputEdge: algorithm === 'layered' && conn.type === DIAGRAM_CONNECTION_TYPE_INPUT,
    })
  }

  if (algorithm === 'tidy-tree' || algorithm === 'cola-flow') {
    // Dynamic import avoids ElkGraphLayout ↔ DirectChildrenLayout cycle.
    const { runDirectChildrenLayout } = await import('./DirectChildrenLayout')
    const result = await runDirectChildrenLayout(algorithm, {
      nodes: elkNodes,
      edges: elkEdges,
      direction: 'RIGHT',
      nodeNodeSpacing: options?.nodeNodeSpacing,
      layerSpacing: options?.layerSpacing,
    })
    return result?.positions ?? null
  }

  if (algorithm === 'force') {
    return runElkForceLayout({
      nodes: elkNodes,
      edges: elkEdges,
      nodeNodeSpacing: options?.nodeNodeSpacing,
      padding: options?.padding,
      iterations: options?.forceIterations,
    })
  }

  if (algorithm === 'mrtree') {
    return runElkMrTreeLayout({
      nodes: elkNodes,
      edges: elkEdges,
      nodeNodeSpacing: options?.nodeNodeSpacing,
      padding: options?.padding,
    })
  }

  if (algorithm === 'layered' && options?.layeredVariant === 'compound') {
    return runElkLayeredCompoundLayout(
      {
        nodes: elkNodes,
        edges: elkEdges,
        nodeNodeSpacing: options?.nodeNodeSpacing,
        layerSpacing: options?.layerSpacing,
        padding: options?.padding,
      },
      options?.anchorNodeId
    )
  }

  if (algorithm === 'layered' && options?.layeredVariant === 'tree') {
    return runElkLayeredInputTreeLayout(
      {
        nodes: elkNodes,
        edges: elkEdges,
        nodeNodeSpacing: options?.nodeNodeSpacing,
        layerSpacing: options?.layerSpacing,
        padding: options?.padding,
      },
      options?.anchorNodeId
    )
  }

  return runElkLayeredLayout({
    nodes: elkNodes,
    edges: elkEdges,
    nodeNodeSpacing: options?.nodeNodeSpacing,
    layerSpacing: options?.layerSpacing,
    padding: options?.padding,
  })
}
