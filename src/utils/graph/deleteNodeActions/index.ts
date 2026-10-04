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
  DetachHandleRefAction,
  DisconnectWireAction,
  FitParentGroupAction,
  ReindexSmStatesAction,
  RemapOutTransitionIndicesAction,
  RemapTargetStateIndicesAction,
  RemoveDiagramNodeAction,
  RestackPropertyGroupAction,
  SyncSmSectionMetadataAction,
  UnregisterHandleAction,
} from './types'

export {
  canDeleteNode,
  collectAffectedSubtree,
  collectDetachHandleRefs,
  collectDisconnectWires,
  compileDeleteNodeActions,
  resolveBoxHandleId,
} from './compile'

export type { CompileDeleteNodeResult } from './compile'

export { applyDeleteNodeActions, applyDeleteNodePlan } from './apply'

export { resolveDeleteSideEffects } from './sideEffects'
