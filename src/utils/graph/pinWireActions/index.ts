/**
 * Connect / disconnect pin wires as reusable action plans.
 */

export type {
  ClearPinAction,
  ConnectPlanInput,
  ConnectWireKind,
  DiagramConnectionAddAction,
  DiagramConnectionRemoveAction,
  DisconnectPlanInput,
  EnsurePortalBoxAction,
  MarkBoxInlineAction,
  PinWireAction,
  PinWireActionKind,
  PinWireActionMap,
  PinWireApplyResult,
  PinWireRekeyedConnection,
  PinWirePlan,
  PlacePortalAction,
  PromoteFloatingAction,
  RemoveFloatingHandleAction,
  RemovePortalBoxAction,
  RestoreBoxHandleAction,
  UnpromoteFloatingAction,
  WireHandleRefAction,
  WireInlineEmbedAction,
} from './types'

export { classifyConnectWire } from './classify'
export { areSameDiagramBranch } from './branchGate'
export { resolveConnectEndpoints } from './portalResolve'
export {
  collectReachableHandleIds,
  isConsumerReachable,
  isHandleReachableFromNodesToInit,
} from './reachability'
export {
  compileConnectActions,
  compileDisconnectActions,
  resolveAppendPinName,
} from './compileConnect'
export { applyConnectPlan, applyDisconnectPlan } from './apply'
