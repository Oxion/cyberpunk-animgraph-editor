import type { AppToolHandlers } from '@/core/tools'
import { registerToolHandlers } from '@/core/tools'
import { useArrangeInputsTool } from '@/composables/tools/useArrangeInputsTool'
import { Tools } from '../ids'

const arrangeInputsToolHandlers: AppToolHandlers = {
  onActivate: () => {
    useArrangeInputsTool()
  },
}

export function registerArrangeInputsToolHandlers(): void {
  registerToolHandlers(Tools.arrangeInputs, arrangeInputsToolHandlers)
}
