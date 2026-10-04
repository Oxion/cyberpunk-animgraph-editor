/**
 * Pin wire plan actions — connect/disconnect mutation recipes.
 */

import type { DiagramConnection } from '../diagramTypes'

export type ConnectWireKind = 'sharedRef' | 'exclusiveRef' | 'inline'

export interface WireHandleRefAction {
  kind: 'wire-handle-ref'
  ownerHandleId: string
  ownerType: string
  inputName: string
  index: number
  fromHandleId: string
}

export interface WireInlineEmbedAction {
  kind: 'wire-inline-embed'
  ownerHandleId: string
  ownerType: string
  inputName: string
  index: number
  fromBoxId: string
  fromHandleId: string
  ownerBoxId: string
}

export interface ClearPinAction {
  kind: 'clear-pin'
  ownerHandleId: string
  ownerType: string
  inputName: string
  index: number
}

export interface DiagramConnectionAddAction {
  kind: 'diagram-connection-add'
  connection: DiagramConnection
}

export interface DiagramConnectionRemoveAction {
  kind: 'diagram-connection-remove'
  connection: DiagramConnection
}

export interface EnsurePortalBoxAction {
  kind: 'ensure-portal-box'
  portalId: string
  parentId: string
  hop: 'deep' | 'state-entry'
  metadata: Record<string, unknown>
}

export interface RemovePortalBoxAction {
  kind: 'remove-portal-box'
  portalId: string
}

export interface PlacePortalAction {
  kind: 'place-portal'
  portalId: string
  targetId: string
}

export interface PromoteFloatingAction {
  kind: 'promote-floating'
  handleId: string
  appendNodesToInit?: boolean
}

export interface UnpromoteFloatingAction {
  kind: 'unpromote-floating'
  handleId: string
  removeFromNodesToInit?: boolean
}

export interface MarkBoxInlineAction {
  kind: 'mark-box-inline'
  boxId: string
  ownerBoxId: string
  field: string
  index: number | null
}

export interface RestoreBoxHandleAction {
  kind: 'restore-box-handle'
  boxId: string
  handleId: string
}

export interface RemoveFloatingHandleAction {
  kind: 'remove-floating-handle'
  handleId: string
  deleteFromRegistry?: boolean
}

export interface PinWireActionMap {
  'wire-handle-ref': WireHandleRefAction
  'wire-inline-embed': WireInlineEmbedAction
  'clear-pin': ClearPinAction
  'diagram-connection-add': DiagramConnectionAddAction
  'diagram-connection-remove': DiagramConnectionRemoveAction
  'ensure-portal-box': EnsurePortalBoxAction
  'remove-portal-box': RemovePortalBoxAction
  'place-portal': PlacePortalAction
  'promote-floating': PromoteFloatingAction
  'unpromote-floating': UnpromoteFloatingAction
  'mark-box-inline': MarkBoxInlineAction
  'restore-box-handle': RestoreBoxHandleAction
  'remove-floating-handle': RemoveFloatingHandleAction
}

export type PinWireActionKind = keyof PinWireActionMap
export type PinWireAction = PinWireActionMap[PinWireActionKind]

export type PinWirePlan =
  | { ok: true; actions: PinWireAction[]; connection: DiagramConnection | null }
  | { ok: false; reason: string }

export type ConnectPlanInput = {
  fromId: string
  toId: string
  pinName: string
}

export type DisconnectPlanInput = {
  connection: DiagramConnection
}

/** Array-slot wire whose pinName was shifted after a mid-list disconnect. */
export type PinWireRekeyedConnection = {
  /** Connection map key before the pinName change. */
  oldKey: string
  /** Live diagram connection after pinName update. */
  connection: DiagramConnection
}

/** Runtime context passed while applying (optional bookkeeping). */
export type PinWireApplyResult = {
  connection: DiagramConnection | null
  /** Diagram edges removed during connect/disconnect (incl. portal hops). */
  removedConnections: DiagramConnection[]
  /** Surviving array wires whose pinName (and thus connection key) changed. */
  rekeyedConnections: PinWireRekeyedConnection[]
  createdPortalIds: string[]
  removedPortalIds: string[]
  resolvedPinName: string | null
  wasAppend: boolean
  /** Diagram boxes whose pin rows / size must be rebuilt (array pin length changed). */
  footprintDirtyBoxIds: string[]
  /** Handles removed from nodesToInit and marked floating after disconnect. */
  demotedHandleIds: string[]
}
