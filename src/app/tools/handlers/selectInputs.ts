import type { AppToolHandlers } from '@/core/tools'
import { registerToolHandlers } from '@/core/tools'
import { useSelectInputsTool } from '@/composables/tools/useSelectInputsTool'
import { Tools } from '../ids'

const selectInputsToolHandlers: AppToolHandlers = {
  onActivate: () => {
    useSelectInputsTool()
  },
}

export function registerSelectInputsToolHandlers(): void {
  registerToolHandlers(Tools.selectInputs, selectInputsToolHandlers)
}
