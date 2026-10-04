/**
 * App command catalog — extend AppCommandMap to add commands.
 * Values extend AppCommandDef; `id` literal matches the key.
 */

/** Shape registered in AppCommandMap. `id` is `string` here; each map value narrows it to the key. */
export interface AppCommandDef {
  id: string
  label: string
  /** Settings section name (e.g. History, Move). Omit → Other. */
  group?: string
  /** Hide from Settings / palette (swallow keys, etc.). */
  hidden?: boolean
  /** Named when-predicate (VS Code command precondition). Omit = always. */
  when?: string
}

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

export interface AddConnectionFocusCommand extends AppCommandDef {
  id: 'addConnection.focus'
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

/** Id → def. Extend this map to add commands. */
export interface AppCommandMap {
  'history.undo': HistoryUndoCommand
  'history.redo': HistoryRedoCommand
  'document.save': DocumentSaveCommand
  'document.saveAs': DocumentSaveAsCommand
  'connectionDrag.cancel': ConnectionDragCancelCommand
  'grabMove.cancel': GrabMoveCancelCommand
  'grabMove.confirm': GrabMoveConfirmCommand
  'grabMove.lockX': GrabMoveLockXCommand
  'grabMove.lockY': GrabMoveLockYCommand
  'grabMove.swallow': GrabMoveSwallowCommand
  'grabMove.begin': GrabMoveBeginCommand
  'resize.cancel': ResizeCancelCommand
  'resize.confirm': ResizeConfirmCommand
  'resize.lockTop': ResizeLockTopCommand
  'resize.lockLeft': ResizeLockLeftCommand
  'resize.lockBottom': ResizeLockBottomCommand
  'resize.lockRight': ResizeLockRightCommand
  'resize.swallow': ResizeSwallowCommand
  'resize.begin': ResizeBeginCommand
  'addNode.focus': AddNodeFocusCommand
  'addConnection.focus': AddConnectionFocusCommand
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
}

export type AppCommandId = keyof AppCommandMap
export type AppCommand = AppCommandMap[AppCommandId]
