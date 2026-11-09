/**
 * Delete node as reusable action plans (compile → apply).
 */

export type {
  CanDeleteNodeResult,
  DeleteNodeAction,
  DeleteNodeActionKind,
  DeleteNodeActionMap,
  DeleteNodeApplyResult,
  DeleteNodeDenialReason,
  DeleteNodePlan,
  DeleteAnimgraphHandlesAction,
  DisconnectWireAction,
  FitParentGroupAction,
  ReindexSmStatesAction,
  RemoveDiagramNodeAction,
  RestackPropertyGroupAction,
  SyncSmSectionMetadataAction,
} from './types'

export {
  canDeleteNode,
  collectAffectedSubtree,
  collectDisconnectWires,
  compileDeleteNodeActions,
  resolveBoxHandleId,
} from './compile'

export type { CompileDeleteNodeResult } from './compile'

export { applyDeleteNodeActions, applyDeleteNodePlan } from './apply'

export { resolveDeleteSideEffects } from './sideEffects'
