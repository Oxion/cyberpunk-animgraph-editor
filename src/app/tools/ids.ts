import type { AppToolId } from '@/core/tools'
import { addConnectionToolId } from './defs/addConnection'
import { addNodeToolId } from './defs/addNode'
import { arrangeInputsToolId } from './defs/arrangeInputs'
import { arrangeSelectionToolId } from './defs/arrangeSelection'
import { attachHandleToolId } from './defs/attachHandle'
import { connectionDragToolId } from './defs/connectionDrag'
import { moveToolId } from './defs/move'
import { nodeNudgeToolId } from './defs/nodeNudge'
import { pasteNodeToolId } from './defs/pasteNode'
import { resizeToolId } from './defs/resize'
import { selectInputsToolId } from './defs/selectInputs'

export const Tools = {
  move: moveToolId,
  resize: resizeToolId,
  addNode: addNodeToolId,
  pasteNode: pasteNodeToolId,
  addConnection: addConnectionToolId,
  attachHandle: attachHandleToolId,
  arrangeInputs: arrangeInputsToolId,
  selectInputs: selectInputsToolId,
  arrangeSelection: arrangeSelectionToolId,
  connectionDrag: connectionDragToolId,
  nodeNudge: nodeNudgeToolId,
} satisfies Record<string, AppToolId>

type ToolsLeaves = {
  [K in keyof typeof Tools]: (typeof Tools)[K]
}[keyof typeof Tools]

type _AssertToolsCoverAppToolId = Exclude<AppToolId, ToolsLeaves> extends never
  ? Exclude<ToolsLeaves, AppToolId> extends never
    ? true
    : never
  : never
const _toolsCoverCheck: _AssertToolsCoverAppToolId = true
void _toolsCoverCheck
