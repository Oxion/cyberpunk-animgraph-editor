/**
 * Animgraph execution semantics — structural core (sinks, entry, reverse pin walk).
 * Not projection (diagram) and not sim runtime active path.
 */

export type { ExecutionRoleDef, ExecutionRoleRegistration } from './types'
export { EXECUTION_ROLE_DEFINITIONS } from './registrations'
export {
  getExecutionRole,
  getExecutionEntryPoseFields,
  getExecutionPreferredSinkType,
  getExecutionSinkHostFields,
  isExecutionEntry,
  isExecutionInitAnchor,
  isExecutionSink,
} from './resolve'
export {
  collectReverseProducerHandleIds,
  collectStructuralCoreHandleIds,
  findPreferredSinkUnderHost,
  isHandleInStructuralCore,
} from './collectStructuralCore'
export { demoteOrphanNodesToInitAfterDisconnect } from './demoteOnDisconnect'
