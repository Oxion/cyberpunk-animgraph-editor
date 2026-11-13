/** Barrel — prefer grabMove / resizeSession / handlers directly. */
export {
  arrangeSelectedNodesWithElk,
  countDescendants,
  getAllInputNodes,
  getAllOutputNodes,
  moveInputNodesCloser,
  moveInputNodesOnly,
  moveSelectedNodeByDelta,
} from './grabMove'

export { selectionResizeLocks } from './resizeSession'

export {
  lockMoveAxis as setGrabAxisLock,
  clearMoveAxisLock as clearGrabAxisLock,
  nudgeMoveSession,
} from '@/app/tools/handlers/move'

export {
  lockResizeSide as setResizeSideLock,
  clearResizeSideLock,
} from '@/app/tools/handlers/resize'

export {
  bindMoveResizeSession,
  getNodeHeight,
  getNodeWidth,
  trackLastPointerClient,
  type MoveResizeHost,
} from './moveResizeShared'
