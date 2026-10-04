import { useAddNodeTool } from '../composables/tools/useAddNodeTool'
import { useAttachHandleTool } from '../composables/tools/useAttachHandleTool'
import { useCreateConnectionTool } from '../composables/tools/useCreateConnectionTool'
import { useMoveTool } from '../composables/tools/useMoveTool'
import { usePasteNodeTool } from '../composables/tools/usePasteNodeTool'
import { useResizeTool } from '../composables/tools/useResizeTool'
import { registerToolRunner } from './toolManager'
import { useArrangeInputsTool } from '../composables/tools/useArrangeInputsTool'
import { useArrangeSelectionTool } from '../composables/tools/useArrangeSelectionTool'
import { useSelectInputsTool } from '../composables/tools/useSelectInputsTool'

/**
 * Register app tool scope runners. Each `use*Tool()` runs only while that
 * tool is active — cache computeds/watchers are scoped, not always-on.
 * Idempotent: safe to call again after HMR reloads `toolManager`.
 */
export function registerAllToolRunners(): void {
  registerToolRunner('addNode', () => {
    useAddNodeTool()
  })
  registerToolRunner('move', () => {
    useMoveTool()
  })
  registerToolRunner('resize', () => {
    useResizeTool()
  })
  registerToolRunner('arrangeInputs', () => {
    useArrangeInputsTool()
  })
  registerToolRunner('arrangeSelection', () => {
    useArrangeSelectionTool()
  })
  registerToolRunner('selectInputs', () => {
    useSelectInputsTool()
  })
  registerToolRunner('pasteNode', () => {
    usePasteNodeTool()
  })
  registerToolRunner('addConnection', () => {
    useCreateConnectionTool()
  })
  registerToolRunner('attachHandle', () => {
    useAttachHandleTool()
  })
}
