import { getActiveGraphView } from './activeGraphView'
import {
  getActiveDiagramRenderer,
} from './diagramRenderers'
import {
  getHistoryForDiagram,
  graphHistoryState,
} from './graphHistory'
import {
  paintAddedNodes,
  syncConnectionRenderAfterConnect,
} from './graphPaint'
import {
  applyGraphSelection,
  ensureSelectionState,
} from './graphSession'
import { getRenderData } from './graphProject'
import { nodeClipboard } from './nodeClipboard'
import { resolvePasteTargetId } from './tools'
import type { DiagramConnection, RenderNode } from '../utils/graph/diagramTypes'
import {
  applyAddNodePlan,
  buildAddNodePlan,
  removeAddNodePlacements,
  revertHandleMutation,
  type HandleMutationSnapshot,
} from '../utils/graph/addNodePlan'
import { createAddNodesCommand } from '../utils/graph/commands'
import {
  pairParentLayoutChanges,
  snapshotParentLayoutsByIds,
  type AddedNodePlacement,
  type NodeLayoutState,
} from '../utils/graph/GraphHistory'
import { getWorldBounds } from '../utils/graph/DiagramGeometry'
import { allocateNextNumericId } from '../utils/graph/nodeAddBootstrap'
import {
  canAddNode,
  type AddNodeDenialReason,
  type AnimgraphAttachContext,
} from '../utils/graph/nodeAddRules'
import { DEFAULT_CHILD_SLOT } from '../utils/graph/nodeChildSlots'
import {
  applyPasteClipboardNode,
  computePasteAnchorWorld,
  isClipboardInternalItem,
  isClipboardSubtreeRoot,
  orderClipboardItemsForPaste,
  remapClipboardConnections,
  resolvePasteItemLocalPosition,
  resolvePasteParentNode,
  resolvePastePreferredSlotName,
  syncPastedSmStateMetadataForNodes,
} from '../utils/graph/pasteClipboard'
import {
  createConnectionCore,
  createDiagramOnlyConnection,
} from './graphWiring'

export type AddNewNodeResult =
  | { ok: true }
  | {
      ok: false
      reasons: AddNodeDenialReason[]
      diagramNodeType?: string
      message?: string
    }

export type PasteClipboardResult =
  | { ok: true }
  | { ok: false; message: string }

export const paintAddNodeResult = (
  diagramId: string,
  applied: {
    allAddedIds: string[]
    parentRefreshIds: string[]
    primaryNode: { id: string; type: string }
    handle?: {
      kind: 'slot' | 'floating'
      bootstrapHandles: Array<{ handleId: string }>
    }
  }
) => {
  const activeRenderer = getActiveDiagramRenderer()
  if (!activeRenderer || !getRenderData(diagramId)) return

  const orderedIds = [
    applied.primaryNode.id,
    ...applied.allAddedIds.filter((id) => id !== applied.primaryNode.id),
  ]
  paintAddedNodes(diagramId, {
    nodeIds: orderedIds,
    parentRefreshIds: applied.parentRefreshIds,
    activeOnly: true,
  })

  if (!applied.handle) {
    console.log(
      'Added new node: ' + applied.primaryNode.id + ' (' + applied.primaryNode.type + ')'
    )
    return
  }
  const kindLabel = applied.handle.kind === 'floating' ? 'floating handle' : 'handle'
  const bootstrapIds = applied.handle.bootstrapHandles.map((h) => h.handleId).join(',')
  const bootstrapSuffix = applied.handle.bootstrapHandles.length
    ? ' + bootstrap[' + bootstrapIds + ']'
    : ''
  console.log(
    'Added new node: ' +
      applied.primaryNode.id +
      ' (' +
      applied.primaryNode.type +
      ') + ' +
      kindLabel +
      bootstrapSuffix
  )
}

export const addNewNode = (
  diagramId: string,
  nodeId: string,
  nodeType: string,
  preferredSlotName?: string
): AddNewNodeResult => {
  const diagramData = getRenderData(diagramId)
  if (!diagramData) return { ok: false, reasons: [], message: 'No graph loaded' }

  const activeRenderer = getActiveDiagramRenderer()
  if (!activeRenderer) return { ok: false, reasons: [], message: 'No active renderer' }

  const diagramNodeId = nodeId.trim()
  const diagramNodeType = nodeType.trim()
  if (!diagramNodeId || !diagramNodeType) {
    return { ok: false, reasons: [], message: 'Missing id or type' }
  }

  if (diagramData.allNodes.has(diagramNodeId)) {
    return {
      ok: false,
      reasons: [],
      message: "Node '" + diagramNodeId + "' already exists",
    }
  }

  const selectedNode = ensureSelectionState(diagramId).selectedNode
  const gate = canAddNode(
    selectedNode,
    diagramNodeType,
    diagramData,
    getActiveGraphView(),
    preferredSlotName
  )
  if (!gate.ok) {
    return {
      ok: false,
      reasons: gate.reasons,
      diagramNodeType: gate.diagramNodeType,
    }
  }

  const plan = buildAddNodePlan({
    id: diagramNodeId,
    gate,
    viewportCenter: activeRenderer.getViewportCenter(),
    diagramData,
    preferredSlotName,
  })
  const parentLayoutsBeforeSnapshot = plan.diagramParent
    ? snapshotParentLayoutsByIds(diagramData, [plan.diagramParent.id])
    : null
  const applied = applyAddNodePlan(diagramData, plan)
  if (!applied.ok) {
    return { ok: false, reasons: [], message: applied.message }
  }

  paintAddNodeResult(diagramId, applied)

  if (!graphHistoryState.isApplying) {
    const parentLayoutPair = parentLayoutsBeforeSnapshot
      ? pairParentLayoutChanges(diagramData, parentLayoutsBeforeSnapshot)
      : { before: [], after: [] }
    getHistoryForDiagram(diagramId).pushCommand(
      createAddNodesCommand({
        label: applied.label,
        placements: applied.placements,
        handle: applied.handle,
        parentRefreshIds: applied.parentRefreshIds,
        parentLayoutsBefore:
          parentLayoutPair.before.length > 0 ? parentLayoutPair.before : undefined,
        parentLayoutsAfter:
          parentLayoutPair.after.length > 0 ? parentLayoutPair.after : undefined,
      })
    )
  }

  return { ok: true }
}

export const pasteClipboardNodes = (diagramId: string): PasteClipboardResult => {
  const clip = nodeClipboard.value
  const renderData = getRenderData(diagramId)
  const activeRenderer = getActiveDiagramRenderer()
  if (!clip || clip.items.length === 0 || !renderData || !activeRenderer) {
    return { ok: true }
  }

  const parentId = resolvePasteTargetId(ensureSelectionState(diagramId).selectedNode?.id ?? '')
  if (!parentId) {
    return { ok: false, message: 'Select a target node to paste into' }
  }
  const parentNode = renderData.allNodes.get(parentId)
  if (!parentNode) {
    return { ok: false, message: `Target node '${parentId}' not found` }
  }

  const ctx = {
    handlesRegistry: renderData.handlesRegistry,
    allNodes: renderData.allNodes,
  }
  const activeView = getActiveGraphView()

  const copiedSourceIds = new Set(clip.items.map((item) => item.sourceId))
  const orderedItems = orderClipboardItemsForPaste(clip.items)
  const anchorRoot =
    orderedItems.find((item) => isClipboardSubtreeRoot(item, copiedSourceIds)) ??
    orderedItems[0]
  if (!anchorRoot) return { ok: true }

  const viewportCenter = activeRenderer.getViewportCenter()
  const parentBounds = getWorldBounds(parentNode)
  const viewport = activeRenderer.getViewportBounds()
  const parentInView =
    !!parentBounds &&
    !!viewport &&
    !(
      parentBounds.x + parentBounds.width < viewport.left ||
      parentBounds.x > viewport.right ||
      parentBounds.y + parentBounds.height < viewport.top ||
      parentBounds.y > viewport.bottom
    )
  const pasteAnchor = computePasteAnchorWorld(
    viewportCenter,
    parentNode,
    parentInView
  )

  const reserved = new Set<string>()
  const idMap = new Map<string, string>()
  type AppliedOk = {
    ok: true
    primaryNode: RenderNode
    placements: AddedNodePlacement[]
    handle?: HandleMutationSnapshot
    parentRefreshIds: string[]
    allAddedIds: string[]
    label: string
  }
  const appliedList: AppliedOk[] = []
  const parentLayoutsBeforeSnapshot = new Map<string, NodeLayoutState>()

  const rollback = () => {
    for (const applied of [...appliedList].reverse()) {
      removeAddNodePlacements(renderData, applied.placements)
      if (applied.handle) revertHandleMutation(renderData, applied.handle)
    }
    appliedList.length = 0
  }

  graphHistoryState.isApplying = true
  try {
    for (const item of orderedItems) {
      const pasteParentNode = resolvePasteParentNode(
        renderData,
        item,
        parentNode,
        idMap,
        copiedSourceIds
      )
      if (!pasteParentNode) {
        rollback()
        return {
          ok: false,
          message: `Cannot paste '${item.diagramNodeType}': parent '${item.sourceParentId}' was not pasted yet`,
        }
      }
      const id = allocateNextNumericId(ctx, reserved)
      reserved.add(id)

      const isInternal = isClipboardInternalItem(item, copiedSourceIds)
      let diagramParent = pasteParentNode
      let parentSlot = item.parentSlot ?? DEFAULT_CHILD_SLOT
      let rootAnimgraphAttach: AnimgraphAttachContext | undefined

      if (!isInternal) {
        const preferredSlotName = resolvePastePreferredSlotName(item)
        const gate = canAddNode(
          pasteParentNode,
          item.diagramNodeType,
          ctx,
          activeView,
          preferredSlotName
        )
        if (!gate.ok) {
          rollback()
          return {
            ok: false,
            message: `Cannot paste '${item.diagramNodeType}':\n${gate.reasons.join('\n')}`,
          }
        }
        diagramParent = gate.place.diagramTarget ?? pasteParentNode
        parentSlot = gate.place.parentSlot ?? item.parentSlot ?? DEFAULT_CHILD_SLOT
        rootAnimgraphAttach = gate.animgraphAttach

        const pid = diagramParent.id
        if (!parentLayoutsBeforeSnapshot.has(pid)) {
          const layouts = snapshotParentLayoutsByIds(renderData, [pid])
          const captured = layouts.get(pid)
          if (captured) parentLayoutsBeforeSnapshot.set(pid, captured)
        }
      }

      const localPosition = resolvePasteItemLocalPosition(
        item,
        anchorRoot,
        pasteAnchor,
        diagramParent,
        copiedSourceIds
      )
      if (!localPosition) {
        rollback()
        return { ok: false, message: 'Cannot resolve paste position for parent' }
      }

      const applied = applyPasteClipboardNode(renderData, {
        id,
        item,
        diagramParent,
        parentSlot,
        localPosition,
        idMap,
        rootAnimgraphAttach,
      })
      if (!applied.ok) {
        rollback()
        return { ok: false, message: applied.message }
      }
      idMap.set(item.sourceId, applied.primaryNode.id)
      appliedList.push(applied)
      paintAddNodeResult(diagramId, applied)
    }

    syncPastedSmStateMetadataForNodes(
      renderData,
      appliedList.map((a) => a.primaryNode)
    )

    const remapped = remapClipboardConnections(clip.connections, idMap)
    const pastedConnections: DiagramConnection[] = []
    for (const conn of remapped) {
      const result = conn.pinName
        ? createConnectionCore(diagramId, conn.from, conn.to, conn.pinName)
        : createDiagramOnlyConnection(diagramId, conn.from, conn.to)
      if (!result.connection) continue
      syncConnectionRenderAfterConnect(result, conn.to)
      pastedConnections.push(result.connection)
    }

    const handles = appliedList
      .map((a) => a.handle)
      .filter((h): h is HandleMutationSnapshot => Boolean(h))
    const placements = appliedList.flatMap((a) => a.placements)
    const parentRefreshIds = [
      ...new Set(appliedList.flatMap((a) => a.parentRefreshIds)),
    ]
    const newIds = appliedList.map((a) => a.primaryNode.id)
    const parentLayoutPair = pairParentLayoutChanges(
      renderData,
      parentLayoutsBeforeSnapshot
    )

    getHistoryForDiagram(diagramId).pushCommand(
      createAddNodesCommand({
        label:
          appliedList.length === 1
            ? 'Paste node'
            : `Paste ${appliedList.length} nodes`,
        placements,
        handles,
        parentRefreshIds,
        parentLayoutsBefore:
          parentLayoutPair.before.length > 0 ? parentLayoutPair.before : undefined,
        parentLayoutsAfter:
          parentLayoutPair.after.length > 0 ? parentLayoutPair.after : undefined,
        connections: pastedConnections,
      })
    )

    if (newIds.length > 0) {
      applyGraphSelection(diagramId, newIds[0] ?? null, newIds)
    }
    return { ok: true }
  } finally {
    graphHistoryState.isApplying = false
  }
}
