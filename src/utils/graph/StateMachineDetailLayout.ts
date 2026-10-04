import type { AnimgraphNode } from './animgraphTypes'
import type { RenderData, RenderNode } from './diagramTypes'
import { DIAGRAM_CONNECTION_TYPE_INPUT } from './diagramConnectionTypes'
import { DEFAULT_CHILD_SLOT, getChildSlot } from './nodeChildSlots'
import { ANIM_NODE_STATE_TYPE_SET } from './animNodeStateTypes'

export {
  ANIM_NODE_TYPE_CONDITIONAL_ENTRY as CONDITIONAL_ENTRY_TYPE,
  ANIM_NODE_TYPE_TRANSITION_DESCRIPTION as TRANSITION_DESCRIPTION_TYPE,
} from './animNodeTypes'

/** Minimal connection shape for input-chain walks (avoids circular import). */
export interface LayoutInputConnection {
  from: string
  to: string
  type: string
}

/** Upstream input nodes wired into a node (condition / interpolator chain). */
export function collectInputChainIds(
  rootId: string,
  connections: LayoutInputConnection[],
  options: { excludeNodeIds?: ReadonlySet<string> } = {}
): string[] {
  const { excludeNodeIds } = options
  const chain = new Set<string>()
  const queue = [rootId]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (chain.has(current)) continue
    chain.add(current)

    for (const conn of connections) {
      if (conn.type !== DIAGRAM_CONNECTION_TYPE_INPUT || conn.to !== current) continue
      const fromId = conn.from
      if (fromId === current) continue
      if (excludeNodeIds?.has(fromId)) continue
      if (!chain.has(fromId)) queue.push(fromId)
    }
  }

  return Array.from(chain)
}

/** Root ids that are not wired as inputs to another id in the same set. */
export function filterInputChainRoots(
  rootIds: string[],
  connections: LayoutInputConnection[]
): string[] {
  const idSet = new Set(rootIds)
  const inputOnly = new Set<string>()

  connections.forEach((conn) => {
    if (conn.type !== DIAGRAM_CONNECTION_TYPE_INPUT) return
    if (!idSet.has(conn.from) || !idSet.has(conn.to) || conn.from === conn.to) return
    inputOnly.add(conn.from)
  })

  return rootIds.filter((id) => !inputOnly.has(id))
}

/** Order chain for horizontal layout: upstream sources first, root last. */
export function orderInputChainForLayout(
  chainIds: string[],
  rootId: string,
  connections: LayoutInputConnection[]
): string[] {
  const chainSet = new Set(chainIds)
  const upstream = chainIds.filter((id) => id !== rootId)
  const degree = new Map<string, number>()
  upstream.forEach((id) => degree.set(id, 0))

  connections.forEach((conn) => {
    if (conn.type !== DIAGRAM_CONNECTION_TYPE_INPUT) return
    if (!chainSet.has(conn.from) || !chainSet.has(conn.to)) return
    if (conn.to === rootId) return
    if (!upstream.includes(conn.from) || !upstream.includes(conn.to)) return
    degree.set(conn.to, (degree.get(conn.to) ?? 0) + 1)
  })

  const queue = upstream.filter((id) => (degree.get(id) ?? 0) === 0)
  const ordered: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    ordered.push(id)
    connections.forEach((conn) => {
      if (conn.type !== DIAGRAM_CONNECTION_TYPE_INPUT || conn.from !== id) return
      if (!upstream.includes(conn.to) || conn.to === rootId) return
      const next = (degree.get(conn.to) ?? 0) - 1
      degree.set(conn.to, next)
      if (next === 0) queue.push(conn.to)
    })
  }

  upstream.forEach((id) => {
    if (!ordered.includes(id)) ordered.push(id)
  })
  if (chainSet.has(rootId)) ordered.push(rootId)
  return ordered
}

export interface CircleLayoutSlot {
  state: RenderNode
  stateIndex: number
  x: number
  y: number
  centerX: number
  centerY: number
}

export interface StateTransitionEdge {
  fromIndex: number
  toIndex: number
}

export function getPropertyGroup(sm: RenderNode, propertyName: string): RenderNode | undefined {
  return getChildSlot(sm).find(
    (c) =>
      c.metadata?.propertyName === propertyName ||
      c.metadata?.smDiagramRole === propertyName ||
      c.id.endsWith(`_group_${propertyName}`)
  )
}

export function getSmPropertyGroup(
  sm: RenderNode,
  propertyName: string,
  _allNodes?: Map<string, RenderNode>
): RenderNode | undefined {
  return getPropertyGroup(sm, propertyName)
}

/** Transition overview leaves in the SM `transitions` property group. */
export function getSmTransitionNodes(
  sm: RenderNode,
  allNodes: Map<string, RenderNode>
): RenderNode[] {
  const transitionsGroup = getSmPropertyGroup(sm, 'transitions', allNodes)
  return transitionsGroup ? getChildSlot(transitionsGroup) : []
}

/** Ordered transition nodes by SM.transitions handle refs (matches outTransitionIndices). */
export function getSmTransitionNodesInHandleOrder(
  sm: RenderNode,
  allNodes: Map<string, RenderNode>,
  handlesRegistry: Map<string, AnimgraphNode>
): RenderNode[] {
  const smHandleId = String(sm.data?.originalNodeId ?? sm.id)
  const smHandle = handlesRegistry.get(smHandleId)
  const transitionsGroup = getSmPropertyGroup(sm, 'transitions', allNodes)
  if (
    !smHandle?.Data?.transitions ||
    !Array.isArray(smHandle.Data.transitions) ||
    !transitionsGroup
  ) {
    return getSmTransitionNodes(sm, allNodes)
  }

  const byHandleOrId = new Map<string, RenderNode>()
  for (const child of getChildSlot(transitionsGroup, DEFAULT_CHILD_SLOT)) {
    byHandleOrId.set(child.id, child)
    const oid = child.data?.originalNodeId
    if (typeof oid === 'string') byHandleOrId.set(oid, child)
  }

  const result: RenderNode[] = []
  for (const ref of smHandle.Data.transitions) {
    if (
      ref &&
      typeof ref === 'object' &&
      'HandleRefId' in ref &&
      typeof (ref as { HandleRefId: string }).HandleRefId === 'string'
    ) {
      const box = byHandleOrId.get(String((ref as { HandleRefId: string }).HandleRefId))
      if (box) result.push(box)
    }
  }
  return result.length > 0 ? result : getSmTransitionNodes(sm, allNodes)
}

/** Global transition overview leaves in the SM `globalTransitions` property group. */
export function getSmGlobalTransitionNodes(
  sm: RenderNode,
  allNodes: Map<string, RenderNode>
): RenderNode[] {
  const globalGroup = getSmPropertyGroup(sm, 'globalTransitions', allNodes)
  return globalGroup ? getChildSlot(globalGroup) : []
}

function readNumericField(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (value && typeof value === 'object' && '$value' in value) {
    const parsed = Number((value as { $value: unknown }).$value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function parseTargetStateIndex(
  node: RenderNode,
  handlesRegistry?: Map<string, AnimgraphNode>
): number | null {
  const fromDescription = node.description?.match(/#targetStateIndex=(\d+)/)
  if (fromDescription) {
    const index = Number.parseInt(fromDescription[1], 10)
    if (!Number.isNaN(index)) return index
  }

  const fromMeta = readNumericField(node.metadata?.targetStateIndex)
  if (fromMeta !== null) return fromMeta

  const handleId = (node.data?.originalNodeId as string | undefined) ?? node.id
  const handle = handlesRegistry?.get(handleId)
  const fromHandle = readNumericField(handle?.Data?.targetStateIndex)
  if (fromHandle !== null) return fromHandle

  return null
}

/** Resolve target state index from #targetStateIndex= or global #target="StateName". */
export function resolveTransitionTargetStateIndex(
  transition: RenderNode,
  states: RenderNode[],
  handlesRegistry?: Map<string, AnimgraphNode>
): number | null {
  const fromIndex = parseTargetStateIndex(transition, handlesRegistry)
  if (fromIndex !== null) return fromIndex

  const nameMatch = transition.description?.match(/#target="([^"]+)"/)
  if (!nameMatch) return null

  const targetName = nameMatch[1]
  const registry = handlesRegistry ?? new Map<string, AnimgraphNode>()
  const idx = states.findIndex((state) => getStateDisplayName(state, registry) === targetName)
  return idx >= 0 ? idx : null
}

export function transitionTargetsStateAtIndex(
  transition: RenderNode | undefined,
  stateIndex: number,
  states: RenderNode[],
  handlesRegistry?: Map<string, AnimgraphNode>
): boolean {
  if (!transition) return false
  const targetIndex = resolveTransitionTargetStateIndex(transition, states, handlesRegistry)
  return targetIndex !== null && targetIndex === stateIndex
}

export function getIncomingTransitionsForState(
  sm: RenderNode,
  stateIndex: number,
  allNodes: Map<string, RenderNode>,
  handlesRegistry?: Map<string, AnimgraphNode>
): RenderNode[] {
  const states = getStateNodesFromSm(sm, allNodes)
  return getSmTransitionNodes(sm, allNodes).filter((t) =>
    transitionTargetsStateAtIndex(t, stateIndex, states, handlesRegistry)
  )
}

export function getGlobalTransitionsForState(
  sm: RenderNode,
  stateIndex: number,
  allNodes: Map<string, RenderNode>,
  handlesRegistry?: Map<string, AnimgraphNode>
): RenderNode[] {
  const states = getStateNodesFromSm(sm, allNodes)
  return getSmGlobalTransitionNodes(sm, allNodes).filter((t) =>
    transitionTargetsStateAtIndex(t, stateIndex, states, handlesRegistry)
  )
}

/** @TODO needs to be converted to diagram util function */
export function getStateNodesFromSm(
  sm: RenderNode,
  allNodes?: Map<string, RenderNode>
): RenderNode[] {
  const stateIds = sm.metadata?.stateIds as string[] | undefined
  if (stateIds && allNodes) {
    return stateIds
      .map((id) => allNodes.get(id))
      .filter((n): n is RenderNode => !!n && ANIM_NODE_STATE_TYPE_SET.has(n.type))
  }

  const group = getPropertyGroup(sm, 'states')
  if (!group) return []
  return getChildSlot(group).filter((c) => ANIM_NODE_STATE_TYPE_SET.has(c.type))
}

export function getStateDisplayName(state: RenderNode, registry: Map<string, AnimgraphNode>): string {
  const fromDesc = state.description?.match(/#name=([^,\s#]+)/)?.[1]
  if (fromDesc) return fromDesc

  const handleId = state.data?.originalNodeId ?? state.id
  const handle = registry.get(handleId)
  const nameVal = handle?.Data?.name?.$value ?? handle?.Data?.name
  if (typeof nameVal === 'string' && nameVal && nameVal !== 'None') {
    return nameVal
  }
  return state.id
}

/**
 * Compact row-major grid for variable-size cells: tries column counts 1..n
 * and picks the layout with smallest bounding-box area.
 */
export function layoutNodesInCompactGrid(
  sizes: Array<{ width: number; height: number }>,
  options: { gap?: number; padding?: number } = {}
): {
  positions: Array<{ x: number; y: number }>
  totalWidth: number
  totalHeight: number
} {
  const gap = options.gap ?? 20
  const padding = options.padding ?? 0
  const n = sizes.length

  if (n === 0) {
    return { positions: [], totalWidth: 0, totalHeight: 0 }
  }
  if (n === 1) {
    return {
      positions: [{ x: padding, y: padding }],
      totalWidth: sizes[0].width + padding * 2,
      totalHeight: sizes[0].height + padding * 2,
    }
  }

  let bestCols = 1
  let bestWidth = Infinity
  let bestHeight = Infinity
  let bestArea = Infinity
  let bestColWidths: number[] = []
  let bestRowHeights: number[] = []

  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const colWidths = new Array<number>(cols).fill(0)
    const rowHeights = new Array<number>(rows).fill(0)

    for (let i = 0; i < n; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      colWidths[col] = Math.max(colWidths[col], sizes[i].width)
      rowHeights[row] = Math.max(rowHeights[row], sizes[i].height)
    }

    const totalWidth =
      colWidths.reduce((sum, w) => sum + w, 0) + Math.max(0, cols - 1) * gap
    const totalHeight =
      rowHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, rows - 1) * gap
    const area = totalWidth * totalHeight

    const aspectPenalty =
      Math.max(totalWidth, totalHeight) / Math.max(1, Math.min(totalWidth, totalHeight))
    const score = area * (1 + 0.02 * Math.max(0, aspectPenalty - 2))

    if (score < bestArea) {
      bestArea = score
      bestCols = cols
      bestWidth = totalWidth
      bestHeight = totalHeight
      bestColWidths = colWidths
      bestRowHeights = rowHeights
    }
  }

  const rows = Math.ceil(n / bestCols)
  const colX: number[] = []
  const rowY: number[] = []
  let x = padding
  for (let c = 0; c < bestCols; c++) {
    colX[c] = x
    x += bestColWidths[c] + gap
  }
  let y = padding
  for (let r = 0; r < rows; r++) {
    rowY[r] = y
    y += bestRowHeights[r] + gap
  }

  const positions = sizes.map((size, i) => {
    const col = i % bestCols
    const row = Math.floor(i / bestCols)
    return { x: colX[col], y: rowY[row] }
  })

  return {
    positions,
    totalWidth: bestWidth + padding * 2,
    totalHeight: bestHeight + padding * 2,
  }
}

/** Minimum ring radius so chip rectangles do not overlap (clockwise placement) */
export function computeRingRadiusForChips(
  stateCount: number,
  chipWidth: number,
  chipHeight: number,
  minGap = 16
): number {
  if (stateCount <= 1) return 72
  const minChord = Math.hypot(chipWidth, chipHeight) + minGap
  const r = minChord / (2 * Math.sin(Math.PI / stateCount))
  return Math.max(80, Math.ceil(r))
}

/** Clockwise from 12 o'clock (hour hand direction) */
export function layoutStatesOnCircle(
  states: RenderNode[],
  centerX: number,
  centerY: number,
  radius: number,
  chipWidth: number,
  chipHeight: number
): CircleLayoutSlot[] {
  const n = states.length
  if (n === 0) return []

  return states.map((state, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n
    const cx = centerX + radius * Math.cos(angle)
    const cy = centerY + radius * Math.sin(angle)
    return {
      state,
      stateIndex: i,
      x: cx - chipWidth / 2,
      y: cy - chipHeight / 2,
      centerX: cx,
      centerY: cy,
    }
  })
}

export function computeStateMachineDetailPanelSize(
  stateCount: number,
  chipWidth = 108,
  chipHeight = 52
): { width: number; height: number; radius: number } {
  const radius = computeRingRadiusForChips(stateCount, chipWidth, chipHeight)
  const diameter = radius * 2
  return {
    radius,
    width: Math.max(480, diameter + chipWidth + 80),
    height: Math.max(320, diameter + chipHeight + 80),
  }
}

/** Point on chip border toward another chip (for transition lines) */
export function getChipBorderPoint(
  centerX: number,
  centerY: number,
  towardX: number,
  towardY: number,
  chipWidth: number,
  chipHeight: number
): { x: number; y: number } {
  const dx = towardX - centerX
  const dy = towardY - centerY
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) {
    return { x: centerX, y: centerY - chipHeight / 2 }
  }
  const angle = Math.atan2(dy, dx)
  const hw = chipWidth / 2
  const hh = chipHeight / 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const t = Math.min(
    hw / Math.max(Math.abs(cos), 1e-6),
    hh / Math.max(Math.abs(sin), 1e-6)
  )
  return {
    x: centerX + cos * t,
    y: centerY + sin * t,
  }
}

/** Directed edges between state indices from transition data */
export function getStateTransitionEdges(sm: RenderNode, graphData: RenderData): StateTransitionEdge[] {
  const states = getStateNodesFromSm(sm, graphData.allNodes)
  const edges: StateTransitionEdge[] = []
  const seen = new Set<string>()

  states.forEach((state, fromIndex) => {
    getTransitionsForState(sm, state, graphData).forEach((transition) => {
      const toIndex = resolveTransitionTargetStateIndex(
        transition,
        states,
        graphData.handlesRegistry
      )
      if (toIndex === null || toIndex < 0 || toIndex >= states.length || toIndex === fromIndex) {
        return
      }
      const key = `${fromIndex}->${toIndex}`
      if (seen.has(key)) return
      seen.add(key)
      edges.push({ fromIndex, toIndex })
    })
  })

  return edges
}

/** Outgoing transitions for a state (by outTransitionIndices + SM transitions group) */
export function getTransitionsForState(
  sm: RenderNode,
  state: RenderNode,
  graphData: RenderData
): RenderNode[] {
  const byOrder = getSmTransitionNodesInHandleOrder(
    sm,
    graphData.allNodes,
    graphData.handlesRegistry
  )
  if (byOrder.length === 0) return []

  const handleId = state.data?.originalNodeId ?? state.id
  const handle = graphData.handlesRegistry.get(handleId)
  const indices: number[] = handle?.Data?.outTransitionIndices ?? []
  if (!Array.isArray(indices) || indices.length === 0) {
    return []
  }

  const result: RenderNode[] = []
  indices.forEach((idx) => {
    const node = byOrder[idx]
    if (node) result.push(node)
  })
  return result
}

export function getStateDiagramNodes(state: RenderNode): RenderNode[] {
  const nodesGroup = getChildSlot(state).find(
    (c) => c.metadata?.propertyName === 'nodes' || c.id.includes('_group_nodes')
  )
  return nodesGroup ? getChildSlot(nodesGroup) : []
}
