/**
 * Delete-node plan action payloads — mutation recipe for cascade delete.
 */

import type { DiagramConnection } from '../diagramTypes'
import type { AddedNodePlacement } from '../GraphHistory'

export interface DisconnectWireAction {
  kind: 'disconnect-wire'
  connection: DiagramConnection
}

export interface DetachHandleRefAction {
  kind: 'detach-handle-ref'
  parentHandleId: string
  slotName: string
  /** Array index, or -1 for scalar slot. */
  index: number
  handleId: string
}

export interface UnregisterHandleAction {
  kind: 'unregister-handle'
  handleId: string
}

export interface RemoveDiagramNodeAction {
  kind: 'remove-diagram-node'
  placement: AddedNodePlacement
}

export interface FitParentGroupAction {
  kind: 'fit-parent-group'
  parentId: string
}

/** Sync SM.stateIds from surviving SM.Data.states order. */
export interface ReindexSmStatesAction {
  kind: 'reindex-sm-states'
  smId: string
  statesGroupId: string
}

/**
 * Remap transition/CE targetStateIndex after a state is removed.
 * `>` deleted → decrement; `===` deleted → -1 (target gone).
 */
export interface RemapTargetStateIndicesAction {
  kind: 'remap-target-state-indices'
  smId: string
  deletedStateIndex: number
}

/**
 * Remap State.outTransitionIndices after a transition is removed from SM.transitions
 * (or globalTransitions).
 */
export interface RemapOutTransitionIndicesAction {
  kind: 'remap-out-transition-indices'
  smId: string
  slotName: 'transitions' | 'globalTransitions'
  deletedIndex: number
}

/** Vertically restack indexed children in a PropertyGroup (excl. portals). */
export interface RestackPropertyGroupAction {
  kind: 'restack-property-group'
  groupId: string
  /** How to order children before packing. */
  sortBy: 'priority' | 'stateIndex' | 'none'
}

/** Refresh SM overview child counts (and `stateIds` for the states section). */
export interface SyncSmSectionMetadataAction {
  kind: 'sync-sm-section-metadata'
  smId: string
  slotName: string
}

export interface DeleteNodeActionMap {
  'disconnect-wire': DisconnectWireAction
  'detach-handle-ref': DetachHandleRefAction
  'unregister-handle': UnregisterHandleAction
  'remove-diagram-node': RemoveDiagramNodeAction
  'fit-parent-group': FitParentGroupAction
  'reindex-sm-states': ReindexSmStatesAction
  'remap-target-state-indices': RemapTargetStateIndicesAction
  'remap-out-transition-indices': RemapOutTransitionIndicesAction
  'restack-property-group': RestackPropertyGroupAction
  'sync-sm-section-metadata': SyncSmSectionMetadataAction
}

export type DeleteNodeActionKind = keyof DeleteNodeActionMap
export type DeleteNodeAction = DeleteNodeActionMap[DeleteNodeActionKind]

export type DeleteNodeDenialReason =
  | 'not-found'
  | 'root-forbidden'
  | 'portal-forbidden'
  | 'sm-shell-forbidden'

export type CanDeleteNodeResult =
  | { ok: true }
  | { ok: false; reasons: DeleteNodeDenialReason[] }

export type DeleteNodePlan = {
  seedId: string
  affectedIds: string[]
  handleIds: string[]
  actions: DeleteNodeAction[]
  parentRefreshIds: string[]
}

export type DeleteNodeApplyResult =
  | {
      ok: true
      seedId: string
      removedNodeIds: string[]
      removedHandleIds: string[]
      parentRefreshIds: string[]
      footprintDirtyBoxIds: string[]
      removedPortalIds: string[]
      label: string
    }
  | { ok: false; message: string }
