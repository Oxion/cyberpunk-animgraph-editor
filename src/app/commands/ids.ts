import { AddConnectionCreateCommandId } from '@/app/commands/defs/addConnectionCreate'
import { AddConnectionFocusCommandId } from '@/app/commands/defs/addConnectionFocus'
import { AddConnectionPickFromCommandId } from '@/app/commands/defs/addConnectionPickFrom'
import { AddConnectionPickToCommandId } from '@/app/commands/defs/addConnectionPickTo'
import { AddNodeFocusCommandId } from '@/app/commands/defs/addNodeFocus'
import { ArrangeInputsDeselectAllCommandId } from '@/app/commands/defs/arrangeInputsDeselectAll'
import { ArrangeInputsRunCommandId } from '@/app/commands/defs/arrangeInputsRun'
import { ArrangeInputsSelectAllCommandId } from '@/app/commands/defs/arrangeInputsSelectAll'
import { ArrangeInputsToggleCommandId } from '@/app/commands/defs/arrangeInputsToggle'
import { ArrangeSelectionRunCommandId } from '@/app/commands/defs/arrangeSelectionRun'
import { AttachHandleClearCommandId } from '@/app/commands/defs/attachHandleClear'
import { AttachHandleCreateCommandId } from '@/app/commands/defs/attachHandleCreate'
import { AttachHandleDataFromSelectedCommandId } from '@/app/commands/defs/attachHandleDataFromSelected'
import { AttachHandleRunCommandId } from '@/app/commands/defs/attachHandleRun'
import { ConnectionDragCancelCommandId } from '@/app/commands/defs/connectionDragCancel'
import { DocumentSaveCommandId } from '@/app/commands/defs/documentSave'
import { DocumentSaveAsCommandId } from '@/app/commands/defs/documentSaveAs'
import { GrabMoveBeginCommandId } from '@/app/commands/defs/grabMoveBegin'
import { GrabMoveCancelCommandId } from '@/app/commands/defs/grabMoveCancel'
import { GrabMoveClearAxisLockCommandId } from '@/app/commands/defs/grabMoveClearAxisLock'
import { GrabMoveConfirmCommandId } from '@/app/commands/defs/grabMoveConfirm'
import { GrabMoveLockXCommandId } from '@/app/commands/defs/grabMoveLockX'
import { GrabMoveLockYCommandId } from '@/app/commands/defs/grabMoveLockY'
import { HistoryRedoCommandId } from '@/app/commands/defs/historyRedo'
import { HistoryUndoCommandId } from '@/app/commands/defs/historyUndo'
import { NodesAddCommandId } from '@/app/commands/defs/nodesAdd'
import { NodesPasteCommandId } from '@/app/commands/defs/nodesPaste'
import { ResizeBeginCommandId } from '@/app/commands/defs/resizeBegin'
import { ResizeCancelCommandId } from '@/app/commands/defs/resizeCancel'
import { ResizeClearSideLockCommandId } from '@/app/commands/defs/resizeClearSideLock'
import { ResizeConfirmCommandId } from '@/app/commands/defs/resizeConfirm'
import { ResizeLockBottomCommandId } from '@/app/commands/defs/resizeLockBottom'
import { ResizeLockLeftCommandId } from '@/app/commands/defs/resizeLockLeft'
import { ResizeLockRightCommandId } from '@/app/commands/defs/resizeLockRight'
import { ResizeLockTopCommandId } from '@/app/commands/defs/resizeLockTop'
import { SelectInputsAddCommandId } from '@/app/commands/defs/selectInputsAdd'
import { SelectionCopyCommandId } from '@/app/commands/defs/selectionCopy'
import { SelectionDeleteCommandId } from '@/app/commands/defs/selectionDelete'
import { SelectionDeselectAllCommandId } from '@/app/commands/defs/selectionDeselectAll'
import { SelectionNudgeDownCommandId } from '@/app/commands/defs/selectionNudgeDown'
import { SelectionNudgeLeftCommandId } from '@/app/commands/defs/selectionNudgeLeft'
import { SelectionNudgeRightCommandId } from '@/app/commands/defs/selectionNudgeRight'
import { SelectionNudgeUpCommandId } from '@/app/commands/defs/selectionNudgeUp'
import { SelectionSelectChildrenCommandId } from '@/app/commands/defs/selectionSelectChildren'
import type { AppCommandId } from '@/core/commands/types'

/**
 * Nested by domain; values must stay in sync with AppCommandMap (appCommands/types).
 */
export const Commands = {
  history: {
    undo: HistoryUndoCommandId,
    redo: HistoryRedoCommandId,
  },
  document: {
    save: DocumentSaveCommandId,
    saveAs: DocumentSaveAsCommandId,
  },
  connectionDrag: {
    cancel: ConnectionDragCancelCommandId,
  },
  grabMove: {
    cancel: GrabMoveCancelCommandId,
    confirm: GrabMoveConfirmCommandId,
    lockX: GrabMoveLockXCommandId,
    lockY: GrabMoveLockYCommandId,
    clearAxisLock: GrabMoveClearAxisLockCommandId,
    begin: GrabMoveBeginCommandId,
  },
  resize: {
    cancel: ResizeCancelCommandId,
    confirm: ResizeConfirmCommandId,
    lockTop: ResizeLockTopCommandId,
    lockLeft: ResizeLockLeftCommandId,
    lockBottom: ResizeLockBottomCommandId,
    lockRight: ResizeLockRightCommandId,
    clearSideLock: ResizeClearSideLockCommandId,
    begin: ResizeBeginCommandId,
  },
  addNode: {
    focus: AddNodeFocusCommandId,
  },
  nodes: {
    add: NodesAddCommandId,
    paste: NodesPasteCommandId,
  },
  addConnection: {
    focus: AddConnectionFocusCommandId,
    create: AddConnectionCreateCommandId,
    pickFrom: AddConnectionPickFromCommandId,
    pickTo: AddConnectionPickToCommandId,
  },
  selection: {
    nudgeUp: SelectionNudgeUpCommandId,
    nudgeDown: SelectionNudgeDownCommandId,
    nudgeLeft: SelectionNudgeLeftCommandId,
    nudgeRight: SelectionNudgeRightCommandId,
    delete: SelectionDeleteCommandId,
    copy: SelectionCopyCommandId,
    deselectAll: SelectionDeselectAllCommandId,
    selectChildren: SelectionSelectChildrenCommandId,
  },
  arrangeInputs: {
    selectAll: ArrangeInputsSelectAllCommandId,
    deselectAll: ArrangeInputsDeselectAllCommandId,
    toggle: ArrangeInputsToggleCommandId,
    run: ArrangeInputsRunCommandId,
  },
  selectInputs: {
    add: SelectInputsAddCommandId,
  },
  arrangeSelection: {
    run: ArrangeSelectionRunCommandId,
  },
  attachHandle: {
    create: AttachHandleCreateCommandId,
    clear: AttachHandleClearCommandId,
    dataFromSelected: AttachHandleDataFromSelectedCommandId,
    run: AttachHandleRunCommandId,
  },
} as const satisfies { [group: string]: { [name: string]: AppCommandId } }

type DeepValues<T> = T extends string ? T : { [K in keyof T]: DeepValues<T[K]> }[keyof T]

type CommandConstIds = DeepValues<typeof Commands>
type MissingCommandIds = Exclude<AppCommandId, CommandConstIds>
type ExtraCommandIds = Exclude<CommandConstIds, AppCommandId>

/** Compile-time: every AppCommandId has a Commands.* entry (and no extras). */
type _AssertCommandsComplete = [MissingCommandIds, ExtraCommandIds] extends [never, never]
  ? true
  : { missing: MissingCommandIds; extra: ExtraCommandIds }
const _assertCommandsComplete: _AssertCommandsComplete = true
void _assertCommandsComplete
