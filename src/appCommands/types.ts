/**
 * App-specific command definitions. Augments commands/types AppCommandMap.
 */

import type { AppCommandDef } from '../commands/types'
import type { ArrangeSelectionAlgorithm, ElkLayeredVariant } from '../utils/graph/ElkGraphLayout'

export interface HistoryUndoCommand extends AppCommandDef {
  id: 'history.undo'
}

export interface HistoryRedoCommand extends AppCommandDef {
  id: 'history.redo'
}

export interface DocumentSaveCommand extends AppCommandDef {
  id: 'document.save'
}

export interface DocumentSaveAsCommand extends AppCommandDef {
  id: 'document.saveAs'
}

export interface ConnectionDragCancelCommand extends AppCommandDef {
  id: 'connectionDrag.cancel'
}

export interface GrabMoveCancelCommand extends AppCommandDef {
  id: 'grabMove.cancel'
}

export interface GrabMoveConfirmCommand extends AppCommandDef {
  id: 'grabMove.confirm'
}

export interface GrabMoveLockXCommand extends AppCommandDef {
  id: 'grabMove.lockX'
}

export interface GrabMoveLockYCommand extends AppCommandDef {
  id: 'grabMove.lockY'
}

export interface GrabMoveClearAxisLockCommand extends AppCommandDef {
  id: 'grabMove.clearAxisLock'
}

export interface GrabMoveSwallowCommand extends AppCommandDef {
  id: 'grabMove.swallow'
  hidden: true
}

export interface GrabMoveBeginCommand extends AppCommandDef {
  id: 'grabMove.begin'
}

export interface ResizeCancelCommand extends AppCommandDef {
  id: 'resize.cancel'
}

export interface ResizeConfirmCommand extends AppCommandDef {
  id: 'resize.confirm'
}

export interface ResizeLockTopCommand extends AppCommandDef {
  id: 'resize.lockTop'
}

export interface ResizeLockLeftCommand extends AppCommandDef {
  id: 'resize.lockLeft'
}

export interface ResizeLockBottomCommand extends AppCommandDef {
  id: 'resize.lockBottom'
}

export interface ResizeLockRightCommand extends AppCommandDef {
  id: 'resize.lockRight'
}

export interface ResizeClearSideLockCommand extends AppCommandDef {
  id: 'resize.clearSideLock'
}

export interface ResizeSwallowCommand extends AppCommandDef {
  id: 'resize.swallow'
  hidden: true
}

export interface ResizeBeginCommand extends AppCommandDef {
  id: 'resize.begin'
}

export interface AddNodeFocusCommand extends AppCommandDef {
  id: 'addNode.focus'
}

export interface NodesAddCommand extends AppCommandDef {
  id: 'nodes.add'
  args?: { id: string; type: string; slotName?: string }
}

export interface AddConnectionFocusCommand extends AppCommandDef {
  id: 'addConnection.focus'
}

export interface AddConnectionCreateCommand extends AppCommandDef {
  id: 'addConnection.create'
  args?: { fromId: string; toId: string; pinName: string }
}

export interface AddConnectionPickFromCommand extends AppCommandDef {
  id: 'addConnection.pickFrom'
}

export interface AddConnectionPickToCommand extends AppCommandDef {
  id: 'addConnection.pickTo'
}

export interface SelectionNudgeUpCommand extends AppCommandDef {
  id: 'selection.nudgeUp'
}

export interface SelectionNudgeDownCommand extends AppCommandDef {
  id: 'selection.nudgeDown'
}

export interface SelectionNudgeLeftCommand extends AppCommandDef {
  id: 'selection.nudgeLeft'
}

export interface SelectionNudgeRightCommand extends AppCommandDef {
  id: 'selection.nudgeRight'
}

export interface SelectionDeleteCommand extends AppCommandDef {
  id: 'selection.delete'
}

export interface SelectionCopyCommand extends AppCommandDef {
  id: 'selection.copy'
}

export interface SelectionDeselectAllCommand extends AppCommandDef {
  id: 'selection.deselectAll'
}

export interface SelectionSelectChildrenCommand extends AppCommandDef {
  id: 'selection.selectChildren'
}

export interface NodesPasteCommand extends AppCommandDef {
  id: 'nodes.paste'
}

export interface ArrangeInputsSelectAllCommand extends AppCommandDef {
  id: 'arrangeInputs.selectAll'
}

export interface ArrangeInputsDeselectAllCommand extends AppCommandDef {
  id: 'arrangeInputs.deselectAll'
}

export interface ArrangeInputsToggleCommand extends AppCommandDef {
  id: 'arrangeInputs.toggle'
  args?: { key: string; checked: boolean }
}

export interface ArrangeInputsRunCommand extends AppCommandDef {
  id: 'arrangeInputs.run'
  args?: { margin: number; spacing: number }
}

export interface SelectInputsAddCommand extends AppCommandDef {
  id: 'selectInputs.add'
  args?: { recursive: boolean }
}

export interface ArrangeSelectionRunCommand extends AppCommandDef {
  id: 'arrangeSelection.run'
  args?: {
    algorithm: ArrangeSelectionAlgorithm
    layeredVariant: ElkLayeredVariant
    nodeNodeSpacing: number
    layerSpacing: number
    forceIterations: number
  }
}

export interface AttachHandleCreateCommand extends AppCommandDef {
  id: 'attachHandle.create'
}

export interface AttachHandleClearCommand extends AppCommandDef {
  id: 'attachHandle.clear'
}

export interface AttachHandleDataFromSelectedCommand extends AppCommandDef {
  id: 'attachHandle.dataFromSelected'
}

export interface AttachHandleRunCommand extends AppCommandDef {
  id: 'attachHandle.run'
}

declare module '../commands/types' {
  interface AppCommandMap {
    'history.undo': HistoryUndoCommand
    'history.redo': HistoryRedoCommand
    'document.save': DocumentSaveCommand
    'document.saveAs': DocumentSaveAsCommand
    'connectionDrag.cancel': ConnectionDragCancelCommand
    'grabMove.cancel': GrabMoveCancelCommand
    'grabMove.confirm': GrabMoveConfirmCommand
    'grabMove.lockX': GrabMoveLockXCommand
    'grabMove.lockY': GrabMoveLockYCommand
    'grabMove.clearAxisLock': GrabMoveClearAxisLockCommand
    'grabMove.swallow': GrabMoveSwallowCommand
    'grabMove.begin': GrabMoveBeginCommand
    'resize.cancel': ResizeCancelCommand
    'resize.confirm': ResizeConfirmCommand
    'resize.lockTop': ResizeLockTopCommand
    'resize.lockLeft': ResizeLockLeftCommand
    'resize.lockBottom': ResizeLockBottomCommand
    'resize.lockRight': ResizeLockRightCommand
    'resize.clearSideLock': ResizeClearSideLockCommand
    'resize.swallow': ResizeSwallowCommand
    'resize.begin': ResizeBeginCommand
    'addNode.focus': AddNodeFocusCommand
    'nodes.add': NodesAddCommand
    'addConnection.focus': AddConnectionFocusCommand
    'addConnection.create': AddConnectionCreateCommand
    'addConnection.pickFrom': AddConnectionPickFromCommand
    'addConnection.pickTo': AddConnectionPickToCommand
    'selection.nudgeUp': SelectionNudgeUpCommand
    'selection.nudgeDown': SelectionNudgeDownCommand
    'selection.nudgeLeft': SelectionNudgeLeftCommand
    'selection.nudgeRight': SelectionNudgeRightCommand
    'selection.delete': SelectionDeleteCommand
    'selection.copy': SelectionCopyCommand
    'selection.deselectAll': SelectionDeselectAllCommand
    'selection.selectChildren': SelectionSelectChildrenCommand
    'nodes.paste': NodesPasteCommand
    'arrangeInputs.selectAll': ArrangeInputsSelectAllCommand
    'arrangeInputs.deselectAll': ArrangeInputsDeselectAllCommand
    'arrangeInputs.toggle': ArrangeInputsToggleCommand
    'arrangeInputs.run': ArrangeInputsRunCommand
    'selectInputs.add': SelectInputsAddCommand
    'arrangeSelection.run': ArrangeSelectionRunCommand
    'attachHandle.create': AttachHandleCreateCommand
    'attachHandle.clear': AttachHandleClearCommand
    'attachHandle.dataFromSelected': AttachHandleDataFromSelectedCommand
    'attachHandle.run': AttachHandleRunCommand
  }
}

export type { AppCommand, AppCommandArgs, AppCommandId } from '../commands/types'
