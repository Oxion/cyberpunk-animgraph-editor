import type { AppToolHandlers, SessionEndReason } from '@/core/tools'
import { registerToolHandlers } from '@/core/tools'
import {
  beginLayoutCapture,
  beginPositionCapture,
  cancelLayoutCapture,
  cancelPositionCapture,
  commitLayoutCapture,
  commitPositionCapture,
  isLayoutGestureOpen,
  isPositionGestureOpen,
  trackLayoutBeforeChange,
  trackPositionBeforeChange,
} from '@/stores/graphHistory'
import { getRenderData, requireActiveDiagramId } from '@/stores/graphProject'
import { nodePositionRef, selectedNodeIdsRef, selectedNodeRef } from '@/stores/graphSession'
import { mainDiagramRenderer as graphRenderer } from '@/stores/diagramRenderers'
import {
  autoResizeParents,
  moveInputs,
  moveOutputs,
  moveStep,
} from '@/stores/modalGestureUi'
import { updateActiveNodes } from '@/stores/graphPaint'
import {
  buildResizeCascadePlan,
  captureResizeCascadeBaselines,
  type BeforeLayoutMutate,
} from '@/utils/graph/resizeCascade'
import type { ResizeAncestorPlan, ResizeStartLayout } from '@/stores/tools'
import {
  applyAbsoluteMoveWithParentGrow,
  captureMoveStartLayouts,
  clearMovedNodes,
  collectMoveOperationSeedIds,
  getAllInputNodes,
  getAllOutputNodes,
  movedNodeIds,
  moveNodeAndDescendants,
  paintMoveAffected,
} from '@/composables/tools/grabMove'
import { endSession, isToolInProgress } from '@/app/tools/pipeline'
import { Tools } from '../ids'

export type NodeNudgeDirection = 'up' | 'down' | 'left' | 'right'

type NudgeCascade = {
  diagramId: string
  seedStartLayouts: Map<string, ResizeStartLayout>
  satelliteStartLayouts: Map<string, ResizeStartLayout>
  cascadeStartLayouts: Map<string, ResizeStartLayout>
  cascadePlan: ResizeAncestorPlan[]
  totalDelta: { x: number; y: number }
}

const pressed = new Set<string>()
let cascade: NudgeCascade | null = null
let sessionDiagramId: string | null = null
let listening = false

function onDocumentKeyUp(event: KeyboardEvent): void {
  if (!pressed.has(event.code)) return
  pressed.delete(event.code)
  if (pressed.size > 0) return
  if (!isToolInProgress(Tools.nodeNudge)) {
    detachKeyUp()
    return
  }
  endSession(Tools.nodeNudge, 'confirm')
}

function attachKeyUp(): void {
  if (listening) return
  document.addEventListener('keyup', onDocumentKeyUp, true)
  listening = true
}

function detachKeyUp(): void {
  if (!listening) return
  document.removeEventListener('keyup', onDocumentKeyUp, true)
  listening = false
}

function resolveDelta(
  direction: NodeNudgeDirection,
  event?: KeyboardEvent | MouseEvent
): { x: number; y: number } {
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

function ensureCaptureOpen(diagramId: string): void {
  const historyLabel =
    selectedNodeIdsRef.value.length > 1
      ? `Move ${selectedNodeIdsRef.value.length} nodes`
      : 'Move nodes'
  const growParents = autoResizeParents.value
  if (growParents) {
    if (!isLayoutGestureOpen()) {
      if (isPositionGestureOpen()) commitPositionCapture(diagramId)
      beginLayoutCapture(diagramId, historyLabel)
      cascade = null
    }
  } else if (!isPositionGestureOpen()) {
    if (isLayoutGestureOpen()) commitLayoutCapture(diagramId)
    beginPositionCapture(diagramId, historyLabel)
    cascade = null
  }
}

function applyNudgeStep(diagramId: string, deltaX: number, deltaY: number): void {
  if (!getRenderData(diagramId) || selectedNodeIdsRef.value.length === 0) return
  if (deltaX === 0 && deltaY === 0) return

  const growParents = autoResizeParents.value
  const onBefore: BeforeLayoutMutate = growParents
    ? trackLayoutBeforeChange
    : trackPositionBeforeChange
  const diagramData = getRenderData(diagramId)!
  const selectedIds = new Set(selectedNodeIdsRef.value)
  const operationIds = collectMoveOperationSeedIds(diagramId)

  ensureCaptureOpen(diagramId)

  if (growParents) {
    if (!cascade || cascade.diagramId !== diagramId || !isLayoutGestureOpen()) {
      const { seedStartLayouts, satelliteStartLayouts } = captureMoveStartLayouts(
        diagramData,
        operationIds,
        selectedIds
      )
      cascade = {
        diagramId,
        seedStartLayouts,
        satelliteStartLayouts,
        cascadeStartLayouts: captureResizeCascadeBaselines(diagramData, operationIds),
        cascadePlan: buildResizeCascadePlan(diagramData, operationIds),
        totalDelta: { x: 0, y: 0 },
      }
    }
    cascade.totalDelta.x += deltaX
    cascade.totalDelta.y += deltaY
    const affectedIds = applyAbsoluteMoveWithParentGrow(
      diagramData,
      cascade.totalDelta.x,
      cascade.totalDelta.y,
      cascade.seedStartLayouts,
      cascade.satelliteStartLayouts,
      cascade.cascadeStartLayouts,
      cascade.cascadePlan,
      true,
      onBefore
    )
    paintMoveAffected(diagramId, affectedIds)
    return
  }

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
}

/**
 * Apply one nudge step while nodeNudge session is active.
 * Requires KeyboardEvent.code to track release.
 */
export function nudgeNodeSession(
  direction: NodeNudgeDirection,
  event?: KeyboardEvent
): void {
  if (!isToolInProgress(Tools.nodeNudge)) return
  if (!event?.code) return

  let diagramId: string
  try {
    diagramId = requireActiveDiagramId()
  } catch {
    return
  }
  if (!getRenderData(diagramId) || selectedNodeIdsRef.value.length === 0) return

  pressed.add(event.code)
  attachKeyUp()
  sessionDiagramId = diagramId

  const { x, y } = resolveDelta(direction, event)
  applyNudgeStep(diagramId, x, y)
}

function teardownSession(reason: SessionEndReason): void {
  const diagramId = sessionDiagramId
  pressed.clear()
  cascade = null
  sessionDiagramId = null
  detachKeyUp()
  if (!diagramId) return
  if (reason === 'confirm') {
    commitPositionCapture(diagramId)
    commitLayoutCapture(diagramId)
  } else {
    cancelPositionCapture(diagramId)
    cancelLayoutCapture(diagramId)
  }
}

const nodeNudgeToolHandlers: AppToolHandlers = {
  onSessionStart: () => {
    try {
      requireActiveDiagramId()
    } catch {
      return false
    }
    if (selectedNodeIdsRef.value.length === 0) return false
    attachKeyUp()
    return true
  },
  onSessionEnd: (reason) => {
    teardownSession(reason)
  },
}

export function registerNodeNudgeToolHandlers(): void {
  registerToolHandlers(Tools.nodeNudge, nodeNudgeToolHandlers)
}
