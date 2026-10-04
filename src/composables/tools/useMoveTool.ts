import { watchEffect } from 'vue'
import { moveToolCache, moveToolState } from '../../stores/tools'

/**
 * Preferred session APIs: import from `./grabMove` (or `./moveResizeSession`).
 * This module only syncs moveToolCache.active while the move tool runner is live.
 */
export {
  beginGrabMove,
  cancelGrabMove,
  clearGrabAxisLock,
  confirmGrabMove,
  moveInputNodesOnly,
  moveNode,
  moveSelectedNodeByDelta,
  nudgeSelection,
  setGrabAxisLock,
  arrangeSelectedNodesWithElk,
  countDescendants,
  getAllInputNodes,
  getAllOutputNodes,
} from './grabMove'

export { trackLastPointerClient } from './moveResizeShared'

export function useMoveTool() {
  watchEffect(() => {
    moveToolCache.active = Boolean(moveToolState.session)
  })
}
