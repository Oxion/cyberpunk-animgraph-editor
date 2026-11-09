export type { AnimgraphMutationCtx } from './ctx'

export {
  createHandle,
  deleteHandles,
  addHandleRefs,
  removeHandleRefs,
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
