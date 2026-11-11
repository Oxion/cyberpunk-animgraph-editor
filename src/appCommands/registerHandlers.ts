import { undoGraphAction, redoGraphAction } from '../stores/graphHistory'
import { saveCurrentGraph } from '../stores/graphDocumentIo'
import {
  beginGrabMove,
  cancelGrabMove,
  clearGrabAxisLock,
  confirmGrabMove,
} from '../composables/tools/grabMove'
import {
  beginResize,
  cancelResize,
  clearResizeSideLock,
  confirmResize,
} from '../composables/tools/resizeSession'
import { registerAppCommandHandler } from '../commands/handlers'
import { Commands } from './ids'
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
import { nodesAdd } from './nodesAdd'
import { addConnectionCreate } from './addConnectionCreate'
import {
  arrangeInputsDeselectAll,
  arrangeInputsRun,
  arrangeInputsSelectAll,
  arrangeInputsToggle,
} from './arrangeInputs'
import { selectInputsAdd } from './selectInputsAdd'
import { arrangeSelectionRun } from './arrangeSelectionRun'
import {
  attachHandleClear,
  attachHandleCreate,
  attachHandleDataFromSelected,
  attachHandleRun,
} from './attachHandle'

/** Wire command ids to handlers. Idempotent for Vite HMR / App remount. */
export function registerAllAppCommandHandlers(): void {
  registerAppCommandHandler(Commands.history.undo, undoGraphAction)
  registerAppCommandHandler(Commands.history.redo, redoGraphAction)
  registerAppCommandHandler(Commands.document.save, saveCurrentGraph)
  registerAppCommandHandler(Commands.document.saveAs, saveAs)
  registerAppCommandHandler(Commands.connectionDrag.cancel, cancelConnectionDrag)
  registerAppCommandHandler(Commands.grabMove.cancel, cancelGrabMove)
  registerAppCommandHandler(Commands.grabMove.confirm, confirmGrabMove)
  registerAppCommandHandler(Commands.grabMove.lockX, lockGrabMoveX)
  registerAppCommandHandler(Commands.grabMove.lockY, lockGrabMoveY)
  registerAppCommandHandler(Commands.grabMove.clearAxisLock, clearGrabAxisLock)
  registerAppCommandHandler(Commands.grabMove.begin, beginGrabMove)
  registerAppCommandHandler(Commands.resize.cancel, cancelResize)
  registerAppCommandHandler(Commands.resize.confirm, confirmResize)
  registerAppCommandHandler(Commands.resize.lockTop, lockResizeTop)
  registerAppCommandHandler(Commands.resize.lockLeft, lockResizeLeft)
  registerAppCommandHandler(Commands.resize.lockBottom, lockResizeBottom)
  registerAppCommandHandler(Commands.resize.lockRight, lockResizeRight)
  registerAppCommandHandler(Commands.resize.clearSideLock, clearResizeSideLock)
  registerAppCommandHandler(Commands.resize.begin, beginResize)
  registerAppCommandHandler(Commands.addNode.focus, focusAddNode)
  registerAppCommandHandler(Commands.nodes.add, nodesAdd)
  registerAppCommandHandler(Commands.addConnection.focus, focusAddConnection)
  registerAppCommandHandler(Commands.addConnection.create, addConnectionCreate)
  registerAppCommandHandler(Commands.selection.copy, copySelection)
  registerAppCommandHandler(Commands.nodes.paste, pasteNodes)
  registerAppCommandHandler(Commands.selection.nudgeUp, nudgeSelectionUp)
  registerAppCommandHandler(Commands.selection.nudgeDown, nudgeSelectionDown)
  registerAppCommandHandler(Commands.selection.nudgeLeft, nudgeSelectionLeft)
  registerAppCommandHandler(Commands.selection.nudgeRight, nudgeSelectionRight)
  registerAppCommandHandler(Commands.selection.delete, deleteSelection)
  registerAppCommandHandler(Commands.selection.deselectAll, deselectAll)
  registerAppCommandHandler(Commands.selection.selectChildren, selectChildren)
  registerAppCommandHandler(Commands.addConnection.pickFrom, pickConnectionFrom)
  registerAppCommandHandler(Commands.addConnection.pickTo, pickConnectionTo)
  registerAppCommandHandler(Commands.arrangeInputs.selectAll, arrangeInputsSelectAll)
  registerAppCommandHandler(Commands.arrangeInputs.deselectAll, arrangeInputsDeselectAll)
  registerAppCommandHandler(Commands.arrangeInputs.toggle, arrangeInputsToggle)
  registerAppCommandHandler(Commands.arrangeInputs.run, arrangeInputsRun)
  registerAppCommandHandler(Commands.selectInputs.add, selectInputsAdd)
  registerAppCommandHandler(Commands.arrangeSelection.run, arrangeSelectionRun)
  registerAppCommandHandler(Commands.attachHandle.create, attachHandleCreate)
  registerAppCommandHandler(Commands.attachHandle.clear, attachHandleClear)
  registerAppCommandHandler(Commands.attachHandle.dataFromSelected, attachHandleDataFromSelected)
  registerAppCommandHandler(Commands.attachHandle.run, attachHandleRun)
}
