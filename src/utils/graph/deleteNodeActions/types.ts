/**
 * Delete-node plan action payloads — mutation recipe for cascade delete.
 */

import type { DiagramConnection } from '../diagramTypes'
import type { AddedNodePlacement } from '../GraphHistory'

export interface DisconnectWireAction {
  kind: 'disconnect-wire'
  connection: DiagramConnection
}

/** Batch-delete animgraph handles (strip inbound refs + registry). */
export interface DeleteAnimgraphHandlesAction {
  kind: 'delete-animgraph-handles'
  handleIds: string[]
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
  'delete-animgraph-handles': DeleteAnimgraphHandlesAction
  'remove-diagram-node': RemoveDiagramNodeAction
  'fit-parent-group': FitParentGroupAction
  'reindex-sm-states': ReindexSmStatesAction
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
