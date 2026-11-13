import { reactive, readonly } from 'vue'
import type { AppToolHandlers, SessionEndReason } from '@/core/tools'
import { registerToolHandlers } from '@/core/tools'
import {
  beginLayoutCapture,
  cancelLayoutCapture,
  commitLayoutCapture,
  commitPositionCapture,
  isLayoutGestureOpen,
  isPositionGestureOpen,
} from '@/stores/graphHistory'
import { getRenderData, requireActiveDiagramId } from '@/stores/graphProject'
import { selectedNodeIdsRef } from '@/stores/graphSession'
import { getActiveDiagramRenderer } from '@/stores/diagramRenderers'
import { lastPointerClient } from '@/stores/modalGestureUi'
import type { ResizeSession, ResizeSideLock, ResizeStartLayout } from '@/stores/tools/resize'
import {
  buildResizeCascadePlan,
  captureResizeCascadeBaselines,
  captureResizeStartLayout,
} from '@/utils/graph/resizeCascade'
import {
  applyResizeFromMouseDelta,
  selectionResizeLocks,
} from '@/composables/tools/resizeSession'
import { requireHost } from '@/composables/tools/moveResizeShared'
import { endSession } from '@/app/tools/pipeline'
import { Tools } from '../ids'

const state = reactive({
  session: null as ResizeSession | null,
})

/** Deep-readonly view for UI / gates. Create/null only in this module. */
export const resizeSessionState = readonly(state)

let resizeRafId = 0
const pendingResizeClient = { x: 0, y: 0 }

function updateResizeFromClient(clientX: number, clientY: number): void {
  const session = state.session
  const active = getActiveDiagramRenderer()
  if (!session || !active) return
  const world = active.clientPosToWorldPos(clientX, clientY)
  if (!world) return
  applyResizeFromMouseDelta(
    session,
    world.x - session.startWorld.x,
    world.y - session.startWorld.y
  )
}

function scheduleResizeFromClient(clientX: number, clientY: number): void {
  pendingResizeClient.x = clientX
  pendingResizeClient.y = clientY
  if (resizeRafId) return
  resizeRafId = requestAnimationFrame(() => {
    resizeRafId = 0
    if (!state.session) return
    updateResizeFromClient(pendingResizeClient.x, pendingResizeClient.y)
  })
}

function flushScheduledResize(): void {
  if (!resizeRafId) return
  cancelAnimationFrame(resizeRafId)
  resizeRafId = 0
  if (!state.session) return
  updateResizeFromClient(pendingResizeClient.x, pendingResizeClient.y)
}

function cancelScheduledResize(): void {
  if (!resizeRafId) return
  cancelAnimationFrame(resizeRafId)
  resizeRafId = 0
}

export function lockResizeSide(side: Exclude<ResizeSideLock, 'none'>): void {
  const session = state.session
  if (!session) return
  session.sideLock = session.sideLock === side ? 'none' : side
  updateResizeFromClient(lastPointerClient.x, lastPointerClient.y)
}

export function clearResizeSideLock(): void {
  const session = state.session
  if (!session || session.sideLock === 'none') return
  session.sideLock = 'none'
  updateResizeFromClient(lastPointerClient.x, lastPointerClient.y)
}

function openResizeSession(): boolean {
  const active = getActiveDiagramRenderer()
  let diagramId: string
  try {
    diagramId = requireActiveDiagramId()
  } catch {
    return false
  }
  const diagramData = getRenderData(diagramId)
  if (!diagramData || !active || selectedNodeIdsRef.value.length === 0) return false

  if (isLayoutGestureOpen()) {
    commitLayoutCapture(diagramId)
  }
  if (isPositionGestureOpen()) {
    commitPositionCapture(diagramId)
  }
  const world =
    active.clientPosToWorldPos(lastPointerClient.x, lastPointerClient.y) ??
    active.getViewportCenter()

  const startLayouts = new Map<string, ResizeStartLayout>()
  for (const nodeId of selectedNodeIdsRef.value) {
    const node = diagramData.allNodes.get(nodeId)
    if (!node) continue
    startLayouts.set(nodeId, captureResizeStartLayout(node))
  }
  if (startLayouts.size === 0) return false

  const cascadeStartLayouts = captureResizeCascadeBaselines(diagramData, startLayouts.keys())
  const cascadePlan = buildResizeCascadePlan(diagramData, startLayouts.keys())

  const historyLabel =
    selectedNodeIdsRef.value.length > 1
      ? `Resize ${selectedNodeIdsRef.value.length} nodes`
      : 'Resize node'

  beginLayoutCapture(diagramId, historyLabel)
  state.session = {
    diagramId,
    startWorld: { ...world },
    sideLock: 'none',
    startLayouts,
    cascadeStartLayouts,
    cascadePlan,
  }
  return true
}

const onResizePointerMove = (event: PointerEvent) => {
  scheduleResizeFromClient(event.clientX, event.clientY)
}

const onResizePointerDown = (event: PointerEvent) => {
  if (event.button === 0) {
    event.preventDefault()
    event.stopPropagation()
    endSession(Tools.resize, 'confirm')
    return
  }
  if (event.button === 2) {
    event.preventDefault()
    event.stopPropagation()
    endSession(Tools.resize, 'cancel')
  }
}

const onResizeContextMenu = (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
}

function attachResizeSessionChrome(): void {
  document.addEventListener('pointermove', onResizePointerMove, true)
  document.addEventListener('pointerdown', onResizePointerDown, true)
  document.addEventListener('contextmenu', onResizeContextMenu, true)
  getActiveDiagramRenderer()?.setCanvasCursor(
    selectionResizeLocks.value.allLockHeight ? 'ew-resize' : 'nwse-resize'
  )
  requireHost().graphCanvas.value?.focus({ preventScroll: true })
  requireHost().updateGraphInteractionGate()
}

function teardownResizeSession(reason: SessionEndReason): void {
  const session = state.session
  if (!session) return
  const diagramId = session.diagramId
  if (reason === 'confirm') flushScheduledResize()
  else cancelScheduledResize()
  state.session = null
  document.removeEventListener('pointermove', onResizePointerMove, true)
  document.removeEventListener('pointerdown', onResizePointerDown, true)
  document.removeEventListener('contextmenu', onResizeContextMenu, true)
  getActiveDiagramRenderer()?.setCanvasCursor('default')
  if (reason === 'confirm') commitLayoutCapture(diagramId)
  else cancelLayoutCapture(diagramId)
  requireHost().updateGraphInteractionGate()
}

const resizeToolHandlers: AppToolHandlers = {
  onSessionStart: () => {
    if (!openResizeSession()) return false
    attachResizeSessionChrome()
  },
  onSessionEnd: (reason) => {
    teardownResizeSession(reason)
  },
}

export function registerResizeToolHandlers(): void {
  registerToolHandlers(Tools.resize, resizeToolHandlers)
}
