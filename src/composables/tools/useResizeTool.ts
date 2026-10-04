import { watchEffect } from 'vue'
import { resizeToolCache, resizeToolState } from '../../stores/tools'

/**
 * Preferred session APIs: import from `./resizeSession` (or `./moveResizeSession`).
 * This module only syncs resizeToolCache.active while the resize tool runner is live.
 */
export {
  beginResize,
  cancelResize,
  clearResizeSideLock,
  confirmResize,
  selectionResizeLocks,
  setResizeSideLock,
} from './resizeSession'

export function useResizeTool() {
  watchEffect(() => {
    resizeToolCache.active = Boolean(resizeToolState.session)
  })
}
