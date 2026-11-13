import { registerAddConnectionToolHandlers } from './handlers/addConnection'
import { registerAddNodeToolHandlers } from './handlers/addNode'
import { registerArrangeInputsToolHandlers } from './handlers/arrangeInputs'
import { registerArrangeSelectionToolHandlers } from './handlers/arrangeSelection'
import { registerAttachHandleToolHandlers } from './handlers/attachHandle'
import { registerConnectionDragToolHandlers } from './handlers/connectionDrag'
import { registerMoveToolHandlers } from './handlers/move'
import { registerNodeNudgeToolHandlers } from './handlers/nodeNudge'
import { registerPasteNodeToolHandlers } from './handlers/pasteNode'
import { registerResizeToolHandlers } from './handlers/resize'
import { registerSelectInputsToolHandlers } from './handlers/selectInputs'

/** Wire tool lifecycle handlers. Idempotent for Vite HMR / App remount. */
export function registerAllAppToolHandlers(): void {
  registerMoveToolHandlers()
  registerResizeToolHandlers()
  registerAddNodeToolHandlers()
  registerPasteNodeToolHandlers()
  registerAddConnectionToolHandlers()
  registerAttachHandleToolHandlers()
  registerArrangeInputsToolHandlers()
  registerSelectInputsToolHandlers()
  registerArrangeSelectionToolHandlers()
  registerConnectionDragToolHandlers()
  registerNodeNudgeToolHandlers()
}
