import { getConnectionKey } from '../utils/graph/diagramModel'
import { DIAGRAM_CONNECTION_TYPE_INPUT } from '../utils/graph/diagramConnectionTypes'
import type { DiagramConnection } from '../utils/graph/diagramTypes'
import { canConnectByPinType } from '../utils/graph/pinTyping'
import {
  applyConnectPlan,
  applyDisconnectPlan,
  type PinWireApplyResult,
} from '../utils/graph/pinWireActions'
import {
  applyWireRenderDelta,
  broadcastDeleteConnection,
  refreshPinFootprints,
} from './graphPaint'
import { getRenderData } from './graphProject'
import {
  bumpConnectionsRevision,
  ensureSelectionState,
} from './graphSession'

export const EMPTY_CONNECT_RESULT: PinWireApplyResult = {
  connection: null,
  removedConnections: [],
  rekeyedConnections: [],
  createdPortalIds: [],
  removedPortalIds: [],
  resolvedPinName: null,
  wasAppend: false,
  footprintDirtyBoxIds: [],
  demotedHandleIds: [],
}

/** Optional notify after wire mutate — bound from node-details to avoid cycles. */
let notifySelectedHandleDataChanged: () => void = () => {}

export function setWiringNotifySelectedHandleDataChanged(fn: () => void) {
  notifySelectedHandleDataChanged = fn
}

/** After wire topology change — bump derived connection panels (+ optional handle notify). */
export function afterWireChange(diagramId: string, options?: { notifyHandle?: boolean }) {
  bumpConnectionsRevision(diagramId)
  if (options?.notifyHandle) {
    notifySelectedHandleDataChanged()
  }
}

/**
 * Core connect — no history. History helpers import this; paintAndRecordConnect
 * lives in graphWireRecord to avoid graphHistory ↔ graphWiring cycles.
 */
export const createConnectionCore = (
  diagramId: string,
  fromId: string,
  toId: string,
  pinName: string
): PinWireApplyResult => {
  const renderData = getRenderData(diagramId)
  if (!renderData) return EMPTY_CONNECT_RESULT
  const fromNode = renderData.allNodes.get(fromId)
  const toNode = renderData.allNodes.get(toId)
  if (!fromNode || !toNode) return EMPTY_CONNECT_RESULT
  if (!canConnectByPinType(fromNode.type, toNode.type, pinName)) {
    return EMPTY_CONNECT_RESULT
  }
  const result = applyConnectPlan(renderData, fromId, toId, pinName)
  if (!result.connection) return result

  const dirty = [...result.footprintDirtyBoxIds]
  // Always refresh consumer chrome: nested socket link labels (MathExpression [i] set/—)
  // and scalar pin presence text are derived from handle Data, not only on append.
  if (!dirty.includes(toId)) dirty.push(toId)
  refreshPinFootprints(diagramId, dirty)
  bumpConnectionsRevision(diagramId)

  return result
}

export const createDiagramOnlyConnection = (
  diagramId: string,
  fromId: string,
  toId: string
): PinWireApplyResult => {
  const renderData = getRenderData(diagramId)
  if (!renderData) return EMPTY_CONNECT_RESULT
  const fromNode = renderData.allNodes.get(fromId)
  const toNode = renderData.allNodes.get(toId)
  if (!fromNode || !toNode) return EMPTY_CONNECT_RESULT
  const connection: DiagramConnection = { from: fromId, to: toId, type: DIAGRAM_CONNECTION_TYPE_INPUT }
  const key = getConnectionKey(connection)
  if (renderData.connections.some((c) => getConnectionKey(c) === key)) {
    return EMPTY_CONNECT_RESULT
  }
  renderData.connections.push(connection)
  bumpConnectionsRevision(diagramId)
  return {
    connection,
    removedConnections: [],
    rekeyedConnections: [],
    createdPortalIds: [],
    removedPortalIds: [],
    resolvedPinName: null,
    wasAppend: false,
    footprintDirtyBoxIds: [],
    demotedHandleIds: [],
  }
}

/** Core disconnect — no history. */
export const deleteConnectionCore = (diagramId: string, conn: DiagramConnection) => {
  const renderData = getRenderData(diagramId)
  if (!renderData) return

  const connKey = getConnectionKey(conn)

  if (!conn.pinName) {
    const idx = renderData.connections.findIndex((c) => getConnectionKey(c) === connKey)
    if (idx >= 0) {
      const removed = renderData.connections.splice(idx, 1)[0]
      if (removed) broadcastDeleteConnection(removed)
    }
  } else {
    const result = applyDisconnectPlan(renderData, conn)
    refreshPinFootprints(diagramId, result.footprintDirtyBoxIds)
    applyWireRenderDelta(result)
  }

  bumpConnectionsRevision(diagramId)

  const toBox = renderData.allNodes.get(conn.to)
  const selectedId = ensureSelectionState(diagramId).selectedNode?.id
  if (toBox && selectedId === toBox.id) {
    notifySelectedHandleDataChanged()
  }
}
