import { computed } from 'vue'
import {
  beginLayoutCapture,
  cancelLayoutCapture,
  commitLayoutCapture,
  commitPositionCapture,
  isLayoutGestureOpen,
  isPositionGestureOpen,
  trackLayoutBeforeChange,
} from '../../stores/graphHistory'
import { activeDiagramId, getRenderData, requireActiveDiagramId } from '../../stores/graphProject'
import {
  nodePositionRef,
  nodeSizeRef,
  selectedNodeIdsRef,
  selectedNodeRef,
} from '../../stores/graphSession'
import { getActiveDiagramRenderer } from '../../stores/diagramRenderers'
import {
  autoResizeParents,
  beginModalGestureTool,
  lastPointerClient,
  modalGestureReplacedFocus,
  pressedArrowKeys,
  suppressModalGestureRestore,
} from '../../stores/modalGestureUi'
import {
  activeToolsRegistry,
  onToolDeactivate,
  toolManager,
} from '../../stores/toolManager'
import {
  moveToolState,
  resizeToolState,
  type ResizeSideLock,
  type ResizeStartLayout,
} from '../../stores/tools'
import type { RenderData, RenderNode } from '../../utils/graph/diagramTypes'
import {
  applyResizeCascadePlan,
  applyResizeStartLayout,
  buildResizeCascadePlan,
  captureResizeCascadeBaselines,
  captureResizeStartLayout,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  restoreResizeCascadeBaselines,
} from '../../utils/graph/resizeCascade'
import {
  applyResizeLocksToLayout,
  getNodeResizeLocks,
  getSelectionResizeLocks,
} from '../../utils/graph/resizeLocks'
import { updateActiveNodes } from '../../stores/graphPaint'
import {
  attachModalPointerListeners,
  detachModalPointerListeners,
  registerResizeModalApi,
  requireHost,
  restoreToolAfterModalGesture,
} from './moveResizeShared'
import { cancelGrabMove } from './grabMove'
import { commandEnabled } from '../../stores/appContext'

export const computeResizedLayout = (
  start: ResizeStartLayout,
  mouseDx: number,
  mouseDy: number,
  sideLock: ResizeSideLock
): ResizeStartLayout => {
  const right = start.x + start.width
  const bottom = start.y + start.height
  let x = start.x
  let y = start.y
  let width = start.width
  let height = start.height

  const affectRight = sideLock === 'none' || sideLock === 'right'
  const affectLeft = sideLock === 'left'
  const affectBottom = sideLock === 'none' || sideLock === 'bottom'
  const affectTop = sideLock === 'top'

  if (affectRight) {
    width = Math.max(MIN_NODE_WIDTH, start.width + mouseDx)
  } else if (affectLeft) {
    width = Math.max(MIN_NODE_WIDTH, start.width - mouseDx)
    x = right - width
  }

  if (affectBottom) {
    height = Math.max(MIN_NODE_HEIGHT, start.height + mouseDy)
  } else if (affectTop) {
    height = Math.max(MIN_NODE_HEIGHT, start.height - mouseDy)
    y = bottom - height
  }

  return { x, y, width, height }
}

export const applyNodeResizeConstraints = (
  diagramData: RenderData,
  node: RenderNode,
  start: ResizeStartLayout,
  next: ResizeStartLayout,
): ResizeStartLayout => {
  const locks = getNodeResizeLocks(node, diagramData)
  return applyResizeLocksToLayout(locks, start, next, {
    minWidth: MIN_NODE_WIDTH,
    minHeight: MIN_NODE_HEIGHT,
  })
}

export const selectionResizeLocks = computed(() => {
  const diagramId = activeDiagramId.value
  const diagramData = diagramId ? getRenderData(diagramId) : null
  if (!diagramData || selectedNodeIdsRef.value.length === 0) {
    return { lockWidth: false, lockHeight: false, allLockHeight: false, perNode: [] }
  }
  const nodes = selectedNodeIdsRef.value
    .map((id) => diagramData.allNodes.get(id))
    .filter((n): n is RenderNode => !!n)
  return getSelectionResizeLocks(diagramData, nodes)
})

export const applyResizeFromMouseDelta = (mouseDx: number, mouseDy: number) => {
  const session = resizeToolState.session
  if (!session) return
  const diagramData = getRenderData(session.diagramId)
  if (!diagramData) return

  restoreResizeCascadeBaselines(diagramData, session.cascadeStartLayouts)

  const affectedIds = new Set<string>()
  const cascadeOptions = {
    growParents: autoResizeParents.value,
    // Move/resize: grow parents only (union bbox of operation seeds); no neighbour push.
    moveParentNeighbours: false,
    onBeforeLayoutMutate: trackLayoutBeforeChange,
  }

  for (const [nodeId, start] of session.startLayouts) {
    const node = diagramData.allNodes.get(nodeId)
    if (!node) continue
    trackLayoutBeforeChange(node)

    const next = applyNodeResizeConstraints(
      diagramData,
      node,
      start,
      computeResizedLayout(start, mouseDx, mouseDy, session.sideLock)
    )
    if (session.sideLock === 'left') {
      next.x = start.x + start.width - next.width
    }
    if (session.sideLock === 'top' && !getNodeResizeLocks(node, diagramData).lockHeight) {
      next.y = start.y + start.height - next.height
    }
    applyResizeStartLayout(node, next)
    affectedIds.add(nodeId)
  }

  const cascade = applyResizeCascadePlan(
    diagramData,
    session.cascadePlan,
    session.cascadeStartLayouts,
    cascadeOptions
  )
  cascade.affectedIds.forEach((id) => affectedIds.add(id))

  if (affectedIds.size > 0) {
    updateActiveNodes(Array.from(affectedIds))
  }

  if (selectedNodeRef.value && diagramData.allNodes.has(selectedNodeRef.value.id)) {
    const node = diagramData.allNodes.get(selectedNodeRef.value.id)!
    nodePositionRef.value = { ...node.position }
    nodeSizeRef.value = { ...node.size }
  }
}

export const updateResizeFromClient = (clientX: number, clientY: number) => {
  const session = resizeToolState.session
  const active = getActiveDiagramRenderer()
  if (!session || !active) return
  const world = active.clientPosToWorldPos(clientX, clientY)
  if (!world) return
  applyResizeFromMouseDelta(world.x - session.startWorld.x, world.y - session.startWorld.y)
}

let resizeRafId = 0
const pendingResizeClient = { x: 0, y: 0 }
export const scheduleResizeFromClient = (clientX: number, clientY: number) => {
  pendingResizeClient.x = clientX
  pendingResizeClient.y = clientY
  if (resizeRafId) return
  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = 0
    if (!resizeToolState.session) return
    updateResizeFromClient(pendingResizeClient.x, pendingResizeClient.y)
  })
}

export const flushScheduledResize = () => {
  if (!resizeRafId) return
  cancelAnimationFrame(resizeRafId)
  resizeRafId = 0
  if (!resizeToolState.session) return
  updateResizeFromClient(pendingResizeClient.x, pendingResizeClient.y)
}

export const beginResize = () => {
  if (!commandEnabled('resize.begin')) return
  const active = getActiveDiagramRenderer()
  let diagramId: string
  try {
    diagramId = requireActiveDiagramId()
  } catch {
    return
  }
  const diagramData = getRenderData(diagramId)
  if (!diagramData || !active || selectedNodeIdsRef.value.length === 0) return
  if (resizeToolState.session) return
  if (moveToolState.session) {
    suppressModalGestureRestore.value = true
    cancelGrabMove()
    if (activeToolsRegistry.move) {
      toolManager.deactivateTool('move')
    }
    suppressModalGestureRestore.value = false
  }

  if (isLayoutGestureOpen()) {
    commitLayoutCapture(diagramId)
  }
  if (isPositionGestureOpen()) {
    commitPositionCapture(diagramId)
  }
  pressedArrowKeys.clear()

  const world =
    active.clientPosToWorldPos(lastPointerClient.x, lastPointerClient.y) ??
    active.getViewportCenter()

  const startLayouts = new Map<string, ResizeStartLayout>()
  for (const nodeId of selectedNodeIdsRef.value) {
    const node = diagramData.allNodes.get(nodeId)
    if (!node) continue
    startLayouts.set(nodeId, captureResizeStartLayout(node))
  }
  if (startLayouts.size === 0) return

  const cascadeStartLayouts = captureResizeCascadeBaselines(diagramData, startLayouts.keys())
  const cascadePlan = buildResizeCascadePlan(diagramData, startLayouts.keys())

  const historyLabel =
    selectedNodeIdsRef.value.length > 1
      ? `Resize ${selectedNodeIdsRef.value.length} nodes`
      : 'Resize node'

  beginLayoutCapture(diagramId, historyLabel)
  resizeToolState.session = {
    diagramId,
    startWorld: { ...world },
    sideLock: 'none',
    startLayouts,
    cascadeStartLayouts,
    cascadePlan,
  }
  beginModalGestureTool('resize')
  attachModalPointerListeners()
  active.setCanvasCursor(selectionResizeLocks.value.allLockHeight ? 'ew-resize' : 'nwse-resize')
  requireHost().graphCanvas.value?.focus({ preventScroll: true })
  requireHost().updateGraphInteractionGate()
}

export const confirmResize = () => {
  const session = resizeToolState.session
  if (!session) return
  const diagramId = session.diagramId
  flushScheduledResize()
  resizeToolState.session = null
  if (!moveToolState.session) detachModalPointerListeners()
  getActiveDiagramRenderer()?.setCanvasCursor('default')
  commitLayoutCapture(diagramId)
  requireHost().updateGraphInteractionGate()
  if (modalGestureReplacedFocus.value) {
    toolManager.deactivateTool('resize')
  }
}

export const cancelResize = () => {
  const session = resizeToolState.session
  if (!session) return
  const diagramId = session.diagramId
  if (resizeRafId) {
    cancelAnimationFrame(resizeRafId)
    resizeRafId = 0
  }
  resizeToolState.session = null
  if (!moveToolState.session) detachModalPointerListeners()
  getActiveDiagramRenderer()?.setCanvasCursor('default')
  cancelLayoutCapture(diagramId)
  requireHost().updateGraphInteractionGate()
  if (modalGestureReplacedFocus.value && !suppressModalGestureRestore.value) {
    toolManager.deactivateTool('resize')
  }
}

export const setResizeSideLock = (side: Exclude<ResizeSideLock, 'none'>) => {
  const session = resizeToolState.session
  if (!session) return
  session.sideLock = session.sideLock === side ? 'none' : side
  updateResizeFromClient(lastPointerClient.x, lastPointerClient.y)
}

export const clearResizeSideLock = () => {
  const session = resizeToolState.session
  if (!session || session.sideLock === 'none') return
  session.sideLock = 'none'
  updateResizeFromClient(lastPointerClient.x, lastPointerClient.y)
}

onToolDeactivate('resize', () => {
  const session = resizeToolState.session
  if (session) {
    const diagramId = session.diagramId
    if (resizeRafId) {
      cancelAnimationFrame(resizeRafId)
      resizeRafId = 0
    }
    resizeToolState.session = null
    if (!moveToolState.session) detachModalPointerListeners()
    getActiveDiagramRenderer()?.setCanvasCursor('default')
    cancelLayoutCapture(diagramId)
    requireHost().updateGraphInteractionGate()
  }
  restoreToolAfterModalGesture()
})

registerResizeModalApi({
  scheduleFromClient: scheduleResizeFromClient,
  confirm: confirmResize,
  cancel: cancelResize,
})
