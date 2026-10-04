import type { AppToolId } from '../appTools/catalog'
import { cancelGrabMove } from '../composables/tools/grabMove'
import { cancelResize } from '../composables/tools/resizeSession'
import { canActivateAppTool } from './appContext'
import { clearModalGestureRestoreState } from './modalGestureUi'
import { activeToolsRegistry, focusedTool, toolManager } from './toolManager'
import { moveToolState } from './tools/move'
import { resizeToolState } from './tools/resize'

function replaceFocusedWithTool(id: AppToolId) {
  const focused = focusedTool.value
  if (focused && focused !== id) {
    toolManager.deactivateTool(focused)
  }
  toolManager.activateTool(id)
  toolManager.focusTool(id)
}

/** Enter an app tool from menu/hotkey: cancel the other modal session if needed. */
export function selectAppTool(id: AppToolId) {
  if (!canActivateAppTool(id)) return
  clearModalGestureRestoreState()
  if (id !== 'move' && moveToolState.session) {
    cancelGrabMove()
  }
  if (id !== 'resize' && resizeToolState.session) {
    cancelResize()
  }
  replaceFocusedWithTool(id)
}

export function toggleAppTool(id: AppToolId) {
  if (activeToolsRegistry[id] && focusedTool.value === id) {
    toolManager.deactivateTool(id)
    return
  }
  if (!canActivateAppTool(id)) return
  if (activeToolsRegistry[id]) {
    toolManager.focusTool(id)
    return
  }
  selectAppTool(id)
}
