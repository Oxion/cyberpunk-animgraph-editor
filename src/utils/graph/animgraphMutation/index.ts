export type { AnimgraphMutationCtx, ContainOwnerRef } from './ctx'

export { hasMembershipSlot } from './containPromote'
export { resolvePinStorage } from './pinStorage'
export type { PinStorageOps } from './pinStorage'

export {
  createHandle,
  deleteHandles,
  addContainRefs,
  removeContainRefs,
  addHandleRefs,
  removeHandleRefs,
  promoteContainMembership,
  demoteContainMembership,
  setHandleRef,
  clearHandleRef,
  setRootNode,
  renameHandle,
  mutateHandleData,
  replaceHandleData,
  countPinSlots,
  getPinSlot,
  setPinSlot,
} from './crud'
export type {
  AddHandleRefsResult,
  DeleteHandlesResult,
  RemoveHandleRefsResult,
  RenameHandleResult,
} from './crud'

export {
  buildNodesToInitFromRoot,
  collectHandlesReachableFromRoot,
  isHandleReachableFromRoot,
} from './reachability'

export {
  countInboundHandleRefs,
  countInboundPinHandleRefs,
  handleRefIdOf,
  stripInboundHandleRefs,
} from './refWalk'

export {
  applyOwnerFieldEffects,
  syncDerivedFields,
} from './fieldEffects'
export type { OwnerFieldChange } from './fieldChangeTypes'

export {
  remapTargetStateIndices,
  remapOutTransitionIndices,
} from './effects/smIndexRemap'

export {
  getFieldChangeEffect,
  registerFieldChangeEffect,
  runFieldChangeEffects,
} from './effects/registry'
export type { FieldChangeEffectHandler } from './effects/registry'
