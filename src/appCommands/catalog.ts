import type { AppCommand, AppCommandId } from '../commands/types'
import { registerAppCommandCatalog } from '../commands/catalog'

const appCommandDefs: Record<AppCommandId, AppCommand> = {
  'history.undo': { id: 'history.undo', label: 'Undo', group: 'History' },
  'history.redo': { id: 'history.redo', label: 'Redo', group: 'History' },
  'document.save': { id: 'document.save', label: 'Save', group: 'File', when: 'canSaveProject' },
  'document.saveAs': { id: 'document.saveAs', label: 'Save As', group: 'File', when: 'canSaveProject' },
  'connectionDrag.cancel': {
    id: 'connectionDrag.cancel',
    label: 'Cancel Connection Drag',
    group: 'Connection',
    when: 'connectionDragInProgress',
  },
  'grabMove.cancel': { id: 'grabMove.cancel', label: 'Cancel Move', group: 'Move', when: 'moveInProgress' },
  'grabMove.confirm': { id: 'grabMove.confirm', label: 'Confirm Move', group: 'Move', when: 'moveInProgress' },
  'grabMove.lockX': { id: 'grabMove.lockX', label: 'Lock Move Axis X', group: 'Move', when: 'moveInProgress' },
  'grabMove.lockY': { id: 'grabMove.lockY', label: 'Lock Move Axis Y', group: 'Move', when: 'moveInProgress' },
  'grabMove.swallow': {
    id: 'grabMove.swallow',
    label: 'Swallow G during Move',
    group: 'Move',
    hidden: true,
    when: 'moveInProgress',
  },
  'resize.cancel': { id: 'resize.cancel', label: 'Cancel Resize', group: 'Resize', when: 'resizeInProgress' },
  'resize.confirm': { id: 'resize.confirm', label: 'Confirm Resize', group: 'Resize', when: 'resizeInProgress' },
  'resize.lockTop': { id: 'resize.lockTop', label: 'Lock Resize Top (W)', group: 'Resize', when: 'resizeInProgress' },
  'resize.lockLeft': { id: 'resize.lockLeft', label: 'Lock Resize Left (A)', group: 'Resize', when: 'resizeInProgress' },
  'resize.lockBottom': { id: 'resize.lockBottom', label: 'Lock Resize Bottom (S)', group: 'Resize', when: 'resizeInProgress' },
  'resize.lockRight': { id: 'resize.lockRight', label: 'Lock Resize Right (D)', group: 'Resize', when: 'resizeInProgress' },
  'resize.swallow': {
    id: 'resize.swallow',
    label: 'Swallow G during Resize',
    group: 'Resize',
    hidden: true,
    when: 'resizeInProgress',
  },
  'grabMove.begin': { id: 'grabMove.begin', label: 'Begin Move', group: 'Move', when: 'canBeginGrabMove' },
  'resize.begin': { id: 'resize.begin', label: 'Begin Resize', group: 'Resize', when: 'canBeginResize' },
  'addNode.focus': { id: 'addNode.focus', label: 'Focus Add Node', group: 'Add', when: 'canFocusAppTool' },
  'addConnection.focus': {
    id: 'addConnection.focus',
    label: 'Focus Add Connection',
    group: 'Add',
    when: 'canFocusAppTool',
  },
  'selection.nudgeUp': { id: 'selection.nudgeUp', label: 'Nudge Selection Up', group: 'Nudge', when: 'canNudgeSelection' },
  'selection.nudgeDown': {
    id: 'selection.nudgeDown',
    label: 'Nudge Selection Down',
    group: 'Nudge',
    when: 'canNudgeSelection',
  },
  'selection.nudgeLeft': {
    id: 'selection.nudgeLeft',
    label: 'Nudge Selection Left',
    group: 'Nudge',
    when: 'canNudgeSelection',
  },
  'selection.nudgeRight': {
    id: 'selection.nudgeRight',
    label: 'Nudge Selection Right',
    group: 'Nudge',
    when: 'canNudgeSelection',
  },
  'selection.delete': {
    id: 'selection.delete',
    label: 'Delete Selection',
    group: 'Deletion',
    when: 'canDeleteSelection',
  },
  'addConnection.pickFrom': {
    id: 'addConnection.pickFrom',
    label: 'Pick Source from Selection',
    group: 'Connection',
    when: 'canPickConnectionEndpoint',
  },
  'addConnection.pickTo': {
    id: 'addConnection.pickTo',
    label: 'Pick Target from Selection',
    group: 'Connection',
    when: 'canPickConnectionEndpoint',
  },
  'selection.copy': { id: 'selection.copy', label: 'Copy Selection', group: 'Clipboard', when: 'canCopySelection' },
  'selection.deselectAll': {
    id: 'selection.deselectAll',
    label: 'Deselect All',
    group: 'Selection',
    when: 'canDeselectAll',
  },
  'selection.selectChildren': {
    id: 'selection.selectChildren',
    label: 'Select Children',
    group: 'Selection',
    when: 'canSelectChildren',
  },
  'nodes.paste': { id: 'nodes.paste', label: 'Paste Nodes', group: 'Clipboard', when: 'canPasteNodes' },
}

export function registerAppCommandDefs(): void {
  registerAppCommandCatalog(appCommandDefs)
}
