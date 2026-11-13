import type { AppTool, AppToolId } from '@/core/tools'
import { registerAppToolCatalog } from '@/core/tools'
import { addConnectionToolDef } from './defs/addConnection'
import { addNodeToolDef } from './defs/addNode'
import { arrangeInputsToolDef } from './defs/arrangeInputs'
import { arrangeSelectionToolDef } from './defs/arrangeSelection'
import { attachHandleToolDef } from './defs/attachHandle'
import { connectionDragToolDef } from './defs/connectionDrag'
import { moveToolDef } from './defs/move'
import { nodeNudgeToolDef } from './defs/nodeNudge'
import { pasteNodeToolDef } from './defs/pasteNode'
import { resizeToolDef } from './defs/resize'
import { selectInputsToolDef } from './defs/selectInputs'

const appToolCatalog = {
  [moveToolDef.id]: moveToolDef,
  [resizeToolDef.id]: resizeToolDef,
  [addNodeToolDef.id]: addNodeToolDef,
  [pasteNodeToolDef.id]: pasteNodeToolDef,
  [addConnectionToolDef.id]: addConnectionToolDef,
  [attachHandleToolDef.id]: attachHandleToolDef,
  [arrangeInputsToolDef.id]: arrangeInputsToolDef,
  [selectInputsToolDef.id]: selectInputsToolDef,
  [arrangeSelectionToolDef.id]: arrangeSelectionToolDef,
  [connectionDragToolDef.id]: connectionDragToolDef,
  [nodeNudgeToolDef.id]: nodeNudgeToolDef,
} as const satisfies Record<AppToolId, AppTool>

export function registerAppToolDefs(): void {
  registerAppToolCatalog(appToolCatalog as Record<AppToolId, AppTool>)
}
