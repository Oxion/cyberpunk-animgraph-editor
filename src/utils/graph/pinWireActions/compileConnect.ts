import type { DiagramConnection, RenderData } from '../diagramTypes'
import { getConnectionKey } from '../diagramModel'
import { getAnimTypeFields, isArrayFieldType } from '../../animTypes'
import { NodeDefinitionRegistry } from '../../NodeDefinition'
import { DIAGRAM_CONNECTION_TYPE_INPUT } from '../diagramConnectionTypes'
import { findOutboundPortalHop, isPortalHopConnection } from '../portalTopology'
import { isDiagramPortalNode } from '../DiagramConversion'
import {
  appendInputArraySlot,
  getInputSlotMeta,
  getNodeInputHandler,
  parsePinName,
} from '../NodePins'
import { areSameDiagramBranch } from './branchGate'
import { classifyConnectWire } from './classify'
import { resolveConnectEndpoints } from './portalResolve'
import { isConsumerReachable } from './reachability'
import type { PinWireAction, PinWirePlan } from './types'

function connectionEquals(a: DiagramConnection, b: DiagramConnection): boolean {
  return getConnectionKey(a) === getConnectionKey(b)
}

function findExclusiveFromConnections(
  renderData: RenderData,
  fromId: string,
  exceptPin?: { to: string; pinName: string }
): DiagramConnection[] {
  return renderData.connections.filter((c) => {
    if (c.from !== fromId) return false
    if (isPortalHopConnection(c)) return false
    if (exceptPin && c.to === exceptPin.to && c.pinName === exceptPin.pinName) return false
    return true
  })
}

function findPinOccupant(
  renderData: RenderData,
  toId: string,
  pinName: string
): DiagramConnection | undefined {
  return renderData.connections.find(
    (c) =>
      c.to === toId &&
      c.pinName === pinName &&
      !isPortalHopConnection(c)
  )
}

/**
 * Build connect action list. Returns deny plan when branch gate fails.
 */
export function compileConnectActions(
  renderData: RenderData,
  fromId: string,
  toId: string,
  pinName: string
): PinWirePlan {
  const fromNode = renderData.allNodes.get(fromId)
  const toNode = renderData.allNodes.get(toId)
  if (!fromNode || !toNode) {
    return { ok: false, reason: 'from/to node missing' }
  }

  let resolvedPinName = pinName
  const actions: PinWireAction[] = []

  // Append handled at apply time (mutates handle); compile uses resolved name after apply prep.
  // For compile we only plan against non-append or post-append name passed in.

  const endpoints = resolveConnectEndpoints(
    renderData,
    fromId,
    toId,
    resolvedPinName
  )
  if (!endpoints) {
    return { ok: false, reason: 'cannot resolve endpoints' }
  }

  const { logicalFrom, logicalTo, logicalPinName, needsPortal } = endpoints

  if (
    !needsPortal &&
    !areSameDiagramBranch(logicalFrom, logicalTo, renderData)
  ) {
    return { ok: false, reason: 'different diagram branches' }
  }

  const fromHandleId = String(
    logicalFrom.data?.originalNodeId ?? logicalFrom.id
  )
  const toHandleId = String(logicalTo.data?.originalNodeId ?? logicalTo.id)
  const fromHandle = renderData.handlesRegistry.get(fromHandleId)
  const toHandle = renderData.handlesRegistry.get(toHandleId)
  if (!fromHandle || !toHandle) {
    return { ok: false, reason: 'handles missing' }
  }

  const fromType = String(fromHandle.Data?.$type ?? logicalFrom.type)
  const ownerType = String(toHandle.Data?.$type ?? logicalTo.type)

  const pinParsed = parsePinName(logicalPinName)
  if (!pinParsed || pinParsed.append) {
    return { ok: false, reason: 'invalid pin (append must be resolved first)' }
  }

  const wireKind = classifyConnectWire(fromType, ownerType, pinParsed.inputName)
  const meta = getInputSlotMeta(
    logicalTo,
    logicalPinName,
    renderData.handlesRegistry
  )
  if (!meta) {
    return { ok: false, reason: 'target input not found' }
  }

  // Exclusive autodetach: occupants of pin + exclusive from outs
  const toDetach: DiagramConnection[] = []
  const pinOcc = findPinOccupant(renderData, endpoints.diagramToId, logicalPinName)
    ?? findPinOccupant(renderData, logicalTo.id, logicalPinName)
  if (pinOcc) toDetach.push(pinOcc)

  if (wireKind === 'exclusiveRef' || wireKind === 'inline') {
    for (const c of findExclusiveFromConnections(renderData, fromId)) {
      if (!toDetach.some((d) => connectionEquals(d, c))) toDetach.push(c)
    }
  }

  // Disconnect plans for autodetach are expanded in applyConnectPlan via compileDisconnectActions
  // to avoid circular compile. Stash as remove diagram + clear — apply will call disconnect.

  const willGraduate = isConsumerReachable(renderData, toHandleId)
  // After wire, consumer gains the edge — treat consumer already reachable OR from becoming reachable via to
  const graduate =
    willGraduate ||
    isConsumerReachable(renderData, fromHandleId)

  if (wireKind === 'inline' && graduate) {
    actions.push({
      kind: 'wire-inline-embed',
      ownerHandleId: toHandleId,
      ownerType,
      inputName: meta.inputName,
      index: meta.index,
      fromBoxId: logicalFrom.id,
      fromHandleId,
      ownerBoxId: logicalTo.id,
    })
  } else {
    actions.push({
      kind: 'wire-handle-ref',
      ownerHandleId: toHandleId,
      ownerType,
      inputName: meta.inputName,
      index: meta.index,
      fromHandleId,
    })
  }

  // Portal + diagram edges filled in apply (needs live portal ids)
  actions.push({
    kind: 'diagram-connection-add',
    connection: {
      from: fromId,
      to: toId,
      type: DIAGRAM_CONNECTION_TYPE_INPUT,
      pinName: logicalPinName,
    },
  })

  if (graduate) {
    if (wireKind === 'sharedRef' || wireKind === 'exclusiveRef') {
      actions.push({
        kind: 'promote-floating',
        handleId: fromHandleId,
        appendNodesToInit: NodeDefinitionRegistry.isNodesToInitType(fromType),
      })
    }
  }

  return {
    ok: true,
    actions,
    connection: {
      from: fromId,
      to: toId,
      type: DIAGRAM_CONNECTION_TYPE_INPUT,
      pinName: logicalPinName,
    },
  }
}

function isArrayInputField(nodeType: string, inputName: string): boolean {
  const field = getAnimTypeFields(nodeType).find((f) => f.key === inputName)
  return !!field && isArrayFieldType(field.type)
}

/** Resolve append pin on handle; returns new pin name or null. */
export function resolveAppendPinName(
  renderData: RenderData,
  toId: string,
  pinName: string
): string | null {
  const toNode = renderData.allNodes.get(toId)
  if (!toNode) return null
  const parsed = parsePinName(pinName)
  if (!parsed?.append) return pinName

  const originalId = toNode.data?.originalNodeId ?? toNode.id
  const handle = renderData.handlesRegistry.get(originalId)
  if (!handle) return null
  const nodeType = String(handle.Data?.$type ?? toNode.type)
  if (!NodeDefinitionRegistry.getInputFields(nodeType).includes(parsed.inputName)) {
    return null
  }

  let newIndex: number | null = null
  if (isArrayInputField(nodeType, parsed.inputName)) {
    newIndex = appendInputArraySlot(handle, parsed.inputName, nodeType)
  } else {
    const handler = getNodeInputHandler(parsed.inputName, nodeType)
    newIndex = handler.count(handle)
  }
  if (newIndex == null || newIndex < 0) return null
  return `${parsed.inputName}[${newIndex}]`
}

export function compileDisconnectActions(
  renderData: RenderData,
  conn: DiagramConnection
): PinWirePlan {
  if (!conn.pinName) {
    return { ok: false, reason: 'missing pinName' }
  }

  const actions: PinWireAction[] = []
  const toNode = renderData.allNodes.get(conn.to)
  const fromNode = renderData.allNodes.get(conn.from)
  if (!toNode || !fromNode) {
    return { ok: false, reason: 'from/to missing' }
  }

  // Resolve logical to through cross-view metadata or portal box outbound hop
  let logicalTo = toNode

  if (conn.metadata?.originalTo) {
    logicalTo = renderData.allNodes.get(conn.metadata.originalTo) ?? logicalTo
  } else if (isDiagramPortalNode(toNode)) {
    const hop = findOutboundPortalHop(renderData, toNode.id)
    const sinkId = hop?.metadata?.originalTo ?? hop?.to
    if (sinkId) logicalTo = renderData.allNodes.get(sinkId) ?? logicalTo
  }

  const ownerHandleId = String(logicalTo.data?.originalNodeId ?? logicalTo.id)
  const ownerHandle = renderData.handlesRegistry.get(ownerHandleId)
  if (!ownerHandle) {
    return { ok: false, reason: 'owner handle missing' }
  }
  const ownerType = String(ownerHandle.Data?.$type ?? logicalTo.type)
  const parsed = parsePinName(conn.pinName)
  if (!parsed) {
    return { ok: false, reason: 'bad pin' }
  }

  actions.push({
    kind: 'clear-pin',
    ownerHandleId,
    ownerType,
    inputName: parsed.inputName,
    index: parsed.index,
  })

  actions.push({
    kind: 'diagram-connection-remove',
    connection: { ...conn },
  })

  return {
    ok: true,
    actions,
    connection: { ...conn },
  }
}
