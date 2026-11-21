import { registerGraphView } from '../../../../stores/graphViewRegistry'
import { setWindowStack } from '../../../../stores/windowStacks'
import { createSmRingView } from '../../../views/viewRegistry'
import type { WindowOpenPolicy } from '../types'

export const smRingOpenPolicy: WindowOpenPolicy<'sm-ring'> = {
  reuse: 'none',
  resolvePreview: (_payload, options) => Boolean(options.preview),
  makeId: (payload) => `win_smring_${Date.now()}_${payload.stateMachineNodeId}`,
  title: (payload) => `SM Ring · ${payload.rootLabel}`,
  afterOpen: (win) => {
    const root = createSmRingView({
      stateMachineNodeId: win.payload.stateMachineNodeId,
      label: win.payload.rootLabel,
      projectDiagramId: win.payload.projectDiagramId,
    })
    registerGraphView(root)
    setWindowStack(win.id, [root.id])
  },
}
