import type { LensWindowPayload } from '../../../../types/AppWindow'
import { registerGraphView } from '../../../../stores/graphViewRegistry'
import { setWindowStack } from '../../../../stores/windowStacks'
import { createGraphScopeView } from '../../../views/viewRegistry'
import type { WindowOpenPolicy } from '../types'

export function lensWindowTitle(payload: LensWindowPayload, preview: boolean): string {
  const prefix = payload.quickLens ? 'Quick Lens' : preview ? 'Preview Lens' : 'Lens'
  return `${prefix} · ${payload.rootLabel}`
}

export const lensOpenPolicy: WindowOpenPolicy<'lens'> = {
  reuse: 'preview',
  resolvePreview: (payload, options) => Boolean(options.preview ?? payload.quickLens),
  makeId: (payload) => `win_lens_${Date.now()}_${payload.rootNodeId}`,
  title: lensWindowTitle,
  afterOpen: (win) => {
    const root = createGraphScopeView({
      scopeRootId: win.payload.rootNodeId,
      label: win.payload.rootLabel,
      hideScopeRoot: win.payload.hideScopeRoot,
      projectDiagramId: win.payload.projectDiagramId,
    })
    registerGraphView(root)
    setWindowStack(win.id, [root.id])
  },
}
