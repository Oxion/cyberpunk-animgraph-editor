import { addConnectionCreate } from './handlers/addConnectionCreate'
import {
  arrangeInputsDeselectAll,
  arrangeInputsRun,
  arrangeInputsSelectAll,
  arrangeInputsToggle,
} from './handlers/arrangeInputs'
import { arrangeSelectionRun } from './handlers/arrangeSelectionRun'
import {
  attachHandleClear,
  attachHandleCreate,
  attachHandleDataFromSelected,
  attachHandleRun,
} from './handlers/attachHandle'
import { cancelConnectionDrag } from './handlers/cancelConnectionDrag'
import { copySelection } from './handlers/copySelection'
import { deleteSelection } from './handlers/deleteSelection'
import { deselectAll } from './handlers/deselectAll'
import { focusAddConnection, focusAddNode } from './handlers/focusAdd'
import { lockGrabMoveX, lockGrabMoveY } from './handlers/lockGrabMove'
import { lockResizeBottom, lockResizeLeft, lockResizeRight, lockResizeTop } from './handlers/lockResize'
import { nodesAdd } from './handlers/nodesAdd'
import {
  nudgeSelectionDown,
  nudgeSelectionLeft,
  nudgeSelectionRight,
  nudgeSelectionUp,
} from './handlers/nudgeSelection'
import { pasteNodes } from './handlers/pasteNodes'
import { pickConnectionFrom, pickConnectionTo } from './handlers/pickConnection'
import { saveAs } from './handlers/saveAs'
import { selectChildren } from './handlers/selectChildren'
import { selectInputsAdd } from './handlers/selectInputsAdd'
import {
  beginGrabMove,
  cancelGrabMove,
  clearGrabAxisLock,
  confirmGrabMove,
} from '../../composables/tools/grabMove'
import {
  beginResize,
  cancelResize,
  clearResizeSideLock,
  confirmResize,
} from '../../composables/tools/resizeSession'
import { registerAppCommandHandler } from '@/core/commands/handlers'
import { saveCurrentGraph } from '../../stores/graphDocumentIo'
import { redoGraphAction, undoGraphAction } from '../../stores/graphHistory'
import { Commands } from './ids'

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