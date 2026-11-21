import type { StateLinksWindowPayload } from '../../../../types/AppWindow'
import { registerGraphView } from '../../../../stores/graphViewRegistry'
import { setWindowStack } from '../../../../stores/windowStacks'
import { createStateLinksView } from '../../../views/viewRegistry'
import type { WindowOpenPolicy } from '../types'

export function stateLinksWindowTitle(
  payload: StateLinksWindowPayload,
  preview: boolean
): string {
  const label = payload.rootLabel
  return preview ? `Preview · ${label}` : label
}

export const stateLinksOpenPolicy: WindowOpenPolicy<'state-links'> = {
  reuse: 'preview',
  resolvePreview: (_payload, options) => options.preview !== false,
  makeId: (payload) => `win_statelinks_${Date.now()}_${payload.stateNodeId}`,
  title: stateLinksWindowTitle,
  afterOpen: (win) => {
    const root = createStateLinksView({
      stateNodeId: win.payload.stateNodeId,
      label: win.payload.rootLabel,
      stateMachineNodeId: win.payload.stateMachineNodeId,
      projectDiagramId: win.payload.projectDiagramId,
    })
    registerGraphView(root)
    setWindowStack(win.id, [root.id])
  },
}
