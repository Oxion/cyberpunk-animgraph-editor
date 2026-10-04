import {
  beginLayoutCapture,
  beginPositionCapture,
  cancelLayoutCapture,
  cancelPositionCapture,
  commitLayoutCapture,
  commitPositionCapture,
  discardOpenPositionGesture,
  graphHistoryState,
  isLayoutGestureOpen,
  isPositionGestureOpen,
  runWithLayoutHistory,
  runWithPositionHistory,
  trackLayoutBeforeChange,
  trackPositionBeforeChange,
} from '../../stores/graphHistory'
import { updateActiveNodes } from '../../stores/graphPaint'
import { getRenderData, requireActiveDiagramId } from '../../stores/graphProject'
import {
  nodePositionRef,
  selectedIncomingConnectionsRef,
  selectedNodeConnectionsComputed,
  selectedNodeIdsRef,
  selectedNodeRef,
} from '../../stores/graphSession'
import {
  getActiveDiagramRenderer,
  mainDiagramRenderer as graphRenderer,
} from '../../stores/diagramRenderers'
import {
  autoResizeParents,
  beginModalGestureTool,
  lastPointerClient,
  modalGestureReplacedFocus,
  moveDescendants,
  moveInputs,
  moveOutputs,
  moveStep,
  pressedArrowKeys,
  suppressModalGestureRestore,
} from '../../stores/modalGestureUi'
import {
  activeToolsRegistry,
  onToolDeactivate,
  toolManager,
} from '../../stores/toolManager'
import {
  arrangeSelectionToolCache,
  moveToolState,
  resizeToolState,
  type GrabAxisLock,
} from '../../stores/tools'
import { getConnectionKey } from '../../utils/graph/diagramModel'
import type { RenderData, RenderNode } from '../../utils/graph/diagramTypes'
import { getWorldPosition } from '../../utils/graph/DiagramGeometry'
import {
  arrangeNodeSetWithElk,
  type ArrangeSelectionAlgorithm,
  type ElkLayeredVariant,
} from '../../utils/graph/ElkGraphLayout'
import { forEachDirectChild } from '../../utils/graph/nodeChildSlots'
import {
  applyResizeCascadePlan,
  applyResizeStartLayout,
  buildResizeCascadePlan,
  captureResizeCascadeBaselines,
  captureResizeStartLayout,
  restoreResizeCascadeBaselines,
  type BeforeLayoutMutate,
} from '../../utils/graph/resizeCascade'
import type { ResizeAncestorPlan, ResizeStartLayout } from '../../stores/tools'
import {
  attachModalPointerListeners,
  detachModalPointerListeners,
  getNodeHeight,
  getNodeWidth,
  registerGrabModalApi,
  requireHost,
  restoreToolAfterModalGesture,
} from './moveResizeShared'
import { cancelResize } from './resizeSession'
import { commandEnabled } from '../../stores/appContext'

/** Non-modal arrow-key gesture: absolute restore + parent grow across key repeats. */
type ArrowMoveCascade = {
  diagramId: string
  growParents: boolean
  seedStartLayouts: Map<string, ResizeStartLayout>
  satelliteStartLayouts: Map<string, ResizeStartLayout>
  cascadeStartLayouts: Map<string, ResizeStartLayout>
  cascadePlan: ResizeAncestorPlan[]
  totalDelta: { x: number; y: number }
}

let arrowMoveCascade: ArrowMoveCascade | null = null

const clearArrowMoveCascade = () => {
  arrowMoveCascade = null
}

const collectMoveOperationSeedIds = (diagramId: string): string[] => {
  const diagramData = getRenderData(diagramId)
  if (!diagramData) return []
  const ids = new Set<string>(selectedNodeIdsRef.value)
  if (selectedNodeIdsRef.value.length === 1 && selectedNodeRef.value) {
    if (moveOutputs.value) {
      for (const node of getAllOutputNodes(diagramId, selectedNodeRef.value)) {
        ids.add(node.id)
      }
    }
    if (moveInputs.value) {
      for (const node of getAllInputNodes(diagramId, selectedNodeRef.value)) {
        ids.add(node.id)
      }
    }
  }
  return [...ids].filter((id) => diagramData.allNodes.has(id))
}

const captureMoveStartLayouts = (
  diagramData: RenderData,
  seedIds: Iterable<string>,
  selectedIds: ReadonlySet<string>
): {
  seedStartLayouts: Map<string, ResizeStartLayout>
  satelliteStartLayouts: Map<string, ResizeStartLayout>
} => {
  const seedStartLayouts = new Map<string, ResizeStartLayout>()
  const satelliteStartLayouts = new Map<string, ResizeStartLayout>()
  for (const id of seedIds) {
    const node = diagramData.allNodes.get(id)
    if (!node) continue
    const layout = captureResizeStartLayout(node)
    if (selectedIds.has(id)) seedStartLayouts.set(id, layout)
    else satelliteStartLayouts.set(id, layout)
  }
  return { seedStartLayouts, satelliteStartLayouts }
}

const applyLayoutDeltaToNode = (
  node: RenderNode,
  start: ResizeStartLayout,
  deltaX: number,
  deltaY: number,
  onBefore: BeforeLayoutMutate
) => {
  onBefore(node)
  applyResizeStartLayout(node, {
    x: start.x + deltaX,
    y: start.y + deltaY,
    width: start.width,
    height: start.height,
  })
}

/**
 * Restore baselines, place all operation nodes at start+delta, grow parents to the
 * union bbox of those nodes (leaf→root). No neighbour push.
 */
const applyAbsoluteMoveWithParentGrow = (
  diagramData: RenderData,
  deltaX: number,
  deltaY: number,
  seedStartLayouts: Map<string, ResizeStartLayout>,
  satelliteStartLayouts: Map<string, ResizeStartLayout>,
  cascadeStartLayouts: Map<string, ResizeStartLayout>,
  cascadePlan: ResizeAncestorPlan[],
  growParents: boolean,
  onBefore: BeforeLayoutMutate
): string[] => {
  if (growParents) {
    restoreResizeCascadeBaselines(diagramData, cascadeStartLayouts)
  } else {
    for (const [id, start] of seedStartLayouts) {
      const node = diagramData.allNodes.get(id)
      if (node) applyResizeStartLayout(node, start)
    }
    for (const [id, start] of satelliteStartLayouts) {
      const node = diagramData.allNodes.get(id)
      if (node) applyResizeStartLayout(node, start)
    }
  }

  const affected = new Set<string>()
  for (const [id, start] of seedStartLayouts) {
    const node = diagramData.allNodes.get(id)
    if (!node) continue
    applyLayoutDeltaToNode(node, start, deltaX, deltaY, onBefore)
    affected.add(id)
  }
  for (const [id, start] of satelliteStartLayouts) {
    const node = diagramData.allNodes.get(id)
    if (!node) continue
    applyLayoutDeltaToNode(node, start, deltaX, deltaY, onBefore)
    affected.add(id)
  }

  if (growParents) {
    const cascade = applyResizeCascadePlan(diagramData, cascadePlan, cascadeStartLayouts, {
      growParents: true,
      moveParentNeighbours: false,
      onBeforeLayoutMutate: onBefore,
    })
    cascade.affectedIds.forEach((id) => affected.add(id))
  }

  return [...affected]
}

export const moveInputNodesCloser = (
  diagramId: string,
  selectedNode: RenderNode,
  margin: number,
  spacing: number
) => {
  const diagramData = getRenderData(diagramId)
  if (!diagramData || !selectedNodeConnectionsComputed.value) return

  const selectedPos = selectedNode.position
  const horizontalGap = Math.max(0, margin)
  const verticalGap = Math.max(0, spacing)

  const selectedConnections = selectedNodeConnectionsComputed.value.incoming.filter((conn) =>
    selectedIncomingConnectionsRef.value.has(getConnectionKey(conn))
  )

  const inputNodes = selectedConnections
    .map((conn) => diagramData.allNodes.get(conn.from))
    .filter((node): node is RenderNode => Boolean(node))

  if (inputNodes.length === 0) return

  inputNodes.sort((a, b) => (getWorldPosition(a)?.y ?? 0) - (getWorldPosition(b)?.y ?? 0))

  const inputHeights = inputNodes.map(getNodeHeight)
  const totalStackHeight =
    inputHeights.reduce((sum, h) => sum + h, 0) +
    Math.max(0, inputNodes.length - 1) * verticalGap

  const selectedCenterY = selectedPos.y + getNodeHeight(selectedNode) / 2
  let currentY = selectedCenterY - totalStackHeight / 2

  inputNodes.forEach((inputNode, index) => {
    const inputWidth = getNodeWidth(inputNode)
    const inputHeight = inputHeights[index]
    const newX = selectedPos.x - horizontalGap - inputWidth
    const newY = currentY

    const deltaX = newX - inputNode.position.x
    const deltaY = newY - inputNode.position.y

    moveNodeAndDescendants(diagramId, inputNode, deltaX, deltaY)
    currentY += inputHeight + verticalGap
  })

  console.log(`Arranged ${inputNodes.length} input nodes left of ${selectedNode.id}`)
}

export const moveInputNodesOnly = (diagramId: string, margin: number, spacing: number) => {
  if (!selectedNodeRef.value) return

  runWithPositionHistory(diagramId, 'Arrange inputs', () => {
    clearMovedNodes()
    moveInputNodesCloser(diagramId, selectedNodeRef.value!, margin, spacing)
    if (graphRenderer.value && movedNodeIds.size > 0) {
      updateActiveNodes(Array.from(movedNodeIds))
    }
  })
}

export const arrangeSelectedNodesWithElk = async (
  diagramId: string,
  options: {
    algorithm: ArrangeSelectionAlgorithm
    layeredVariant: ElkLayeredVariant
    nodeNodeSpacing: number
    layerSpacing: number
    forceIterations: number
  }
) => {
  const diagramData = getRenderData(diagramId)
  if (!diagramData || !graphRenderer.value || selectedNodeIdsRef.value.length < 2) return

  arrangeSelectionToolCache.busy = true
  try {
    const ids = selectedNodeIdsRef.value
    const selectedNodes = ids
      .map((id) => diagramData.allNodes.get(id))
      .filter((node): node is RenderNode => Boolean(node))

    if (selectedNodes.length < 2) return

    const anchorNode =
      selectedNodeRef.value && ids.includes(selectedNodeRef.value.id)
        ? selectedNodeRef.value
        : selectedNodes[0]

    if (!graphHistoryState.isApplying) {
      beginPositionCapture(diagramId)
    }

    const elkPositions = await arrangeNodeSetWithElk(
      ids,
      diagramData.connections,
      (id) => {
        const node = diagramData.allNodes.get(id)
        return {
          width: node ? getNodeWidth(node) : 40,
          height: node ? getNodeHeight(node) : 30,
        }
      },
      {
        algorithm: options.algorithm,
        layeredVariant: options.layeredVariant,
        anchorNodeId: anchorNode.id,
        nodeNodeSpacing: Math.max(0, options.nodeNodeSpacing),
        layerSpacing: Math.max(0, options.layerSpacing),
        forceIterations: Math.max(50, options.forceIterations),
      }
    )

    if (!elkPositions || elkPositions.size === 0) return

    const anchorElkPos = elkPositions.get(anchorNode.id)
    if (!anchorElkPos) return

    const offsetX = anchorNode.position.x - anchorElkPos.x
    const offsetY = anchorNode.position.y - anchorElkPos.y

    clearMovedNodes()
    for (const node of selectedNodes) {
      const elkPos = elkPositions.get(node.id)
      if (!elkPos) continue
      moveNodeAndDescendants(
        diagramId,
        node,
        elkPos.x + offsetX - node.position.x,
        elkPos.y + offsetY - node.position.y,
        true
      )
    }

    updateActiveNodes(Array.from(movedNodeIds))

    if (selectedNodeRef.value) {
      nodePositionRef.value.x = selectedNodeRef.value.position.x
      nodePositionRef.value.y = selectedNodeRef.value.position.y
    }

    if (!graphHistoryState.isApplying) {
      const historyLabel =
        options.algorithm === 'layered' && options.layeredVariant === 'compound'
          ? 'Arrange selection (ELK layered compound)'
          : ({
              layered: 'Arrange selection (ELK layered)',
              mrtree: 'Arrange selection (ELK Mr. Tree)',
              force: 'Arrange selection (ELK force)',
              'tidy-tree': 'Arrange selection (tidy tree)',
              'cola-flow': 'Arrange selection (cola flow)',
            } satisfies Record<ArrangeSelectionAlgorithm, string>)[options.algorithm]
      commitPositionCapture(diagramId, historyLabel)
    }
  } finally {
    arrangeSelectionToolCache.busy = false
    if (isPositionGestureOpen() && !graphHistoryState.isApplying) {
      discardOpenPositionGesture()
    }
  }
}

export const movedNodeIds = new Set<string>()

export const clearMovedNodes = () => {
  movedNodeIds.clear()
}

export const moveNode = (
  diagramId: string,
  direction: 'up' | 'down' | 'left' | 'right',
  event?: KeyboardEvent | MouseEvent
) => {
  if (selectedNodeIdsRef.value.length === 0 || !getRenderData(diagramId)) return

  clearMovedNodes()

  let step = moveStep.value

  if (event) {
    if (event.shiftKey && event.altKey) {
      step *= 10
    } else if (event.shiftKey) {
      step *= 5
    } else if (event.altKey) {
      step *= 2
    }
  }

  let deltaX = 0
  let deltaY = 0

  switch (direction) {
    case 'up':
      deltaY = -step
      break
    case 'down':
      deltaY = step
      break
    case 'left':
      deltaX = -step
      break
    case 'right':
      deltaX = step
      break
  }

  moveSelectedNodeByDelta(diagramId, deltaX, deltaY, { gesture: true })
}

const paintMoveAffected = (diagramId: string, affectedIds: string[]) => {
  clearMovedNodes()
  for (const id of affectedIds) movedNodeIds.add(id)
  if (graphRenderer.value && affectedIds.length > 0) {
    updateActiveNodes(affectedIds)
  }
  const diagramData = getRenderData(diagramId)
  if (selectedNodeRef.value && diagramData?.allNodes.has(selectedNodeRef.value.id)) {
    const node = diagramData.allNodes.get(selectedNodeRef.value.id)!
    nodePositionRef.value.x = node.position.x
    nodePositionRef.value.y = node.position.y
  }
}

const applyGrabSessionToDelta = (targetDelta: { x: number; y: number }) => {
  const session = moveToolState.session
  const diagramData = session ? getRenderData(session.diagramId) : null
  if (!session || !diagramData) return

  const onBefore: BeforeLayoutMutate = session.growParents
    ? trackLayoutBeforeChange
    : trackPositionBeforeChange

  const affectedIds = applyAbsoluteMoveWithParentGrow(
    diagramData,
    targetDelta.x,
    targetDelta.y,
    session.seedStartLayouts,
    session.satelliteStartLayouts,
    session.cascadeStartLayouts,
    session.cascadePlan,
    session.growParents,
    onBefore
  )
  paintMoveAffected(session.diagramId, affectedIds)
  session.appliedDelta = { ...targetDelta }
}

export const moveSelectedNodeByDelta = (
  diagramId: string,
  deltaX: number,
  deltaY: number,
  options?: { gesture?: boolean }
) => {
  if (!getRenderData(diagramId) || selectedNodeIdsRef.value.length === 0) return
  if (deltaX === 0 && deltaY === 0) return

  // Modal grab session owns absolute apply + parent grow.
  if (moveToolState.session) {
    const session = moveToolState.session
    applyGrabSessionToDelta({
      x: session.appliedDelta.x + deltaX,
      y: session.appliedDelta.y + deltaY,
    })
    return
  }

  const historyLabel =
    selectedNodeIdsRef.value.length > 1
      ? `Move ${selectedNodeIdsRef.value.length} nodes`
      : 'Move nodes'

  const growParents = autoResizeParents.value
  const onBefore: BeforeLayoutMutate = growParents
    ? trackLayoutBeforeChange
    : trackPositionBeforeChange

  const applyMove = () => {
    const diagramData = getRenderData(diagramId)!
    const selectedIds = new Set(selectedNodeIdsRef.value)
    const operationIds = collectMoveOperationSeedIds(diagramId)

    if (options?.gesture && growParents) {
      const gestureOpen = isLayoutGestureOpen()
      if (!gestureOpen || !arrowMoveCascade || arrowMoveCascade.diagramId !== diagramId) {
        const { seedStartLayouts, satelliteStartLayouts } = captureMoveStartLayouts(
          diagramData,
          operationIds,
          selectedIds
        )
        arrowMoveCascade = {
          diagramId,
          growParents: true,
          seedStartLayouts,
          satelliteStartLayouts,
          cascadeStartLayouts: captureResizeCascadeBaselines(diagramData, operationIds),
          cascadePlan: buildResizeCascadePlan(diagramData, operationIds),
          totalDelta: { x: 0, y: 0 },
        }
      }
      arrowMoveCascade.totalDelta.x += deltaX
      arrowMoveCascade.totalDelta.y += deltaY
      const affectedIds = applyAbsoluteMoveWithParentGrow(
        diagramData,
        arrowMoveCascade.totalDelta.x,
        arrowMoveCascade.totalDelta.y,
        arrowMoveCascade.seedStartLayouts,
        arrowMoveCascade.satelliteStartLayouts,
        arrowMoveCascade.cascadeStartLayouts,
        arrowMoveCascade.cascadePlan,
        true,
        onBefore
      )
      paintMoveAffected(diagramId, affectedIds)
      return
    }

    if (options?.gesture && !growParents) {
      clearMovedNodes()
      for (const nodeId of selectedNodeIdsRef.value) {
        const node = diagramData.allNodes.get(nodeId)
        if (node) moveNodeAndDescendants(diagramId, node, deltaX, deltaY)
      }
      if (selectedNodeIdsRef.value.length === 1 && selectedNodeRef.value) {
        if (moveOutputs.value) {
          for (const outputNode of getAllOutputNodes(diagramId, selectedNodeRef.value)) {
            moveNodeAndDescendants(diagramId, outputNode, deltaX, deltaY)
          }
        }
        if (moveInputs.value) {
          for (const inputNode of getAllInputNodes(diagramId, selectedNodeRef.value)) {
            moveNodeAndDescendants(diagramId, inputNode, deltaX, deltaY)
          }
        }
      }
      if (graphRenderer.value && movedNodeIds.size > 0) {
        updateActiveNodes(Array.from(movedNodeIds))
      }
      if (selectedNodeRef.value) {
        nodePositionRef.value.x = selectedNodeRef.value.position.x
        nodePositionRef.value.y = selectedNodeRef.value.position.y
      }
      return
    }

    // One-shot (sidebar apply, etc.): move then grow from current seed footprints.
    const { seedStartLayouts, satelliteStartLayouts } = captureMoveStartLayouts(
      diagramData,
      operationIds,
      selectedIds
    )
    // Capture parent baselines BEFORE moving seeds.
    const cascadeStartLayouts = growParents
      ? captureResizeCascadeBaselines(diagramData, operationIds)
      : new Map<string, ResizeStartLayout>()
    const cascadePlan = growParents
      ? buildResizeCascadePlan(diagramData, operationIds)
      : []

    const affectedIds = applyAbsoluteMoveWithParentGrow(
      diagramData,
      deltaX,
      deltaY,
      seedStartLayouts,
      satelliteStartLayouts,
      cascadeStartLayouts,
      cascadePlan,
      growParents,
      onBefore
    )
    paintMoveAffected(diagramId, affectedIds)
  }

  if (options?.gesture) {
    if (!graphHistoryState.isApplying) {
      if (growParents) {
        if (!isLayoutGestureOpen()) {
          if (isPositionGestureOpen()) commitPositionCapture(diagramId)
          beginLayoutCapture(diagramId, historyLabel)
          clearArrowMoveCascade()
        }
      } else if (!isPositionGestureOpen()) {
        if (isLayoutGestureOpen()) commitLayoutCapture(diagramId)
        beginPositionCapture(diagramId, historyLabel)
        clearArrowMoveCascade()
      }
      applyMove()
      return
    }
    applyMove()
    return
  }

  clearArrowMoveCascade()
  if (growParents) {
    runWithLayoutHistory(diagramId, historyLabel, applyMove)
  } else {
    runWithPositionHistory(diagramId, historyLabel, applyMove)
  }
}

export const moveNodeAndDescendants = (
  diagramId: string,
  node: any,
  deltaX: number,
  deltaY: number,
  _includeDescendants = moveDescendants.value
) => {
  const diagramData = getRenderData(diagramId)
  if (!node || !diagramData) return
  if (node.id && movedNodeIds.has(node.id)) return

  trackPositionBeforeChange(node)

  node.position.x += deltaX
  node.position.y += deltaY
  node.bounds.x += deltaX
  node.bounds.y += deltaY

  if (node.id) {
    movedNodeIds.add(node.id)
  }

  if (diagramData.allNodes.has(node.id)) {
    const nodeInMap = diagramData.allNodes.get(node.id)
    if (nodeInMap) {
      nodeInMap.position = { ...node.position }
      nodeInMap.bounds = { ...node.bounds }
    }
  }
}

export const countDescendants = (node: any): number => {
  if (!node) return 0

  let count = 0
  forEachDirectChild(node, (child) => {
    count += 1 + countDescendants(child)
  })
  return count
}

export const getAllOutputNodes = (diagramId: string, node: any): any[] => {
  const diagramData = getRenderData(diagramId)
  if (!node || !diagramData) return []

  const outputNodes: any[] = []

  const connections = diagramData.connections
  const nodesMap = diagramData.allNodes
  const visited = new Set<string>()

  const collectOutputs = (currentNode: any) => {
    if (!currentNode || visited.has(currentNode.id)) return
    visited.add(currentNode.id)

    const outgoing = connections.filter((conn) => conn.from === currentNode.id)

    for (const conn of outgoing) {
      const outputNode = nodesMap.get(conn.to)
      if (outputNode && !visited.has(outputNode.id)) {
        outputNodes.push(outputNode)
        collectOutputs(outputNode)
      }
    }
  }

  const collectInputs = (currentNode: any) => {
    if (!currentNode) return

    const incoming = connections.filter((conn) => conn.to === currentNode.id)

    for (const conn of incoming) {
      const inputNode = nodesMap.get(conn.from)
      if (inputNode && !visited.has(inputNode.id)) {
        visited.add(inputNode.id)
        outputNodes.push(inputNode)
        collectInputs(inputNode)
      }
    }
  }

  collectOutputs(node)

  const collectedOutputs = [...outputNodes]
  for (const outputNode of collectedOutputs) {
    collectInputs(outputNode)
  }

  return outputNodes
}

export const getAllInputNodes = (diagramId: string, node: any): any[] => {
  const diagramData = getRenderData(diagramId)
  if (!node || !diagramData) return []

  const inputNodes: any[] = []
  const connections = diagramData.connections
  const nodesMap = diagramData.allNodes
  const visited = new Set<string>()

  const collectInputs = (currentNode: any) => {
    if (!currentNode || visited.has(currentNode.id)) return
    visited.add(currentNode.id)

    const incoming = connections.filter((conn) => conn.to === currentNode.id)

    for (const conn of incoming) {
      const inputNode = nodesMap.get(conn.from)
      if (inputNode && !visited.has(inputNode.id)) {
        inputNodes.push(inputNode)
        collectInputs(inputNode)
      }
    }
  }

  collectInputs(node)

  return inputNodes
}

export const applyAxisLock = (delta: { x: number; y: number }, lock: GrabAxisLock) => {
  if (lock === 'x') return { x: delta.x, y: 0 }
  if (lock === 'y') return { x: 0, y: delta.y }
  return delta
}

export const syncGrabMoveToTargetDelta = (targetDelta: { x: number; y: number }) => {
  const session = moveToolState.session
  if (!session) return
  const locked = applyAxisLock(targetDelta, session.axisLock)
  const target = {
    x: locked.x + session.keyboardOffset.x,
    y: locked.y + session.keyboardOffset.y,
  }
  if (target.x === session.appliedDelta.x && target.y === session.appliedDelta.y) return
  applyGrabSessionToDelta(target)
}

export const updateGrabMoveFromClient = (clientX: number, clientY: number) => {
  const session = moveToolState.session
  const active = getActiveDiagramRenderer()
  if (!session || !active) return
  const world = active.clientPosToWorldPos(clientX, clientY)
  if (!world) return
  syncGrabMoveToTargetDelta({
    x: world.x - session.startWorld.x,
    y: world.y - session.startWorld.y,
  })
}

export const resolveNudgeDelta = (
  direction: 'up' | 'down' | 'left' | 'right',
  event?: KeyboardEvent | MouseEvent
) => {
  let step = moveStep.value
  if (event) {
    if (event.shiftKey && event.altKey) step *= 10
    else if (event.shiftKey) step *= 5
    else if (event.altKey) step *= 2
  }
  switch (direction) {
    case 'up':
      return { x: 0, y: -step }
    case 'down':
      return { x: 0, y: step }
    case 'left':
      return { x: -step, y: 0 }
    case 'right':
      return { x: step, y: 0 }
  }
}

export const nudgeSelection = (
  direction: 'up' | 'down' | 'left' | 'right',
  event?: KeyboardEvent | MouseEvent
) => {
  const session = moveToolState.session
  if (!session) {
    const key =
      direction === 'up'
        ? 'ArrowUp'
        : direction === 'down'
          ? 'ArrowDown'
          : direction === 'left'
            ? 'ArrowLeft'
            : 'ArrowRight'
    pressedArrowKeys.add(key)
    moveNode(requireActiveDiagramId(), direction, event)
    return
  }

  const raw = resolveNudgeDelta(direction, event)
  const locked = applyAxisLock(raw, session.axisLock)
  if (locked.x === 0 && locked.y === 0) return

  session.keyboardOffset.x += locked.x
  session.keyboardOffset.y += locked.y
  applyGrabSessionToDelta({
    x: session.appliedDelta.x + locked.x,
    y: session.appliedDelta.y + locked.y,
  })
}

export const beginGrabMove = () => {
  if (!commandEnabled('grabMove.begin')) return
  const activeDiagramRenderer = getActiveDiagramRenderer()
  let diagramId: string
  try {
    diagramId = requireActiveDiagramId()
  } catch {
    return
  }
  if (!getRenderData(diagramId) || !activeDiagramRenderer || selectedNodeIdsRef.value.length === 0)
    return
  if (moveToolState.session) return
  if (resizeToolState.session) {
    suppressModalGestureRestore.value = true
    cancelResize()
    if (activeToolsRegistry.resize) {
      toolManager.deactivateTool('resize')
    }
    suppressModalGestureRestore.value = false
  }

  if (isPositionGestureOpen()) {
    commitPositionCapture(diagramId)
  }
  if (isLayoutGestureOpen()) {
    commitLayoutCapture(diagramId)
  }
  pressedArrowKeys.clear()
  clearArrowMoveCascade()

  const diagramData = getRenderData(diagramId)!
  const world =
    activeDiagramRenderer.clientPosToWorldPos(lastPointerClient.x, lastPointerClient.y) ??
    activeDiagramRenderer.getViewportCenter()

  const historyLabel =
    selectedNodeIdsRef.value.length > 1
      ? `Move ${selectedNodeIdsRef.value.length} nodes`
      : 'Move nodes'

  const growParents = autoResizeParents.value
  const selectedIds = new Set(selectedNodeIdsRef.value)
  const operationIds = collectMoveOperationSeedIds(diagramId)
  const { seedStartLayouts, satelliteStartLayouts } = captureMoveStartLayouts(
    diagramData,
    operationIds,
    selectedIds
  )
  if (seedStartLayouts.size === 0) return

  if (growParents) {
    beginLayoutCapture(diagramId, historyLabel)
  } else {
    beginPositionCapture(diagramId, historyLabel)
  }

  moveToolState.session = {
    diagramId,
    startWorld: { ...world },
    appliedDelta: { x: 0, y: 0 },
    keyboardOffset: { x: 0, y: 0 },
    axisLock: 'none',
    growParents,
    seedStartLayouts,
    satelliteStartLayouts,
    cascadeStartLayouts: growParents
      ? captureResizeCascadeBaselines(diagramData, operationIds)
      : new Map(),
    cascadePlan: growParents ? buildResizeCascadePlan(diagramData, operationIds) : [],
  }
  beginModalGestureTool('move')
  attachModalPointerListeners()
  activeDiagramRenderer.setCanvasCursor('move')
  requireHost().graphCanvas.value?.focus({ preventScroll: true })
  requireHost().updateGraphInteractionGate()
}

export const confirmGrabMove = () => {
  const session = moveToolState.session
  if (!session) return
  const diagramId = session.diagramId
  const growParents = session.growParents
  moveToolState.session = null
  clearArrowMoveCascade()
  if (!resizeToolState.session) detachModalPointerListeners()
  getActiveDiagramRenderer()?.setCanvasCursor('default')
  if (growParents) commitLayoutCapture(diagramId)
  else commitPositionCapture(diagramId)
  requireHost().updateGraphInteractionGate()
  if (modalGestureReplacedFocus.value) {
    toolManager.deactivateTool('move')
  }
}

export const cancelGrabMove = () => {
  const session = moveToolState.session
  if (!session) return
  const diagramId = session.diagramId
  const growParents = session.growParents
  moveToolState.session = null
  clearArrowMoveCascade()
  if (!resizeToolState.session) detachModalPointerListeners()
  getActiveDiagramRenderer()?.setCanvasCursor('default')
  if (growParents) cancelLayoutCapture(diagramId)
  else cancelPositionCapture(diagramId)
  requireHost().updateGraphInteractionGate()
  if (modalGestureReplacedFocus.value && !suppressModalGestureRestore.value) {
    toolManager.deactivateTool('move')
  }
}

export const setGrabAxisLock = (axis: 'x' | 'y') => {
  const session = moveToolState.session
  if (!session) return
  session.axisLock = session.axisLock === axis ? 'none' : axis
  updateGrabMoveFromClient(lastPointerClient.x, lastPointerClient.y)
}

onToolDeactivate('move', () => {
  const session = moveToolState.session
  if (session) {
    const diagramId = session.diagramId
    const growParents = session.growParents
    moveToolState.session = null
    clearArrowMoveCascade()
    if (!resizeToolState.session) detachModalPointerListeners()
    getActiveDiagramRenderer()?.setCanvasCursor('default')
    if (growParents) cancelLayoutCapture(diagramId)
    else cancelPositionCapture(diagramId)
    requireHost().updateGraphInteractionGate()
  }
  restoreToolAfterModalGesture()
})

export function clearGrabAxisLock() {
  const session = moveToolState.session
  if (!session || session.axisLock === 'none') return
  session.axisLock = 'none'
  updateGrabMoveFromClient(lastPointerClient.x, lastPointerClient.y)
}

registerGrabModalApi({
  updateFromClient: updateGrabMoveFromClient,
  confirm: confirmGrabMove,
  cancel: cancelGrabMove,
})
