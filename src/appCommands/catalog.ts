import { registerAppCommandCatalog } from '../core/commands/catalog'
import type { AppCommand, AppCommandId } from '../core/commands/types'
import { Commands } from './ids'

const appCommandDefs: Record<AppCommandId, AppCommand> = {
  [Commands.history.undo]: { id: Commands.history.undo, label: 'Undo', group: 'History' },
  [Commands.history.redo]: { id: Commands.history.redo, label: 'Redo', group: 'History' },
  [Commands.document.save]: {
    id: Commands.document.save,
    label: 'Save',
    group: 'File',
    when: 'canSaveProject',
  },
  [Commands.document.saveAs]: {
    id: Commands.document.saveAs,
    label: 'Save As',
    group: 'File',
    when: 'canSaveProject',
  },
  [Commands.connectionDrag.cancel]: {
    id: Commands.connectionDrag.cancel,
    label: 'Cancel Connection Drag',
    group: 'Connection',
    when: 'connectionDragInProgress',
  },
  [Commands.grabMove.cancel]: {
    id: Commands.grabMove.cancel,
    label: 'Cancel Move',
    group: 'Move',
    when: 'moveInProgress',
  },
  [Commands.grabMove.confirm]: {
    id: Commands.grabMove.confirm,
    label: 'Confirm Move',
    group: 'Move',
    when: 'moveInProgress',
  },
  [Commands.grabMove.lockX]: {
    id: Commands.grabMove.lockX,
    label: 'Lock Move Axis X',
    group: 'Move',
    when: 'moveInProgress',
  },
  [Commands.grabMove.lockY]: {
    id: Commands.grabMove.lockY,
    label: 'Lock Move Axis Y',
    group: 'Move',
    when: 'moveInProgress',
  },
  [Commands.grabMove.clearAxisLock]: {
    id: Commands.grabMove.clearAxisLock,
    label: 'Clear Move Axis Lock',
    group: 'Move',
    when: 'moveInProgress',
  },
  [Commands.resize.cancel]: {
    id: Commands.resize.cancel,
    label: 'Cancel Resize',
    group: 'Resize',
    when: 'resizeInProgress',
  },
  [Commands.resize.confirm]: {
    id: Commands.resize.confirm,
    label: 'Confirm Resize',
    group: 'Resize',
    when: 'resizeInProgress',
  },
  [Commands.resize.lockTop]: {
    id: Commands.resize.lockTop,
    label: 'Lock Resize Top (W)',
    group: 'Resize',
    when: 'resizeInProgress',
  },
  [Commands.resize.lockLeft]: {
    id: Commands.resize.lockLeft,
    label: 'Lock Resize Left (A)',
    group: 'Resize',
    when: 'resizeInProgress',
  },
  [Commands.resize.lockBottom]: {
    id: Commands.resize.lockBottom,
    label: 'Lock Resize Bottom (S)',
    group: 'Resize',
    when: 'resizeInProgress',
  },
  [Commands.resize.lockRight]: {
    id: Commands.resize.lockRight,
    label: 'Lock Resize Right (D)',
    group: 'Resize',
    when: 'resizeInProgress',
  },
  [Commands.resize.clearSideLock]: {
    id: Commands.resize.clearSideLock,
    label: 'Clear Resize Side Lock',
    group: 'Resize',
    when: 'resizeInProgress',
  },
  [Commands.grabMove.begin]: {
    id: Commands.grabMove.begin,
    label: 'Begin Move',
    group: 'Move',
    when: 'canBeginGrabMove',
  },
  [Commands.resize.begin]: {
    id: Commands.resize.begin,
    label: 'Begin Resize',
    group: 'Resize',
    when: 'canBeginResize',
  },
  [Commands.addNode.focus]: {
    id: Commands.addNode.focus,
    label: 'Focus Add Node',
    group: 'Add',
    when: 'canFocusAppTool',
  },
  [Commands.nodes.add]: { id: Commands.nodes.add, label: 'Add Node', group: 'Add', when: 'graphEditable' },
  [Commands.addConnection.focus]: {
    id: Commands.addConnection.focus,
    label: 'Focus Add Connection',
    group: 'Add',
    when: 'canFocusAppTool',
  },
  [Commands.addConnection.create]: {
    id: Commands.addConnection.create,
    label: 'Create Connection',
    group: 'Connection',
    when: 'graphEditable',
  },
  [Commands.selection.nudgeUp]: {
    id: Commands.selection.nudgeUp,
    label: 'Nudge Selection Up',
    group: 'Nudge',
    when: 'canNudgeSelection',
  },
  [Commands.selection.nudgeDown]: {
    id: Commands.selection.nudgeDown,
    label: 'Nudge Selection Down',
    group: 'Nudge',
    when: 'canNudgeSelection',
  },
  [Commands.selection.nudgeLeft]: {
    id: Commands.selection.nudgeLeft,
    label: 'Nudge Selection Left',
    group: 'Nudge',
    when: 'canNudgeSelection',
  },
  [Commands.selection.nudgeRight]: {
    id: Commands.selection.nudgeRight,
    label: 'Nudge Selection Right',
    group: 'Nudge',
    when: 'canNudgeSelection',
  },
  [Commands.selection.delete]: {
    id: Commands.selection.delete,
    label: 'Delete Selection',
    group: 'Deletion',
    when: 'canDeleteSelection',
  },
  [Commands.addConnection.pickFrom]: {
    id: Commands.addConnection.pickFrom,
    label: 'Pick Source from Selection',
    group: 'Connection',
    when: 'canPickConnectionEndpoint',
  },
  [Commands.addConnection.pickTo]: {
    id: Commands.addConnection.pickTo,
    label: 'Pick Target from Selection',
    group: 'Connection',
    when: 'canPickConnectionEndpoint',
  },
  [Commands.selection.copy]: {
    id: Commands.selection.copy,
    label: 'Copy Selection',
    group: 'Clipboard',
    when: 'canCopySelection',
  },
  [Commands.selection.deselectAll]: {
    id: Commands.selection.deselectAll,
    label: 'Deselect All',
    group: 'Selection',
    when: 'canDeselectAll',
  },
  [Commands.selection.selectChildren]: {
    id: Commands.selection.selectChildren,
    label: 'Select Children',
    group: 'Selection',
    when: 'canSelectChildren',
  },
  [Commands.nodes.paste]: {
    id: Commands.nodes.paste,
    label: 'Paste Nodes',
    group: 'Clipboard',
    when: 'canPasteNodes',
  },
  [Commands.arrangeInputs.selectAll]: {
    id: Commands.arrangeInputs.selectAll,
    label: 'Select All Incoming',
    group: 'Arrange',
  },
  [Commands.arrangeInputs.deselectAll]: {
    id: Commands.arrangeInputs.deselectAll,
    label: 'Deselect All Incoming',
    group: 'Arrange',
  },
  [Commands.arrangeInputs.toggle]: {
    id: Commands.arrangeInputs.toggle,
    label: 'Toggle Incoming Connection',
    group: 'Arrange',
  },
  [Commands.arrangeInputs.run]: {
    id: Commands.arrangeInputs.run,
    label: 'Arrange Inputs',
    group: 'Arrange',
    when: 'graphEditable',
  },
  [Commands.selectInputs.add]: {
    id: Commands.selectInputs.add,
    label: 'Add Input Nodes to Selection',
    group: 'Selection',
    when: 'graphEditable',
  },
  [Commands.arrangeSelection.run]: {
    id: Commands.arrangeSelection.run,
    label: 'Arrange Selection',
    group: 'Arrange',
    when: 'graphEditable',
  },
  [Commands.attachHandle.create]: {
    id: Commands.attachHandle.create,
    label: 'Create Attach Handle',
    group: 'Add',
  },
  [Commands.attachHandle.clear]: {
    id: Commands.attachHandle.clear,
    label: 'Clear Attach Handle',
    group: 'Add',
  },
  [Commands.attachHandle.dataFromSelected]: {
    id: Commands.attachHandle.dataFromSelected,
    label: 'Attach Data From Selected',
    group: 'Add',
    when: 'graphEditable',
  },
  [Commands.attachHandle.run]: {
    id: Commands.attachHandle.run,
    label: 'Run Attach Handle',
    group: 'Add',
    when: 'graphEditable',
  },
}

export function registerAppCommandDefs(): void {
  registerAppCommandCatalog(appCommandDefs)
}
