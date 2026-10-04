/** Per-tool state + derived cache — separate reactives to limit update fan-out. */

export {
  moveToolState,
  moveToolCache,
  type GrabAxisLock,
  type GrabMoveSession,
} from './move'

export {
  resizeToolState,
  resizeToolCache,
  type ResizeSideLock,
  type ResizeStartLayout,
  type ResizeNeighbourContact,
  type ResizeAncestorPlan,
  type ResizeSession,
} from './resize'

export { addNodeToolState, addNodeToolCache } from './addNode'
export {
  pasteNodeToolState,
  pasteNodeToolCache,
  pickPasteTarget,
  clearPasteTarget,
  resolvePasteTargetId,
} from './pasteNode'
export {
  createConnectionToolState,
  createConnectionToolCache,
  pickCreateConnectionFrom,
  pickCreateConnectionTo,
} from './createConnection'
export { arrangeInputsToolState, arrangeInputsToolCache } from './arrangeInputs'
export { selectInputsToolState, selectInputsToolCache } from './selectInputs'
export { arrangeSelectionToolState, arrangeSelectionToolCache } from './arrangeSelection'
export { attachHandleToolState, attachHandleToolCache } from './attachHandle'
