import './types'
import type { AppCommandId } from '../commands/types'

/**
 * Canonical command id constants — use these instead of inline strings.
 * Nested by domain; values must stay in sync with AppCommandMap (appCommands/types).
 */
export const Commands = {
  history: {
    undo: 'history.undo',
    redo: 'history.redo',
  },
  document: {
    save: 'document.save',
    saveAs: 'document.saveAs',
  },
  connectionDrag: {
    cancel: 'connectionDrag.cancel',
  },
  grabMove: {
    cancel: 'grabMove.cancel',
    confirm: 'grabMove.confirm',
    lockX: 'grabMove.lockX',
    lockY: 'grabMove.lockY',
    clearAxisLock: 'grabMove.clearAxisLock',
    swallow: 'grabMove.swallow',
    begin: 'grabMove.begin',
  },
  resize: {
    cancel: 'resize.cancel',
    confirm: 'resize.confirm',
    lockTop: 'resize.lockTop',
    lockLeft: 'resize.lockLeft',
    lockBottom: 'resize.lockBottom',
    lockRight: 'resize.lockRight',
    clearSideLock: 'resize.clearSideLock',
    swallow: 'resize.swallow',
    begin: 'resize.begin',
  },
  addNode: {
    focus: 'addNode.focus',
  },
  nodes: {
    add: 'nodes.add',
    paste: 'nodes.paste',
  },
  addConnection: {
    focus: 'addConnection.focus',
    create: 'addConnection.create',
    pickFrom: 'addConnection.pickFrom',
    pickTo: 'addConnection.pickTo',
  },
  selection: {
    nudgeUp: 'selection.nudgeUp',
    nudgeDown: 'selection.nudgeDown',
    nudgeLeft: 'selection.nudgeLeft',
    nudgeRight: 'selection.nudgeRight',
    delete: 'selection.delete',
    copy: 'selection.copy',
    deselectAll: 'selection.deselectAll',
    selectChildren: 'selection.selectChildren',
  },
  arrangeInputs: {
    selectAll: 'arrangeInputs.selectAll',
    deselectAll: 'arrangeInputs.deselectAll',
    toggle: 'arrangeInputs.toggle',
    run: 'arrangeInputs.run',
  },
  selectInputs: {
    add: 'selectInputs.add',
  },
  arrangeSelection: {
    run: 'arrangeSelection.run',
  },
  attachHandle: {
    create: 'attachHandle.create',
    clear: 'attachHandle.clear',
    dataFromSelected: 'attachHandle.dataFromSelected',
    run: 'attachHandle.run',
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
