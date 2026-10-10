import type { StateLinksWindowPayload } from '../../../../types/AppWindow'
import { initStateLinksWindowStack } from '../../../../stores/windowStacks'
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
    initStateLinksWindowStack(win.id, {
      stateNodeId: win.payload.stateNodeId,
      label: win.payload.rootLabel,
      stateMachineNodeId: win.payload.stateMachineNodeId,
      projectDiagramId: win.payload.projectDiagramId,
    })
  },
}
