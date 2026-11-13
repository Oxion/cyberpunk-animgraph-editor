import type { AppToolHandlers } from '@/core/tools'
import { registerToolHandlers } from '@/core/tools'
import { getActiveDiagramRenderer } from '@/stores/diagramRenderers'
import { Tools } from '../ids'

const connectionDragToolHandlers: AppToolHandlers = {
  onSessionEnd: () => {
    // Pipeline preempt/cancel: tear down renderer without re-entering notify.
    getActiveDiagramRenderer()?.abortPinDrag({ notify: false })
  },
}

export function registerConnectionDragToolHandlers(): void {
  registerToolHandlers(Tools.connectionDrag, connectionDragToolHandlers)
}
