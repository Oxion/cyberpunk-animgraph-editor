import {
  flushOpenGestures,
  getHistoryForDiagram,
  graphHistoryState,
  handleDataRevision,
} from './graphHistory'
import {
  collectWireRenderers,
  refreshPinFootprints,
  reloadAllConnectionRenderers,
  updateGraphBounds,
} from './graphPaint'
import { getRenderData, requireActiveDiagramId } from './graphProject'
import {
  bumpConnectionsRevision,
  ensureSelectionState,
  refreshSelectionAfterNodeTreeChange,
} from './graphSession'
import {
  createApplyLayoutsCommand,
  createDeleteNodesCommand,
  createMoveSmStateCommand,
} from '../utils/graph/commands'
import {
  applyDeleteNodePlan,
  buildDeleteNodePlan,
  captureDeleteNodesSnapshot,
  type DeleteNodeDenialReason,
} from '../utils/graph/deleteNodePlan'
import {
  collectSmStatesGroupLayoutNodes,
  isSmStatesPropertyGroup,
  layoutStatesGroupWithPortals,
} from '../utils/graph/DiagramConversion'
import { pairLayoutChanges } from '../utils/graph/GraphHistory'
import {
  applyMoveSmState,
  captureLayouts,
  collectSmStateMoveLayoutNodes,
} from '../utils/graph/smStateArrayMove'
import {
  resolveLiveStateIndex,
  resolveMoveSmStateTarget,
} from '../utils/graph/smStateSlot'

export type GraphMutationsHost = {
  closeParallelBodiesScopedToDeleted: (deletedIds: ReadonlySet<string>) => void
}

let host: GraphMutationsHost | null = null
function requireHost(): GraphMutationsHost {
  if (!host) throw new Error('bindGraphMutations() must be called first')
  return host
}

let smStateMoveBusy = false
let smStatesGroupLayoutBusy = false

export const formatDeleteNodeDenial = (reasons: readonly DeleteNodeDenialReason[]): string => {
  const map: Record<DeleteNodeDenialReason, string> = {
    'not-found': 'Node not found',
    'root-forbidden': 'Cannot delete Root node',
    'portal-forbidden': 'Cannot delete portal nodes directly',
    'sm-shell-forbidden': 'Cannot delete SM shell wrapper',
  }
  return reasons.map((r) => map[r] ?? r).join('; ')
}

export type DeleteNodeResult =
  | { ok: true }
  | { ok: false; message: string }

export const paintAfterSmStateMove = (diagramId: string, dirtyIds: readonly string[]) => {
  const unique = [...new Set(dirtyIds)]
  if (unique.length === 0) return
  refreshPinFootprints(diagramId, unique)
  handleDataRevision.value++
  updateGraphBounds(diagramId)
}

/**
 * Move a State HandleRef inside SM.Data.states (any index). Callable from anywhere in App.
 */
export const moveSmStateToIndex = async (
  diagramId: string,
  stateId: string,
  toIndex: number
) => {
  const gd = getRenderData(diagramId)
  if (!gd || graphHistoryState.isApplying || smStateMoveBusy) return

  const resolved = resolveMoveSmStateTarget(gd, stateId, toIndex)
  if (!resolved.ok) return

  flushOpenGestures()
  smStateMoveBusy = true
  try {
    const layoutNodes = collectSmStateMoveLayoutNodes(resolved.target)
    const layoutsBefore = captureLayouts(layoutNodes)

    const applied = await applyMoveSmState(gd, stateId, toIndex)
    if (!applied.ok) return

    const layoutsAfter = captureLayouts(
      layoutNodes
        .map((node) => gd.allNodes.get(node.id))
        .filter((node): node is NonNullable<typeof node> => Boolean(node))
    )
    paintAfterSmStateMove(diagramId, applied.dirtyIds)

    if (graphHistoryState.isApplying) return
    getHistoryForDiagram(diagramId).pushCommand(
      createMoveSmStateCommand({
        label: `Move SM state ${applied.fromIndex} → ${applied.toIndex}`,
        animgraphBefore: applied.animgraphBefore,
        animgraphAfter: applied.animgraphAfter,
        layoutsBefore,
        layoutsAfter,
        dirtyIds: applied.dirtyIds,
      })
    )
  } finally {
    smStateMoveBusy = false
  }
}

export const moveSelectedSmStateByDelta = (diagramId: string, delta: -1 | 1) => {
  const gd = getRenderData(diagramId)
  const node = ensureSelectionState(diagramId).selectedNode
  if (!gd || !node) return
  const from = resolveLiveStateIndex(gd, node)
  if (from === null) return
  void moveSmStateToIndex(diagramId, node.id, from + delta)
}

/** Hotkey helper: uses activeDiagramId. */
export const moveActiveSelectedSmStateByDelta = (delta: -1 | 1) => {
  moveSelectedSmStateByDelta(requireActiveDiagramId(), delta)
}

export const canLayoutSmStatesGroup = (diagramId: string, groupId: string): boolean => {
  const gd = getRenderData(diagramId)
  if (!gd) return false
  const group = gd.allNodes.get(groupId)
  return isSmStatesPropertyGroup(group)
}

/**
 * ELK layout for SM `states` PropertyGroup children + fit group size.
 * Callable from anywhere; tracked via ApplyLayouts history.
 */
export const layoutSmStatesGroup = async (diagramId: string, groupId: string) => {
  const gd = getRenderData(diagramId)
  if (!gd || graphHistoryState.isApplying || smStatesGroupLayoutBusy) return

  const group = gd.allNodes.get(groupId)
  if (!isSmStatesPropertyGroup(group)) return

  flushOpenGestures()
  smStatesGroupLayoutBusy = true
  try {
    const layoutNodes = collectSmStatesGroupLayoutNodes(group)
    const layoutsBefore = captureLayouts(layoutNodes)

    const dirtyIds = await layoutStatesGroupWithPortals(gd, group)

    const layoutsAfter = captureLayouts(
      layoutNodes
        .map((node) => gd.allNodes.get(node.id))
        .filter((node): node is NonNullable<typeof node> => Boolean(node))
    )
    const { before, after } = pairLayoutChanges(layoutsBefore, layoutsAfter)
    paintAfterSmStateMove(diagramId, dirtyIds)

    if (graphHistoryState.isApplying || before.length === 0) return
    getHistoryForDiagram(diagramId).pushCommand(
      createApplyLayoutsCommand({
        label: 'Layout SM states group',
        before,
        after,
      })
    )
  } finally {
    smStatesGroupLayoutBusy = false
  }
}

export const layoutSelectedSmStatesGroup = (diagramId: string) => {
  const id = ensureSelectionState(diagramId).selectedNode?.id
  if (!id) return
  void layoutSmStatesGroup(diagramId, id)
}

/** Hotkey / menu helper: uses activeDiagramId. */
export const layoutActiveSelectedSmStatesGroup = () => {
  layoutSelectedSmStatesGroup(requireActiveDiagramId())
}

export const deleteNode = (diagramId: string, nodeId: string): DeleteNodeResult => {
  const id = nodeId.trim()
  const gd = getRenderData(diagramId)
  if (!id || !gd) return { ok: true }

  const node = gd.allNodes.get(id)
  if (!node) {
    return { ok: false, message: formatDeleteNodeDenial(['not-found']) }
  }

  const built = buildDeleteNodePlan(gd, id)
  if (!built.ok) {
    return { ok: false, message: formatDeleteNodeDenial(built.reasons) }
  }

  const history = getHistoryForDiagram(diagramId)
  const snapshot = !graphHistoryState.isApplying
    ? captureDeleteNodesSnapshot(gd, built.plan)
    : null

  const applied = applyDeleteNodePlan(gd, built.plan)
  if (!applied.ok) {
    return { ok: false, message: applied.message }
  }

  const deletedSet = new Set(applied.removedNodeIds)
  requireHost().closeParallelBodiesScopedToDeleted(deletedSet)

  collectWireRenderers().forEach((renderer) => {
    for (const removedId of applied.removedNodeIds) {
      renderer.removeNode(removedId)
    }
    for (const portalId of applied.removedPortalIds) {
      renderer.removeNode(portalId)
    }
  })

  refreshPinFootprints(diagramId, [
    ...applied.parentRefreshIds,
    ...applied.footprintDirtyBoxIds,
  ])
  reloadAllConnectionRenderers()
  updateGraphBounds(diagramId)
  refreshSelectionAfterNodeTreeChange(diagramId)
  bumpConnectionsRevision(diagramId)

  if (snapshot && !graphHistoryState.isApplying) {
    history.pushCommand(
      createDeleteNodesCommand({
        label: snapshot.label || applied.label,
        snapshot,
      })
    )
  }

  console.log(
    `Deleted node: ${applied.seedId} (${applied.removedNodeIds.length} boxes, ${applied.removedHandleIds.length} handles)`
  )
  return { ok: true }
}

export const deleteSelectedNode = (diagramId: string): DeleteNodeResult => {
  const id = ensureSelectionState(diagramId).selectedNode?.id
  if (!id) return { ok: true }
  return deleteNode(diagramId, id)
}

/** Hotkey helper: uses activeDiagramId. */
export const deleteActiveSelectedNode = (): DeleteNodeResult => {
  return deleteSelectedNode(requireActiveDiagramId())
}

export function bindGraphMutations(next: GraphMutationsHost) {
  host = next
}
