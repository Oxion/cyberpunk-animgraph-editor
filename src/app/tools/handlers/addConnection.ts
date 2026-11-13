import type { AppToolHandlers } from '@/core/tools'
import { registerToolHandlers } from '@/core/tools'
import { useCreateConnectionTool } from '@/composables/tools/useCreateConnectionTool'
import { Tools } from '../ids'

const addConnectionToolHandlers: AppToolHandlers = {
  onActivate: () => {
    useCreateConnectionTool()
  },
}

export function registerAddConnectionToolHandlers(): void {
  registerToolHandlers(Tools.addConnection, addConnectionToolHandlers)
}
