import { addConnectionCreateCommandDef } from '@/app/commands/defs/addConnectionCreate'
import { addConnectionFocusCommandDef } from '@/app/commands/defs/addConnectionFocus'
import { addConnectionPickFromCommandDef } from '@/app/commands/defs/addConnectionPickFrom'
import { addConnectionPickToCommandDef } from '@/app/commands/defs/addConnectionPickTo'
import { addNodeFocusCommandDef } from '@/app/commands/defs/addNodeFocus'
import { arrangeInputsDeselectAllCommandDef } from '@/app/commands/defs/arrangeInputsDeselectAll'
import { arrangeInputsRunCommandDef } from '@/app/commands/defs/arrangeInputsRun'
import { arrangeInputsSelectAllCommandDef } from '@/app/commands/defs/arrangeInputsSelectAll'
import { arrangeInputsToggleCommandDef } from '@/app/commands/defs/arrangeInputsToggle'
import { arrangeSelectionRunCommandDef } from '@/app/commands/defs/arrangeSelectionRun'
import { attachHandleClearCommandDef } from '@/app/commands/defs/attachHandleClear'
import { attachHandleCreateCommandDef } from '@/app/commands/defs/attachHandleCreate'
import { attachHandleDataFromSelectedCommandDef } from '@/app/commands/defs/attachHandleDataFromSelected'
import { attachHandleRunCommandDef } from '@/app/commands/defs/attachHandleRun'
import { connectionDragCancelCommandDef } from '@/app/commands/defs/connectionDragCancel'
import { documentSaveCommandDef } from '@/app/commands/defs/documentSave'
import { documentSaveAsCommandDef } from '@/app/commands/defs/documentSaveAs'
import { grabMoveBeginCommandDef } from '@/app/commands/defs/grabMoveBegin'
import { grabMoveCancelCommandDef } from '@/app/commands/defs/grabMoveCancel'
import { grabMoveClearAxisLockCommandDef } from '@/app/commands/defs/grabMoveClearAxisLock'
import { grabMoveConfirmCommandDef } from '@/app/commands/defs/grabMoveConfirm'
import { grabMoveLockXCommandDef } from '@/app/commands/defs/grabMoveLockX'
import { grabMoveLockYCommandDef } from '@/app/commands/defs/grabMoveLockY'
import { historyRedoCommandDef } from '@/app/commands/defs/historyRedo'
import { historyUndoCommandDef } from '@/app/commands/defs/historyUndo'
import { nodesAddCommandDef } from '@/app/commands/defs/nodesAdd'
import { nodesPasteCommandDef } from '@/app/commands/defs/nodesPaste'
import { resizeBeginCommandDef } from '@/app/commands/defs/resizeBegin'
import { resizeCancelCommandDef } from '@/app/commands/defs/resizeCancel'
import { resizeClearSideLockCommandDef } from '@/app/commands/defs/resizeClearSideLock'
import { resizeConfirmCommandDef } from '@/app/commands/defs/resizeConfirm'
import { resizeLockBottomCommandDef } from '@/app/commands/defs/resizeLockBottom'
import { resizeLockLeftCommandDef } from '@/app/commands/defs/resizeLockLeft'
import { resizeLockRightCommandDef } from '@/app/commands/defs/resizeLockRight'
import { resizeLockTopCommandDef } from '@/app/commands/defs/resizeLockTop'
import { selectInputsAddCommandDef } from '@/app/commands/defs/selectInputsAdd'
import { selectionCopyCommandDef } from '@/app/commands/defs/selectionCopy'
import { selectionDeleteCommandDef } from '@/app/commands/defs/selectionDelete'
import { selectionDeselectAllCommandDef } from '@/app/commands/defs/selectionDeselectAll'
import { selectionNudgeDownCommandDef } from '@/app/commands/defs/selectionNudgeDown'
import { selectionNudgeLeftCommandDef } from '@/app/commands/defs/selectionNudgeLeft'
import { selectionNudgeRightCommandDef } from '@/app/commands/defs/selectionNudgeRight'
import { selectionNudgeUpCommandDef } from '@/app/commands/defs/selectionNudgeUp'
import { selectionSelectChildrenCommandDef } from '@/app/commands/defs/selectionSelectChildren'
import { registerAppCommandCatalog } from '@/core/commands/catalog'
import type { AppCommand, AppCommandId } from '@/core/commands/types'
import { Commands } from './ids'

const appCommandDefs: Record<AppCommandId, AppCommand> = {
  [Commands.history.undo]: historyUndoCommandDef,
  [Commands.history.redo]: historyRedoCommandDef,

  [Commands.document.save]: documentSaveCommandDef,
  [Commands.document.saveAs]: documentSaveAsCommandDef,

  [Commands.connectionDrag.cancel]: connectionDragCancelCommandDef,

  [Commands.grabMove.cancel]: grabMoveCancelCommandDef,
  [Commands.grabMove.confirm]: grabMoveConfirmCommandDef,
  [Commands.grabMove.lockX]: grabMoveLockXCommandDef,
  [Commands.grabMove.lockY]: grabMoveLockYCommandDef,
  [Commands.grabMove.clearAxisLock]: grabMoveClearAxisLockCommandDef,
  [Commands.grabMove.begin]: grabMoveBeginCommandDef,

  [Commands.resize.cancel]: resizeCancelCommandDef,
  [Commands.resize.confirm]: resizeConfirmCommandDef,
  [Commands.resize.lockTop]: resizeLockTopCommandDef,
  [Commands.resize.lockLeft]: resizeLockLeftCommandDef,
  [Commands.resize.lockBottom]: resizeLockBottomCommandDef,
  [Commands.resize.lockRight]: resizeLockRightCommandDef,
  [Commands.resize.clearSideLock]: resizeClearSideLockCommandDef,
  [Commands.resize.begin]: resizeBeginCommandDef,
  
  [Commands.addNode.focus]: addNodeFocusCommandDef,

  [Commands.nodes.add]: nodesAddCommandDef,
  [Commands.nodes.paste]: nodesPasteCommandDef,

  [Commands.addConnection.focus]: addConnectionFocusCommandDef,
  [Commands.addConnection.create]: addConnectionCreateCommandDef,
  [Commands.addConnection.pickFrom]: addConnectionPickFromCommandDef,
  [Commands.addConnection.pickTo]: addConnectionPickToCommandDef,

  [Commands.selection.nudgeUp]: selectionNudgeUpCommandDef,
  [Commands.selection.nudgeDown]: selectionNudgeDownCommandDef,
  [Commands.selection.nudgeLeft]: selectionNudgeLeftCommandDef,
  [Commands.selection.nudgeRight]: selectionNudgeRightCommandDef,
  [Commands.selection.delete]: selectionDeleteCommandDef,
  [Commands.selection.copy]: selectionCopyCommandDef,
  [Commands.selection.deselectAll]: selectionDeselectAllCommandDef,
  [Commands.selection.selectChildren]: selectionSelectChildrenCommandDef,
  
  [Commands.arrangeInputs.selectAll]: arrangeInputsSelectAllCommandDef,
  [Commands.arrangeInputs.deselectAll]: arrangeInputsDeselectAllCommandDef,
  [Commands.arrangeInputs.toggle]: arrangeInputsToggleCommandDef,
  [Commands.arrangeInputs.run]: arrangeInputsRunCommandDef,

  [Commands.selectInputs.add]: selectInputsAddCommandDef,

  [Commands.arrangeSelection.run]: arrangeSelectionRunCommandDef,

  [Commands.attachHandle.create]: attachHandleCreateCommandDef,
  [Commands.attachHandle.clear]: attachHandleClearCommandDef,
  [Commands.attachHandle.dataFromSelected]: attachHandleDataFromSelectedCommandDef,
  [Commands.attachHandle.run]: attachHandleRunCommandDef,
}

export function registerAppCommandDefs(): void {
  registerAppCommandCatalog(appCommandDefs)
}
