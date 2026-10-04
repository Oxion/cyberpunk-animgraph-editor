import type { DiagramConnection, RenderData } from '../diagramTypes'
import { getConnectionKey } from '../diagramModel'
import { NodeDefinitionRegistry } from '../../NodeDefinition'
import { DIAGRAM_CONNECTION_TYPE_INPUT } from '../diagramConnectionTypes'
import { bridgePortalHostId, collectPortalChainForCrossView, invalidateCrossViewPortalPinIndex, isPortalHopConnection } from '../portalTopology'
import { ensureCrossViewPortalChain, findStateMachineDiagramRootAncestor, isDiagramPortalNode } from '../DiagramConversion'
import {
  clearFloatingMark,
  isFloatingHandle,
  promoteFloatingHandle,
  removeFloatingHandle,
} from '../floatingHandles'
import { getNodeInputHandler, parsePinName } from '../NodePins'
import { areSameDiagramBranch } from './branchGate'
import { classifyConnectWire } from './classify'
import {
  compileDisconnectActions,
  resolveAppendPinName,
} from './compileConnect'
import { removePortalBox } from './portalBoxes'
import { resolveConnectEndpoints } from './portalResolve'
import { isConsumerReachable } from './reachability'
import type { PinWireApplyResult } from './types'
import { demoteOrphanNodesToInitAfterDisconnect } from '../executionCore'

function pushConnection(renderData: RenderData, conn: DiagramConnection): void {
  const key = getConnectionKey(conn)
  if (renderData.connections.some((c) => getConnectionKey(c) === key)) {
    return
  }
  renderData.connections.push(conn)
  invalidateCrossViewPortalPinIndex(renderData)
}

function removeConnectionExact(
  renderData: RenderData,
  conn: DiagramConnection
): void {
  const key = getConnectionKey(conn)
  const idx = renderData.connections.findIndex((c) => getConnectionKey(c) === key)
  if (idx >= 0) renderData.connections.splice(idx, 1)
  invalidateCrossViewPortalPinIndex(renderData)
}

function clearPin(
  renderData: RenderData,
  ownerHandleId: string,
  ownerType: string,
  inputName: string,
  index: number
): { lengthChanged: boolean; linkCleared: boolean } {
  const handle = renderData.handlesRegistry.get(ownerHandleId)
  if (!handle) return { lengthChanged: false, linkCleared: false }
  const before = handle.Data?.[inputName]
  const beforeLen = Array.isArray(before) ? before.length : -1
  const handler = getNodeInputHandler(inputName, ownerType)
  let linkCleared = false
  if (handler.clearLink) {
    linkCleared = handler.clearLink(handle, index)
  } else {
    handler.delete(handle, index)
  }
  const remaining = handle.Data?.[inputName]
  if (Array.isArray(remaining) && 'numInputs' in handle.Data) {
    handle.Data.numInputs = remaining.length
  }
  const afterLen = Array.isArray(remaining) ? remaining.length : -1
  return { lengthChanged: beforeLen !== afterLen, linkCleared }
}

function markFootprintDirty(result: PinWireApplyResult, boxId: string | undefined | null) {
  if (!boxId) return
  if (!result.footprintDirtyBoxIds.includes(boxId)) {
    result.footprintDirtyBoxIds.push(boxId)
  }
}

function wireHandleRef(
  renderData: RenderData,
  ownerHandleId: string,
  ownerType: string,
  inputName: string,
  index: number,
  fromHandleId: string
): void {
  const handle = renderData.handlesRegistry.get(ownerHandleId)
  if (!handle) return
  const handler = getNodeInputHandler(inputName, ownerType)
  handler.set(handle, { HandleRefId: fromHandleId }, index)
}

function wireInlineEmbed(
  renderData: RenderData,
  ownerHandleId: string,
  ownerType: string,
  inputName: string,
  index: number,
  fromBoxId: string,
  fromHandleId: string,
  ownerBoxId: string
): void {
  const ownerHandle = renderData.handlesRegistry.get(ownerHandleId)
  const fromHandle = renderData.handlesRegistry.get(fromHandleId)
  const fromBox = renderData.allNodes.get(fromBoxId)
  const ownerBox = renderData.allNodes.get(ownerBoxId)
  if (!ownerHandle || !fromHandle?.Data || !fromBox || !ownerBox) return

  const embedded = structuredClone(fromHandle.Data) as Record<string, unknown>
  const handler = getNodeInputHandler(inputName, ownerType)
  handler.set(ownerHandle, embedded as never, index)

  fromBox.metadata = { ...fromBox.metadata, inline: true }
  delete fromBox.data?.originalNodeId
  const inlines = { ...(ownerBox.data?.inlines ?? {}) }
  const isArray = Array.isArray(ownerHandle.Data?.[inputName])
  if (isArray) {
    const prev = inlines[inputName]
    const list = Array.isArray(prev) ? [...prev] : []
    list[index] = fromBoxId
    inlines[inputName] = list
  } else {
    inlines[inputName] = fromBoxId
  }
  ownerBox.data = { ...ownerBox.data, inlines }

  removeFloatingHandle(renderData, fromHandleId, { deleteFromRegistry: true })
}

function promoteFrom(
  renderData: RenderData,
  handleId: string,
  appendNodesToInit: boolean
): void {
  if (!isFloatingHandle(renderData, handleId)) {
    clearFloatingMark(renderData, handleId)
  } else {
    promoteFloatingHandle(renderData, handleId)
  }
  if (!appendNodesToInit) return
  const nodesToInit = renderData.originalAnimgraph?.nodesToInit
  if (!nodesToInit) return
  if (
    nodesToInit.some(
      (r) =>
        typeof r === 'object' &&
        r &&
        'HandleRefId' in r &&
        String((r as { HandleRefId: string }).HandleRefId) === handleId
    )
  ) {
    return
  }
  nodesToInit.push({ HandleRefId: handleId })
}

function collectAutodetach(
  renderData: RenderData,
  fromId: string,
  diagramToId: string,
  logicalToId: string,
  pinName: string,
  exclusiveFrom: boolean
): DiagramConnection[] {
  const out: DiagramConnection[] = []
  for (const c of renderData.connections) {
    if (isPortalHopConnection(c)) {
      continue
    }
    if (
      (c.to === diagramToId || c.to === logicalToId) &&
      c.pinName === pinName
    ) {
      out.push(c)
      continue
    }
    if (exclusiveFrom && c.from === fromId) {
      out.push(c)
    }
  }
  return out
}

/**
 * Apply disconnect: clear logical pin, remove diagram edges, GC orphan portals.
 * Also reindexes sibling array pins like legacy deleteConnectionCore.
 */
export function applyDisconnectPlan(
  renderData: RenderData,
  conn: DiagramConnection
): PinWireApplyResult {
  const result: PinWireApplyResult = {
    connection: null,
    removedConnections: [],
    rekeyedConnections: [],
    createdPortalIds: [],
    removedPortalIds: [],
    resolvedPinName: conn.pinName ?? null,
    wasAppend: false,
    footprintDirtyBoxIds: [],
    demotedHandleIds: [],
  }

  const plan = compileDisconnectActions(renderData, conn)
  if (!plan.ok) return result

  const trackRemoved = (c: DiagramConnection) => {
    removeConnectionExact(renderData, c)
    result.removedConnections.push({ ...c })
  }

  let logicalToId = conn.to
  let logicalPin = conn.pinName ?? ''
  const toNode = renderData.allNodes.get(conn.to)

  if (conn.metadata?.originalTo) {
    logicalToId = conn.metadata.originalTo
    // pinName on cross-view edges is already the logical animgraph pin.
  } else if (toNode && isDiagramPortalNode(toNode)) {
    const originalTo = toNode.metadata?.originalTo
    if (typeof originalTo === 'string') logicalToId = originalTo
    if (typeof toNode.metadata?.pinName === 'string' && toNode.metadata.pinName) {
      logicalPin = toNode.metadata.pinName
    }
  }

  const logicalTo = renderData.allNodes.get(logicalToId)
  const ownerHandleId = String(
    logicalTo?.data?.originalNodeId ?? logicalToId
  )
  const ownerHandle = renderData.handlesRegistry.get(ownerHandleId)
  const ownerType = String(
    ownerHandle?.Data?.$type ?? logicalTo?.type ?? ''
  )
  const inputName = logicalPin.split('[')[0] ?? ''
  const inputIndex = parseInt(logicalPin.split('[')[1]?.split(']')[0] ?? '0', 10)

  if (ownerHandle && ownerType && inputName) {
    const pinClear = clearPin(
      renderData,
      ownerHandleId,
      ownerType,
      inputName,
      inputIndex
    )
    if (pinClear.lengthChanged || pinClear.linkCleared) {
      markFootprintDirty(result, logicalTo?.id)
    }
  }

  // Remove hop set + GC portals for this wire
  const fromNode = renderData.allNodes.get(conn.from)
  const portalsToMaybeRemove = collectPortalChainForCrossView(renderData, conn)
  if (toNode && isDiagramPortalNode(toNode)) portalsToMaybeRemove.add(toNode.id)
  if (fromNode && isDiagramPortalNode(fromNode)) portalsToMaybeRemove.add(fromNode.id)

  for (const c of [...renderData.connections]) {
    if (
      isPortalHopConnection(c) &&
      (portalsToMaybeRemove.has(c.from) || portalsToMaybeRemove.has(c.to))
    ) {
      trackRemoved(c)
    }
  }
  trackRemoved(conn)

  // Legacy: external→portal box
  for (const c of [...renderData.connections]) {
    if (c.from === conn.from && c.pinName === conn.pinName) {
      const t = renderData.allNodes.get(c.to)
      if (t && isDiagramPortalNode(t)) {
        portalsToMaybeRemove.add(t.id)
        trackRemoved(c)
      }
    }
  }

  for (const c of [...renderData.connections]) {
    if (isPortalHopConnection(c)) continue
    if (!c.metadata?.originalTo) continue
    const chain = collectPortalChainForCrossView(renderData, c)
    for (const id of portalsToMaybeRemove) {
      if (chain.has(id)) {
        trackRemoved(c)
        break
      }
    }
  }

  for (const portalId of portalsToMaybeRemove) {
    for (const c of [...renderData.connections]) {
      if (c.from === portalId || c.to === portalId) trackRemoved(c)
    }
  }

  for (const portalId of portalsToMaybeRemove) {
    const portal = renderData.allNodes.get(portalId)
    if (!portal || !isDiagramPortalNode(portal)) continue
    const hostId = bridgePortalHostId(portal)
    if (hostId) markFootprintDirty(result, hostId)
    const sm = findStateMachineDiagramRootAncestor(portal)
    if (sm) markFootprintDirty(result, sm.id)
    removePortalBox(renderData, portalId)
    result.removedPortalIds.push(portalId)
  }

  // Reindex higher array slots on same input (legacy behavior)
  if (logicalTo && inputName) {
    const sameInput = renderData.connections.filter(
      (c) => c.to === logicalTo.id && c.pinName?.startsWith(`${inputName}[`)
    )
    for (const c of sameInput) {
      if (!c.pinName) continue
      const pinIndex = parseInt(c.pinName.split('[')[1]?.split(']')[0] ?? '0', 10)
      if (pinIndex > inputIndex) {
        const oldKey = getConnectionKey(c)
        c.pinName = `${inputName}[${pinIndex - 1}]`
        result.rekeyedConnections.push({
          oldKey,
          connection: c,
        })
      }
    }
  }

  result.demotedHandleIds = demoteOrphanNodesToInitAfterDisconnect(
    renderData,
    conn,
    ownerHandleId,
    ownerType
  )

  result.connection = conn
  return result
}

export function applyConnectPlan(
  renderData: RenderData,
  fromId: string,
  toId: string,
  pinName: string
): PinWireApplyResult {
  const result: PinWireApplyResult = {
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

  const fromNode = renderData.allNodes.get(fromId)
  const toNodeUi = renderData.allNodes.get(toId)
  if (!fromNode || !toNodeUi) return result

  const wasAppend = parsePinName(pinName)?.append === true
  result.wasAppend = wasAppend

  const resolvedPin = resolveAppendPinName(renderData, toId, pinName)
  if (!resolvedPin) return result
  result.resolvedPinName = resolvedPin

  const endpoints = resolveConnectEndpoints(
    renderData,
    fromId,
    toId,
    resolvedPin
  )
  if (!endpoints) return result

  const {
    logicalFrom,
    logicalTo,
    logicalPinName,
    needsPortal,
    hostChain,
  } = endpoints

  if (
    !needsPortal &&
    !areSameDiagramBranch(logicalFrom, logicalTo, renderData)
  ) {
    console.warn('Cannot wire — different diagram branches', {
      fromId,
      toId,
      pinName: logicalPinName,
    })
    return result
  }

  const fromHandleId = String(
    logicalFrom.data?.originalNodeId ?? logicalFrom.id
  )
  const toHandleId = String(logicalTo.data?.originalNodeId ?? logicalTo.id)
  const fromHandle = renderData.handlesRegistry.get(fromHandleId)
  const toHandle = renderData.handlesRegistry.get(toHandleId)
  if (!fromHandle || !toHandle) return result

  const fromType = String(fromHandle.Data?.$type ?? logicalFrom.type)
  const ownerType = String(toHandle.Data?.$type ?? logicalTo.type)
  const inputName = logicalPinName.split('[')[0] ?? ''
  const index = parseInt(
    logicalPinName.split('[')[1]?.split(']')[0] ?? '0',
    10
  )
  if (!inputName) return result

  const wireKind = classifyConnectWire(fromType, ownerType, inputName)
  const exclusive = wireKind === 'exclusiveRef' || wireKind === 'inline'

  for (const old of collectAutodetach(
    renderData,
    fromId,
    endpoints.diagramToId,
    logicalTo.id,
    logicalPinName,
    exclusive
  )) {
    const detached = applyDisconnectPlan(renderData, old)
    result.removedConnections.push(...detached.removedConnections)
    result.rekeyedConnections.push(...detached.rekeyedConnections)
    result.removedPortalIds.push(...detached.removedPortalIds)
    for (const id of detached.footprintDirtyBoxIds) {
      markFootprintDirty(result, id)
    }
  }

  // Ensure portals — hops only (portal is always `from`). External edge → outermost host.
  let diagramSinkId = logicalTo.id
  let crossMeta: DiagramConnection['metadata'] | undefined

  if (needsPortal && hostChain.length > 0) {
    const beforeIds = new Set(renderData.allNodes.keys())
    const chain = ensureCrossViewPortalChain(
      renderData,
      logicalTo,
      fromId,
      logicalPinName,
      hostChain,
    )
    if (!chain) return result

    for (const id of renderData.allNodes.keys()) {
      if (!beforeIds.has(id)) result.createdPortalIds.push(id)
    }

    for (const hop of chain.hops) {
      pushConnection(renderData, hop)
    }

    diagramSinkId = chain.outerHost.id
    crossMeta = {
      originalFrom: fromId,
      originalTo: logicalTo.id,
    }
  }

  const consumerReachable = isConsumerReachable(renderData, toHandleId)
  if (wireKind === 'inline' && consumerReachable) {
    wireInlineEmbed(
      renderData,
      toHandleId,
      ownerType,
      inputName,
      index,
      logicalFrom.id,
      fromHandleId,
      logicalTo.id
    )
  } else {
    wireHandleRef(
      renderData,
      toHandleId,
      ownerType,
      inputName,
      index,
      fromHandleId
    )
  }

  const newConnection: DiagramConnection = {
    from: fromId,
    to: diagramSinkId,
    type: DIAGRAM_CONNECTION_TYPE_INPUT,
    pinName: logicalPinName,
    metadata: crossMeta,
  }
  pushConnection(renderData, newConnection)

  if (consumerReachable) {
    if (wireKind === 'sharedRef' || wireKind === 'exclusiveRef') {
      promoteFrom(
        renderData,
        fromHandleId,
        NodeDefinitionRegistry.isNodesToInitType(fromType)
      )
    }
  }

  if (wasAppend) {
    markFootprintDirty(result, logicalTo.id)
  }

  result.connection = newConnection
  return result
}
