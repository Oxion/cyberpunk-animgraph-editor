import type { AppToolHandlers } from '@/core/tools'
import { registerToolHandlers } from '@/core/tools'
import { useArrangeSelectionTool } from '@/composables/tools/useArrangeSelectionTool'
import { Tools } from '../ids'

const arrangeSelectionToolHandlers: AppToolHandlers = {
  onActivate: () => {
    useArrangeSelectionTool()
  },
}

export function registerArrangeSelectionToolHandlers(): void {
  registerToolHandlers(Tools.arrangeSelection, arrangeSelectionToolHandlers)
}
