import type { AppToolHandlers } from '@/core/tools'
import { registerToolHandlers } from '@/core/tools'
import { useAttachHandleTool } from '@/composables/tools/useAttachHandleTool'
import { Tools } from '../ids'

const attachHandleToolHandlers: AppToolHandlers = {
  onActivate: () => {
    useAttachHandleTool()
  },
}

export function registerAttachHandleToolHandlers(): void {
  registerToolHandlers(Tools.attachHandle, attachHandleToolHandlers)
}
