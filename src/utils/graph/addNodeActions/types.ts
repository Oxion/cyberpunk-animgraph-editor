/**
 * Add-node plan action payloads — extend AddNodeActionMap to add kinds.
 */

import type { AnimgraphAttachContext } from '../nodeAddRules'

export type PlaceInParentMode = 'append-bottom-grow' | 'preserve-position'

export type EnsureDiagramChildParent =
  | { kind: 'primary'; parentSlot?: string }
  | { kind: 'property-group'; ownerDiagramId: string; slotName: string }

export interface PlaceInParentAction {
  kind: 'place-in-parent'
  mode: PlaceInParentMode
}

export interface EnsurePropertyGroupAction {
  kind: 'ensure-property-group'
  ownerDiagramId: string
  slotName: string
}

export interface EnsureDiagramChildAction {
  kind: 'ensure-diagram-child'
  id: string
  diagramNodeType: string
  parent: EnsureDiagramChildParent
}

export interface AttachHandleAction {
  kind: 'attach-handle'
  handleId: string
  animgraphNodeType: string
  attach: AnimgraphAttachContext
  /** Default true. Paste sets false so disconnected copies skip nodesToInit. */
  initInAnimgraph?: boolean
}

/** Attach under a handle created earlier in this plan (bootstrap requireTypes). */
export interface AttachHandleToAction {
  kind: 'attach-handle-to'
  handleId: string
  animgraphNodeType: string
  parentHandleId: string
  slotName: string
  /**
   * When false (floating parent): registry + parent.Data ref only, no nodesToInit.
   * Default true for strict list parents.
   */
  initInAnimgraph?: boolean
}

/** Registry + floating mark only — no parent Data / nodesToInit write. */
export interface RegisterFloatingHandleAction {
  kind: 'register-floating-handle'
  handleId: string
  animgraphNodeType: string
}

/** Kind → action payload. Extend this map (or merge) to add actions. */
export interface AddNodeActionMap {
  'place-in-parent': PlaceInParentAction
  'ensure-property-group': EnsurePropertyGroupAction
  'ensure-diagram-child': EnsureDiagramChildAction
  'attach-handle': AttachHandleAction
  'attach-handle-to': AttachHandleToAction
  'register-floating-handle': RegisterFloatingHandleAction
}

export type AddNodeActionKind = keyof AddNodeActionMap
export type AddNodeAction = AddNodeActionMap[AddNodeActionKind]
