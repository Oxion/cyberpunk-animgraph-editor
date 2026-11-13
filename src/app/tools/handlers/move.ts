import { reactive, readonly } from 'vue'
import type { AppToolHandlers, SessionEndReason } from '@/core/tools'
import { registerToolHandlers } from '@/core/tools'
import {
  beginLayoutCapture,
  beginPositionCapture,
  cancelLayoutCapture,
  cancelPositionCapture,
  isLayoutGestureOpen,
  isPositionGestureOpen,
  commitLayoutCapture,
  commitPositionCapture,
  trackLayoutBeforeChange,
  trackPositionBeforeChange,
} from '@/stores/graphHistory'
import { getRenderData, requireActiveDiagramId } from '@/stores/graphProject'
import { selectedNodeIdsRef } from '@/stores/graphSession'
import { getActiveDiagramRenderer } from '@/stores/diagramRenderers'
import {
  autoResizeParents,
  lastPointerClient,
  moveStep,
} from '@/stores/modalGestureUi'
import type { GrabAxisLock, GrabMoveSession } from '@/stores/tools/move'
import {
  buildResizeCascadePlan,
  captureResizeCascadeBaselines,
  type BeforeLayoutMutate,
} from '@/utils/graph/resizeCascade'
import {
  applyAbsoluteMoveWithParentGrow,
  captureMoveStartLayouts,
  collectMoveOperationSeedIds,
  paintMoveAffected,
} from '@/composables/tools/grabMove'
import { requireHost } from '@/composables/tools/moveResizeShared'
import { endSession } from '@/app/tools/pipeline'
import { Tools } from '../ids'

const state = reactive({
  session: null as GrabMoveSession | null,
})

/** Deep-readonly view for UI / gates. Create/null only in this module. */
export const moveSessionState = readonly(state)

function applyAxisLock(delta: { x: number; y: number }, lock: GrabAxisLock) {
  if (lock === 'x') return { x: delta.x, y: 0 }
  if (lock === 'y') return { x: 0, y: delta.y }
  return delta
}

function resolveNudgeDelta(
  direction: 'up' | 'down' | 'left' | 'right',
  event?: KeyboardEvent | MouseEvent
) {
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

function applyGrabSessionToDelta(targetDelta: { x: number; y: number }): void {
  const session = state.session
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

function syncGrabMoveToTargetDelta(targetDelta: { x: number; y: number }): void {
  const session = state.session
  if (!session) return
  const locked = applyAxisLock(targetDelta, session.axisLock)
  const target = {
    x: locked.x + session.keyboardOffset.x,
    y: locked.y + session.keyboardOffset.y,
  }
  if (target.x === session.appliedDelta.x && target.y === session.appliedDelta.y) return
  applyGrabSessionToDelta(target)
}

function updateGrabMoveFromClient(clientX: number, clientY: number): void {
  const session = state.session
  const active = getActiveDiagramRenderer()
  if (!session || !active) return
  const world = active.clientPosToWorldPos(clientX, clientY)
  if (!world) return
  syncGrabMoveToTargetDelta({
    x: world.x - session.startWorld.x,
    y: world.y - session.startWorld.y,
  })
}

export function lockMoveAxis(axis: 'x' | 'y'): void {
  const session = state.session
  if (!session) return
  session.axisLock = (session.axisLock === axis ? 'none' : axis) as GrabAxisLock
  updateGrabMoveFromClient(lastPointerClient.x, lastPointerClient.y)
}

export function clearMoveAxisLock(): void {
  const session = state.session
  if (!session || session.axisLock === 'none') return
  session.axisLock = 'none'
  updateGrabMoveFromClient(lastPointerClient.x, lastPointerClient.y)
}

/** Nudge while move session is active — command decides when to call this. */
export function nudgeMoveSession(
  direction: 'up' | 'down' | 'left' | 'right',
  event?: KeyboardEvent | MouseEvent
): void {
  const session = state.session
  if (!session) return

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

function openMoveSession(): boolean {
  const activeDiagramRenderer = getActiveDiagramRenderer()
  let diagramId: string
  try {
    diagramId = requireActiveDiagramId()
  } catch {
    return false
  }
  if (!getRenderData(diagramId) || !activeDiagramRenderer || selectedNodeIdsRef.value.length === 0) {
    return false
  }

  if (isPositionGestureOpen()) {
    commitPositionCapture(diagramId)
  }
  if (isLayoutGestureOpen()) {
    commitLayoutCapture(diagramId)
  }
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
  if (seedStartLayouts.size === 0) return false

  if (growParents) {
    beginLayoutCapture(diagramId, historyLabel)
  } else {
    beginPositionCapture(diagramId, historyLabel)
  }

  state.session = {
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
  return true
}

const onMovePointerMove = (event: PointerEvent) => {
  updateGrabMoveFromClient(event.clientX, event.clientY)
}

const onMovePointerDown = (event: PointerEvent) => {
  if (event.button === 0) {
    event.preventDefault()
    event.stopPropagation()
    endSession(Tools.move, 'confirm')
    return
  }
  if (event.button === 2) {
    event.preventDefault()
    event.stopPropagation()
    endSession(Tools.move, 'cancel')
  }
}

const onMoveContextMenu = (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
}

function attachMoveSessionChrome(): void {
  document.addEventListener('pointermove', onMovePointerMove, true)
  document.addEventListener('pointerdown', onMovePointerDown, true)
  document.addEventListener('contextmenu', onMoveContextMenu, true)
  getActiveDiagramRenderer()?.setCanvasCursor('move')
  requireHost().graphCanvas.value?.focus({ preventScroll: true })
  requireHost().updateGraphInteractionGate()
}

function teardownMoveSession(reason: SessionEndReason): void {
  const session = state.session
  if (!session) return
  const diagramId = session.diagramId
  const growParents = session.growParents
  state.session = null
  document.removeEventListener('pointermove', onMovePointerMove, true)
  document.removeEventListener('pointerdown', onMovePointerDown, true)
  document.removeEventListener('contextmenu', onMoveContextMenu, true)
  getActiveDiagramRenderer()?.setCanvasCursor('default')
  if (reason === 'confirm') {
    if (growParents) commitLayoutCapture(diagramId)
    else commitPositionCapture(diagramId)
  } else {
    if (growParents) cancelLayoutCapture(diagramId)
    else cancelPositionCapture(diagramId)
  }
  requireHost().updateGraphInteractionGate()
}

const moveToolHandlers: AppToolHandlers = {
  onSessionStart: () => {
    if (!openMoveSession()) return false
    attachMoveSessionChrome()
  },
  onSessionEnd: (reason) => {
    teardownMoveSession(reason)
  },
}

export function registerMoveToolHandlers(): void {
  registerToolHandlers(Tools.move, moveToolHandlers)
}
