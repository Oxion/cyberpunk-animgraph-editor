import { computed } from 'vue'
import { trackLayoutBeforeChange } from '../../stores/graphHistory'
import { activeDiagramId, getRenderData } from '../../stores/graphProject'
import {
  nodePositionRef,
  nodeSizeRef,
  selectedNodeIdsRef,
  selectedNodeRef,
} from '../../stores/graphSession'
import { autoResizeParents } from '../../stores/modalGestureUi'
import type { ResizeSession, ResizeSideLock, ResizeStartLayout } from '../../stores/tools'
import type { RenderData, RenderNode } from '../../utils/graph/diagramTypes'
import {
  applyResizeCascadePlan,
  applyResizeStartLayout,
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

/** Pure session apply — caller owns session lifecycle. */
export const applyResizeFromMouseDelta = (
  session: ResizeSession,
  mouseDx: number,
  mouseDy: number
) => {
  const diagramData = getRenderData(session.diagramId)
  if (!diagramData) return

  restoreResizeCascadeBaselines(diagramData, session.cascadeStartLayouts)

  const affectedIds = new Set<string>()
  const cascadeOptions = {
    growParents: autoResizeParents.value,
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
  // Baselines restored every frame — refresh siblings that prior origin-shift compensated.
  for (const id of session.cascadeStartLayouts.keys()) affectedIds.add(id)

  if (affectedIds.size > 0) {
    updateActiveNodes(Array.from(affectedIds))
  }

  if (selectedNodeRef.value && diagramData.allNodes.has(selectedNodeRef.value.id)) {
    const node = diagramData.allNodes.get(selectedNodeRef.value.id)!
    nodePositionRef.value = { ...node.position }
    nodeSizeRef.value = { ...node.size }
  }
}
