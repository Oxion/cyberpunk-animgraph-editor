import type { DiagramConnection, RenderData } from '../diagramTypes'
import {
  applyHandleDataOverlay,
  removeAddNodePlacements,
  restoreAddNodePlacements,
  revertHandleMutation,
  replayHandleMutation,
  type HandleMutationSnapshot,
} from '../addNodePlan'
import { applyConnectPlan, applyDisconnectPlan } from '../pinWireActions'
import {
  replayDeleteNodes,
  restoreDeleteNodesSnapshot,
  getDeleteNodesRestoreNodeIds,
} from '../deleteNodePlan'
import { applyNodeLayouts, applyNodePositions } from '../GraphHistory'
import { restoreSmStateMoveAnimgraph } from '../smStateArrayMove'
import type { GraphCommand } from './types'

export interface CommandContext {
  getGraphData: () => RenderData | null
  /** Refresh renderer + selection UI after applying a layout/position patch. */
  onNodesPatched: (nodeIds: string[]) => void
  /** After removing nodes (undo add / redo delete): remove from renderers + refresh parents. */
  onNodesRemoved?: (payload: {
    nodeIds: string[]
    parentRefreshIds: string[]
  }) => void
  /** After restoring nodes (redo add / undo delete): include/add on renderers + refresh parents. */
  onNodesAdded?: (payload: {
    nodeIds: string[]
    parentRefreshIds: string[]
  }) => void
  /** After delete undo/redo: rebuild connection paint across views. */
  onConnectionsReload?: () => void
}

export function executeCommand(command: GraphCommand, ctx: CommandContext): void {
  applyCommandSide(command, ctx, 'redo')
}

export function undoCommand(command: GraphCommand, ctx: CommandContext): void {
  applyCommandSide(command, ctx, 'undo')
}

function applyCommandSide(
  command: GraphCommand,
  ctx: CommandContext,
  side: 'undo' | 'redo'
): void {
  const graphData = ctx.getGraphData()
  if (!graphData) return

  switch (command.type) {
    case 'MoveNodes': {
      const nodeIds = applyNodePositions(
        graphData,
        side === 'undo' ? command.before : command.after
      )
      ctx.onNodesPatched(nodeIds)
      break
    }
    case 'ApplyLayouts': {
      const nodeIds = applyNodeLayouts(
        graphData,
        side === 'undo' ? command.before : command.after
      )
      ctx.onNodesPatched(nodeIds)
      break
    }
    case 'AddNodes': {
      const handles = addNodeHandles(command.handle, command.handles)
      if (side === 'undo') {
        disconnectPastedConnections(graphData, command.connections)
        const nodeIds = command.placements.map((p) => p.node.id)
        removeAddNodePlacements(graphData, command.placements)
        for (const handle of [...handles].reverse()) {
          revertHandleMutation(graphData, handle)
        }
        const layoutPatchedIds = command.parentLayoutsBefore?.length
          ? applyNodeLayouts(graphData, command.parentLayoutsBefore)
          : []
        ctx.onNodesRemoved?.({
          nodeIds,
          parentRefreshIds: command.parentRefreshIds,
        })
        if (layoutPatchedIds.length > 0) ctx.onNodesPatched(layoutPatchedIds)
        if (command.connections?.length) ctx.onConnectionsReload?.()
      } else {
        for (const handle of handles) {
          const replay = replayHandleMutation(graphData, handle)
          if (!replay.ok) {
            console.error('Redo AddNodes handle failed:', replay.message)
            return
          }
          if (handle.dataOverlay) {
            applyHandleDataOverlay(graphData, handle.handleId, handle.dataOverlay)
          }
        }
        restoreAddNodePlacements(graphData, command.placements)
        replayPastedConnections(graphData, command.connections)
        const layoutPatchedIds = command.parentLayoutsAfter?.length
          ? applyNodeLayouts(graphData, command.parentLayoutsAfter)
          : []
        ctx.onNodesAdded?.({
          nodeIds: command.placements.map((p) => p.node.id),
          parentRefreshIds: command.parentRefreshIds,
        })
        if (layoutPatchedIds.length > 0) ctx.onNodesPatched(layoutPatchedIds)
        if (command.connections?.length) ctx.onConnectionsReload?.()
      }
      break
    }
    case 'DeleteNodes': {
      if (side === 'undo') {
        restoreDeleteNodesSnapshot(graphData, command.snapshot)
        ctx.onNodesAdded?.({
          nodeIds: getDeleteNodesRestoreNodeIds(command.snapshot),
          parentRefreshIds: command.snapshot.parentRefreshIds,
        })
        ctx.onConnectionsReload?.()
      } else {
        const result = replayDeleteNodes(graphData, command.snapshot)
        if (!result.ok) {
          console.error('Redo DeleteNodes failed:', result.message)
          return
        }
        ctx.onNodesRemoved?.({
          nodeIds: result.removedNodeIds,
          parentRefreshIds: result.parentRefreshIds,
        })
        ctx.onConnectionsReload?.()
      }
      break
    }
    case 'MoveSmState': {
      restoreSmStateMoveAnimgraph(
        graphData,
        side === 'undo' ? command.animgraphBefore : command.animgraphAfter
      )
      const nodeIds = applyNodeLayouts(
        graphData,
        side === 'undo' ? command.layoutsBefore : command.layoutsAfter
      )
      const dirty = [...new Set([...command.dirtyIds, ...nodeIds])]
      ctx.onNodesPatched(dirty)
      ctx.onConnectionsReload?.()
      break
    }
  }
}

function addNodeHandles(
  handle: HandleMutationSnapshot | undefined,
  handles: HandleMutationSnapshot[] | undefined
): HandleMutationSnapshot[] {
  if (handles && handles.length > 0) return handles
  return handle ? [handle] : []
}

function disconnectPastedConnections(
  graphData: RenderData,
  connections: DiagramConnection[] | undefined
): void {
  if (!connections?.length) return
  for (const conn of connections) {
    const live =
      graphData.connections.find(
        (c) =>
          c.from === conn.from &&
          c.to === conn.to &&
          (c.pinName ?? '') === (conn.pinName ?? '')
      ) ?? conn
    applyDisconnectPlan(graphData, live)
  }
}

function replayPastedConnections(
  graphData: RenderData,
  connections: DiagramConnection[] | undefined
): void {
  if (!connections?.length) return
  for (const conn of connections) {
    if (conn.pinName) {
      applyConnectPlan(graphData, conn.from, conn.to, conn.pinName)
      continue
    }
    const exists = graphData.connections.some(
      (c) => c.from === conn.from && c.to === conn.to && !c.pinName
    )
    if (!exists) graphData.connections.push({ ...conn })
  }
}
