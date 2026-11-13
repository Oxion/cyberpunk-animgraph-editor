import type { SessionEndReason } from '@/core/tools'
import {
  endSession,
  focusedTool,
  isToolInProgress,
  popTool,
  pushTool,
  startSession,
} from './pipeline'
import { Tools } from './ids'

/** Called by renderer when a pin-drag gesture begins. */
export function notifyConnectionDragBegin(): void {
  if (isToolInProgress(Tools.connectionDrag)) return
  pushTool(Tools.connectionDrag)
  startSession(Tools.connectionDrag)
}

/** Called by renderer when a pin-drag gesture ends. */
export function notifyConnectionDragEnd(_reason: SessionEndReason = 'cancel'): void {
  if (isToolInProgress(Tools.connectionDrag)) {
    endSession(Tools.connectionDrag, _reason)
  }
  // Hidden modal tool: always leave the stack when the gesture ends.
  if (focusedTool.value === Tools.connectionDrag) {
    popTool()
  }
}
