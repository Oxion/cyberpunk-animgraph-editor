import type { AppToolHandlers } from '@/core/tools'
import { registerToolHandlers } from '@/core/tools'
import { useAddNodeTool } from '@/composables/tools/useAddNodeTool'
import { Tools } from '../ids'

const addNodeToolHandlers: AppToolHandlers = {
  onActivate: () => {
    useAddNodeTool()
  },
}

export function registerAddNodeToolHandlers(): void {
  registerToolHandlers(Tools.addNode, addNodeToolHandlers)
}
