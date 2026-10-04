/**
 * Wire mutations that touch history. Imports cores from graphWiring and push*
 * from graphHistory — keeps createConnectionCore free of a history import cycle.
 */
import {
  captureConnectionDeleteSnapshot,
} from '../utils/graph/GraphHistory'
import type { DiagramConnection } from '../utils/graph/diagramTypes'
import { resolveLogicalConnFromGrab } from '../utils/graph/crossViewPinIds'
import type { PinWireApplyResult } from '../utils/graph/pinWireActions'
import {
  pushConnectionCreateHistory,
  pushConnectionDeleteHistory,
  graphHistoryState,
} from './graphHistory'
import {
  reloadAllConnectionRenderers,
  syncConnectionRenderAfterConnect,
} from './graphPaint'
import { getRenderData } from './graphProject'
import {
  afterWireChange,
  createConnectionCore,
  createDiagramOnlyConnection,
  deleteConnectionCore,
} from './graphWiring'

export const paintAndRecordConnect = (
  diagramId: string,
  result: PinWireApplyResult,
  toId: string
): boolean => {
  if (!result.connection) return false
  syncConnectionRenderAfterConnect(result, toId)
  pushConnectionCreateHistory(diagramId, result.connection)
  afterWireChange(diagramId)
  return true
}

export const handlePinConnect = (
  diagramId: string,
  payload: {
    fromNodeId: string
    toNodeId: string
    pinName: string
  }
) => {
  const result = createConnectionCore(
    diagramId,
    payload.fromNodeId,
    payload.toNodeId,
    payload.pinName
  )
  paintAndRecordConnect(diagramId, result, payload.toNodeId)
}

/** Drag connection end: drop on pin = reconnect; empty = delete. */
export const handlePinRewire = (
  diagramId: string,
  payload: {
    grabbedConnection: DiagramConnection
    hostNodeId: string
    pinName: string
    newToNodeId?: string
    newPinName?: string
  }
) => {
  const data = getRenderData(diagramId)
  if (!data) return

  const oldConn = resolveLogicalConnFromGrab(data, payload.grabbedConnection)

  if (!oldConn) {
    reloadAllConnectionRenderers()
    return
  }

  const same =
    payload.newToNodeId &&
    payload.newPinName &&
    payload.newToNodeId === payload.hostNodeId &&
    payload.newPinName === payload.pinName
  if (same) {
    reloadAllConnectionRenderers()
    return
  }

  deleteConnection(diagramId, oldConn)

  if (payload.newToNodeId && payload.newPinName) {
    const result = createConnectionCore(
      diagramId,
      oldConn.from,
      payload.newToNodeId,
      payload.newPinName
    )
    if (result.connection) {
      syncConnectionRenderAfterConnect(result, payload.newToNodeId)
      pushConnectionCreateHistory(diagramId, result.connection)
      afterWireChange(diagramId)
    }
  }
}

export type CreateConnectionResult =
  | { ok: true }
  | { ok: false; message: string }

export const createConnection = (
  diagramId: string,
  fromIdRaw: string,
  toIdRaw: string,
  pinNameRaw: string
): CreateConnectionResult => {
  const data = getRenderData(diagramId)
  if (!data) return { ok: true }

  const fromId = fromIdRaw.trim()
  const toId = toIdRaw.trim()
  const pinName = pinNameRaw.trim()
  if (!fromId || !toId) return { ok: true }
  if (fromId === toId) {
    return { ok: false, message: 'From and To must be different nodes' }
  }
  if (!data.allNodes.get(fromId)) {
    return { ok: false, message: `Node '${fromId}' not found` }
  }
  if (!data.allNodes.get(toId)) {
    return { ok: false, message: `Node '${toId}' not found` }
  }

  const result = pinName
    ? createConnectionCore(diagramId, fromId, toId, pinName)
    : createDiagramOnlyConnection(diagramId, fromId, toId)
  const created = result.connection
  if (!paintAndRecordConnect(diagramId, result, toId) || !created) {
    return {
      ok: false,
      message: pinName
        ? 'Failed to create connection — check pin name / target type / branch'
        : 'Failed to create diagram connection',
    }
  }

  console.log(
    `Created connection: ${created.from} -> ${created.to}${
      created.pinName ? ` (${created.pinName})` : ''
    }`
  )
  return { ok: true }
}

export const deleteConnection = (diagramId: string, conn: DiagramConnection) => {
  const data = getRenderData(diagramId)
  if (!data) return

  if (!conn.pinName) {
    deleteConnectionCore(diagramId, conn)
    return
  }

  const deleteSnapshot = !graphHistoryState.isApplying
    ? captureConnectionDeleteSnapshot(data, conn)
    : null
  const deletedConnection = { ...conn }

  deleteConnectionCore(diagramId, conn)

  if (deleteSnapshot) {
    pushConnectionDeleteHistory(diagramId, deletedConnection, deleteSnapshot)
  }
}
