import { undoGraphAction, redoGraphAction } from '../stores/graphHistory'
import { saveCurrentGraph } from '../stores/graphDocumentIo'
import {
  beginGrabMove,
  cancelGrabMove,
  confirmGrabMove,
} from '../composables/tools/grabMove'
import {
  beginResize,
  cancelResize,
  confirmResize,
} from '../composables/tools/resizeSession'
import { registerAppCommandHandler } from '../commands/handlers'
import { copySelection } from './copySelection'
import { pasteNodes } from './pasteNodes'
import { deleteSelection } from './deleteSelection'
import { deselectAll } from './deselectAll'
import { selectChildren } from './selectChildren'
import { saveAs } from './saveAs'
import { cancelConnectionDrag } from './cancelConnectionDrag'
import { lockGrabMoveX, lockGrabMoveY } from './lockGrabMove'
import { lockResizeBottom, lockResizeLeft, lockResizeRight, lockResizeTop } from './lockResize'
import { focusAddConnection, focusAddNode } from './focusAdd'
import {
  nudgeSelectionDown,
  nudgeSelectionLeft,
  nudgeSelectionRight,
  nudgeSelectionUp,
} from './nudgeSelection'
import { pickConnectionFrom, pickConnectionTo } from './pickConnection'

/** Wire command ids to handlers. Idempotent for Vite HMR / App remount. */
export function registerAllAppCommandHandlers(): void {
  registerAppCommandHandler('history.undo', undoGraphAction)
  registerAppCommandHandler('history.redo', redoGraphAction)
  registerAppCommandHandler('document.save', saveCurrentGraph)
  registerAppCommandHandler('document.saveAs', saveAs)
  registerAppCommandHandler('connectionDrag.cancel', cancelConnectionDrag)
  registerAppCommandHandler('grabMove.cancel', cancelGrabMove)
  registerAppCommandHandler('grabMove.confirm', confirmGrabMove)
  registerAppCommandHandler('grabMove.lockX', lockGrabMoveX)
  registerAppCommandHandler('grabMove.lockY', lockGrabMoveY)
  registerAppCommandHandler('grabMove.begin', beginGrabMove)
  registerAppCommandHandler('resize.cancel', cancelResize)
  registerAppCommandHandler('resize.confirm', confirmResize)
  registerAppCommandHandler('resize.lockTop', lockResizeTop)
  registerAppCommandHandler('resize.lockLeft', lockResizeLeft)
  registerAppCommandHandler('resize.lockBottom', lockResizeBottom)
  registerAppCommandHandler('resize.lockRight', lockResizeRight)
  registerAppCommandHandler('resize.begin', beginResize)
  registerAppCommandHandler('addNode.focus', focusAddNode)
  registerAppCommandHandler('addConnection.focus', focusAddConnection)
  registerAppCommandHandler('selection.copy', copySelection)
  registerAppCommandHandler('nodes.paste', pasteNodes)
  registerAppCommandHandler('selection.nudgeUp', nudgeSelectionUp)
  registerAppCommandHandler('selection.nudgeDown', nudgeSelectionDown)
  registerAppCommandHandler('selection.nudgeLeft', nudgeSelectionLeft)
  registerAppCommandHandler('selection.nudgeRight', nudgeSelectionRight)
  registerAppCommandHandler('selection.delete', deleteSelection)
  registerAppCommandHandler('selection.deselectAll', deselectAll)
  registerAppCommandHandler('selection.selectChildren', selectChildren)
  registerAppCommandHandler('addConnection.pickFrom', pickConnectionFrom)
  registerAppCommandHandler('addConnection.pickTo', pickConnectionTo)
}
