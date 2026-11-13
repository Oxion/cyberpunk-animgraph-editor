import {
  ensureToolForSession,
  isToolInProgress,
  startSession,
} from '@/app/tools/pipeline'
import { Tools } from '@/app/tools/ids'
import { nudgeMoveSession } from '@/app/tools/handlers/move'
import { nudgeNodeSession } from '@/app/tools/handlers/nodeNudge'

function nudgeSelection(
  direction: 'up' | 'down' | 'left' | 'right',
  event?: KeyboardEvent
): void {
  if (isToolInProgress(Tools.move)) {
    nudgeMoveSession(direction, event)
    return
  }
  if (!event?.code) return

  if (!ensureToolForSession(Tools.nodeNudge)) return
  if (!isToolInProgress(Tools.nodeNudge)) {
    if (!startSession(Tools.nodeNudge)) return
  }
  nudgeNodeSession(direction, event)
}

export function nudgeSelectionUp(event?: KeyboardEvent) {
  nudgeSelection('up', event)
}

export function nudgeSelectionDown(event?: KeyboardEvent) {
  nudgeSelection('down', event)
}

export function nudgeSelectionLeft(event?: KeyboardEvent) {
  nudgeSelection('left', event)
}

export function nudgeSelectionRight(event?: KeyboardEvent) {
  nudgeSelection('right', event)
}
