import type { AppToolHandlers } from '@/core/tools'
import { registerToolHandlers } from '@/core/tools'
import { usePasteNodeTool } from '@/composables/tools/usePasteNodeTool'
import { Tools } from '../ids'

const pasteNodeToolHandlers: AppToolHandlers = {
  onActivate: () => {
    usePasteNodeTool()
  },
}

export function registerPasteNodeToolHandlers(): void {
  registerToolHandlers(Tools.pasteNode, pasteNodeToolHandlers)
}
