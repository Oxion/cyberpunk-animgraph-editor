import type { AnimgraphNode, AnimgraphNodeLike, AnimgraphObject } from './animgraphTypes'
import type { DiagramConnection, RenderData, RenderNode } from './diagramTypes'
import type { CommandContext } from './commands/execute'
import { executeCommand, undoCommand } from './commands/execute'
import type { GraphCommand } from './commands/types'
import { commandLabel } from './commands/types'
import {
  findStateMachineDiagramRootAncestor,
  isDiagramPortalNode,
} from './DiagramConversion'
import {
  bridgePortalHostId,
  collectHostBoxIdsForPortalChain,
  collectPortalChainForCrossView,
} from './portalTopology'
import {
  appendChild,
  DEFAULT_CHILD_SLOT,
  emptyChildSlots,
  getChildSlot,
  removeChild,
} from './nodeChildSlots'

/** Position-only patch for move operations. */
export interface NodePositionState {
  id: string
  position: { x: number; y: number }
  bounds: { x: number; y: number }
}

/** Position + size patch for resize operations. */
export interface NodeLayoutState {
  id: string
  position: { x: number; y: number }
  bounds: { x: number; y: number; width: number; height: number }
  size: { width: number; height: number }
}

export interface GraphHistoryStep {
  label: string
  /** Present when the step was created from a typed GraphCommand. */
  command?: GraphCommand
  undo: () => void | Promise<void>
  redo: () => void | Promise<void>
}

export interface GraphHistoryCallbacks {
  onChange?: () => void
  /** Fired only when a new undo step is pushed (not on undo/redo/clear). */
  onPush?: () => void
}

const MAX_STEPS = 100

export class GraphHistory {
  private undoStack: GraphHistoryStep[] = []
  private redoStack: GraphHistoryStep[] = []
  private callbacks: GraphHistoryCallbacks = {}
  private commandContext: CommandContext | null = null

  setCallbacks(callbacks: GraphHistoryCallbacks): void {
    this.callbacks = callbacks
  }

  setCommandContext(ctx: CommandContext): void {
    this.commandContext = ctx
  }

  push(step: GraphHistoryStep): void {
    this.undoStack.push(step)
    if (this.undoStack.length > MAX_STEPS) {
      this.undoStack.shift()
    }
    this.redoStack = []
    this.callbacks.onPush?.()
    this.callbacks.onChange?.()
  }

  /** Push a typed command; undo/redo run through CommandContext. */
  pushCommand(command: GraphCommand): void {
    if (!this.commandContext) {
      throw new Error('GraphHistory.setCommandContext() must be called before pushCommand')
    }
    const ctx = this.commandContext
    this.push({
      label: commandLabel(command),
      command,
      undo: () => undoCommand(command, ctx),
      redo: () => executeCommand(command, ctx),
    })
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
    this.callbacks.onChange?.()
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null
  }

  redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null
  }

  peekUndoCommand(): GraphCommand | null {
    return this.undoStack.at(-1)?.command ?? null
  }

  async undo(): Promise<boolean> {
    const step = this.undoStack.pop()
    if (!step) return false
    await step.undo()
    this.redoStack.push(step)
    this.callbacks.onChange?.()
    return true
  }

  async redo(): Promise<boolean> {
    const step = this.redoStack.pop()
    if (!step) return false
    await step.redo()
    this.undoStack.push(step)
    this.callbacks.onChange?.()
    return true
  }
}

export function captureNodePosition(node: RenderNode): NodePositionState {
  return {
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    bounds: { x: node.bounds.x, y: node.bounds.y },
  }
}

export function captureNodeLayout(node: RenderNode): NodeLayoutState {
  return {
    id: node.id,
    position: { x: node.position.x, y: node.position.y },
    bounds: { ...node.bounds },
    size: { ...node.size },
  }
}

export function applyNodePositions(graphData: RenderData, states: NodePositionState[]): string[] {
  const ids: string[] = []
  for (const state of states) {
    const node = graphData.allNodes.get(state.id)
    if (!node) continue
    node.position = { ...state.position }
    node.bounds.x = state.bounds.x
    node.bounds.y = state.bounds.y
    ids.push(state.id)
  }
  return ids
}

export function applyNodeLayouts(graphData: RenderData, states: NodeLayoutState[]): string[] {
  const ids: string[] = []
  for (const state of states) {
    const node = graphData.allNodes.get(state.id)
    if (!node) continue
    node.position = { ...state.position }
    node.bounds = { ...state.bounds }
    node.size = { ...state.size }
    ids.push(state.id)
  }
  return ids
}

function nodePositionsEqual(a: NodePositionState, b: NodePositionState): boolean {
  return (
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.bounds.x === b.bounds.x &&
    a.bounds.y === b.bounds.y
  )
}

function nodeLayoutsEqual(a: NodeLayoutState, b: NodeLayoutState): boolean {
  return (
    a.position.x === b.position.x &&
    a.position.y === b.position.y &&
    a.bounds.x === b.bounds.x &&
    a.bounds.y === b.bounds.y &&
    a.bounds.width === b.bounds.width &&
    a.bounds.height === b.bounds.height &&
    a.size.width === b.size.width &&
    a.size.height === b.size.height
  )
}

/** Keep only nodes whose position actually changed. */
export function pairPositionChanges(
  before: NodePositionState[],
  after: NodePositionState[]
): { before: NodePositionState[]; after: NodePositionState[] } {
  const afterById = new Map(after.map((state) => [state.id, state]))
  const changedBefore: NodePositionState[] = []
  const changedAfter: NodePositionState[] = []

  for (const beforeState of before) {
    const afterState = afterById.get(beforeState.id)
    if (!afterState || nodePositionsEqual(beforeState, afterState)) continue
    changedBefore.push(beforeState)
    changedAfter.push(afterState)
  }

  return { before: changedBefore, after: changedAfter }
}

/** Keep only nodes whose layout actually changed. */
export function pairLayoutChanges(
  before: NodeLayoutState[],
  after: NodeLayoutState[]
): { before: NodeLayoutState[]; after: NodeLayoutState[] } {
  const afterById = new Map(after.map((state) => [state.id, state]))
  const changedBefore: NodeLayoutState[] = []
  const changedAfter: NodeLayoutState[] = []

  for (const beforeState of before) {
    const afterState = afterById.get(beforeState.id)
    if (!afterState || nodeLayoutsEqual(beforeState, afterState)) continue
    changedBefore.push(beforeState)
    changedAfter.push(afterState)
  }

  return { before: changedBefore, after: changedAfter }
}

/** Snapshot parent container layouts before add/paste mutates them. */
export function snapshotParentLayoutsByIds(
  graphData: RenderData,
  parentIds: Iterable<string>
): Map<string, NodeLayoutState> {
  const map = new Map<string, NodeLayoutState>()
  for (const id of parentIds) {
    if (map.has(id)) continue
    const node = graphData.allNodes.get(id)
    if (node) map.set(id, captureNodeLayout(node))
  }
  return map
}

/** Pair before/after layouts for parents whose size changed during add/paste. */
export function pairParentLayoutChanges(
  graphData: RenderData,
  beforeById: ReadonlyMap<string, NodeLayoutState>
): { before: NodeLayoutState[]; after: NodeLayoutState[] } {
  const before: NodeLayoutState[] = []
  const after: NodeLayoutState[] = []
  for (const id of beforeById.keys()) {
    const node = graphData.allNodes.get(id)
    if (!node) continue
    before.push(beforeById.get(id)!)
    after.push(captureNodeLayout(node))
  }
  return pairLayoutChanges(before, after)
}

export function cloneConnections(connections: DiagramConnection[]): DiagramConnection[] {
  return connections.map((conn) => ({
    ...conn,
    metadata: conn.metadata ? { ...conn.metadata } : undefined,
  }))
}

export function cloneAnimgraphData(data: AnimgraphObject): AnimgraphObject {
  return JSON.parse(JSON.stringify(data)) as AnimgraphObject
}

function cloneNodesToInit(refs: AnimgraphNodeLike[] | undefined): AnimgraphNodeLike[] {
  if (!refs?.length) return []
  return JSON.parse(JSON.stringify(refs)) as AnimgraphNodeLike[]
}

function cloneFloatingHandleIds(ids: Set<string> | undefined): string[] {
  return ids?.size ? [...ids] : []
}

export interface AddedNodePlacement {
  node: RenderNode
  parentId: string | null
  /** Slot on parent that held the node (default body slot). */
  parentSlot?: string
  rootIndex: number | null
}

export function cloneRenderNodeForHistory(node: RenderNode): RenderNode {
  return {
    ...node,
    data: { ...node.data },
    position: { ...node.position },
    size: { ...node.size },
    bounds: { ...node.bounds },
    metadata: { ...node.metadata },
    childSlots: emptyChildSlots(),
    parent: undefined,
    parentSlot: undefined,
  }
}

export function removeNodeFromGraphData(graphData: RenderData, placement: AddedNodePlacement): void {
  graphData.allNodes.delete(placement.node.id)

  if (placement.rootIndex !== null) {
    graphData.rootNodes.splice(placement.rootIndex, 1)
    return
  }

  if (placement.parentId) {
    const parent = graphData.allNodes.get(placement.parentId)
    if (!parent) return
    const slot = placement.parentSlot ?? placement.node.parentSlot ?? DEFAULT_CHILD_SLOT
    const live = getChildSlot(parent, slot).find((c) => c.id === placement.node.id)
    if (live) removeChild(parent, live)
  }
}

export function restoreNodeToGraphData(graphData: RenderData, placement: AddedNodePlacement): void {
  const node = placement.node
  graphData.allNodes.set(node.id, node)
  graphData.nodeTypes.add(node.type)

  if (placement.rootIndex !== null) {
    graphData.rootNodes.splice(placement.rootIndex, 0, node)
    return
  }

  if (placement.parentId) {
    const parent = graphData.allNodes.get(placement.parentId)
    if (!parent) return
    appendChild(parent, node, placement.parentSlot ?? DEFAULT_CHILD_SLOT)
  }
}

export function captureAddedNodePlacement(
  graphData: RenderData,
  node: RenderNode,
  parentNode: RenderNode | null
): AddedNodePlacement {
  if (parentNode) {
    return {
      node: cloneRenderNodeForHistory(node),
      parentId: parentNode.id,
      parentSlot: node.parentSlot ?? DEFAULT_CHILD_SLOT,
      rootIndex: null,
    }
  }

  const rootIndex = graphData.rootNodes.findIndex((root) => root.id === node.id)
  return {
    node: cloneRenderNodeForHistory(node),
    parentId: null,
    rootIndex: rootIndex >= 0 ? rootIndex : null,
  }
}

export interface ConnectionDeleteSnapshot {
  connections: DiagramConnection[]
  targetHandleId: string
  targetHandleData: AnimgraphObject
  nodesToInit: AnimgraphNodeLike[]
  floatingHandleIds: string[]
  /** Portal boxes removed by disconnect GC — restored on undo. */
  portalPlacements: AddedNodePlacement[]
  /** Overview hosts (State / SM) whose portal pin chrome must rebuild. */
  hostBoxIds: string[]
}

/** Portal ids tied to a connection (metadata + endpoints + bridge↔deep chain). */
export function collectPortalIdsForConnection(
  graphData: RenderData,
  conn: DiagramConnection
): Set<string> {
  const portals = collectPortalChainForCrossView(graphData, conn)
  const from = graphData.allNodes.get(conn.from)
  const to = graphData.allNodes.get(conn.to)
  if (from && isDiagramPortalNode(from)) portals.add(from.id)
  if (to && isDiagramPortalNode(to)) portals.add(to.id)
  return portals
}

function collectHostBoxIdsForPortals(
  graphData: RenderData,
  portalIds: Iterable<string>
): string[] {
  return collectHostBoxIdsForPortalChain(graphData, portalIds)
}

export function captureConnectionDeleteSnapshot(
  graphData: RenderData,
  conn: DiagramConnection
): ConnectionDeleteSnapshot | null {
  const toNode = graphData.allNodes.get(conn.to)
  let logicalTo = toNode
  if (conn.metadata?.originalTo) {
    logicalTo = graphData.allNodes.get(conn.metadata.originalTo) ?? logicalTo
  } else if (toNode && isDiagramPortalNode(toNode)) {
    const originalTo = toNode.metadata?.originalTo
    if (typeof originalTo === 'string') {
      logicalTo = graphData.allNodes.get(originalTo) ?? logicalTo
    }
  }
  const originalNodeId =
    logicalTo?.data?.originalNodeId ??
    toNode?.data?.originalNodeId ??
    null
  if (!originalNodeId) return null

  const targetHandle = graphData.handlesRegistry.get(originalNodeId)
  if (!targetHandle) return null

  const portalIds = collectPortalIdsForConnection(graphData, conn)
  const portalPlacements: AddedNodePlacement[] = []
  for (const id of portalIds) {
    const portal = graphData.allNodes.get(id)
    if (!portal || !isDiagramPortalNode(portal)) continue
    portalPlacements.push(
      captureAddedNodePlacement(graphData, portal, portal.parent ?? null)
    )
  }

  return {
    connections: cloneConnections(graphData.connections),
    targetHandleId: originalNodeId,
    targetHandleData: cloneAnimgraphData(targetHandle.Data),
    nodesToInit: cloneNodesToInit(graphData.originalAnimgraph?.nodesToInit),
    floatingHandleIds: cloneFloatingHandleIds(graphData.floatingHandleIds),
    portalPlacements,
    hostBoxIds: collectHostBoxIdsForPortals(graphData, portalIds),
  }
}

export function restoreConnectionDeleteSnapshot(
  graphData: RenderData,
  snapshot: ConnectionDeleteSnapshot
): void {
  graphData.connections = cloneConnections(snapshot.connections)
  const targetHandle = graphData.handlesRegistry.get(snapshot.targetHandleId) as AnimgraphNode | undefined
  if (targetHandle) {
    targetHandle.Data = cloneAnimgraphData(snapshot.targetHandleData)
  }
  if (graphData.originalAnimgraph) {
    graphData.originalAnimgraph.nodesToInit = cloneNodesToInit(snapshot.nodesToInit)
  }
  graphData.floatingHandleIds = new Set(snapshot.floatingHandleIds)

  for (const placement of snapshot.portalPlacements ?? []) {
    if (graphData.allNodes.has(placement.node.id)) continue
    restoreNodeToGraphData(graphData, {
      ...placement,
      node: cloneRenderNodeForHistory(placement.node),
    })
  }
}
