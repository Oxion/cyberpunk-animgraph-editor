import type { RenderStatsWindowPayload } from '../../../../types/AppWindow'
import { noPreview } from '../helpers'
import type { WindowOpenPolicy } from '../types'

export function renderStatsWindowTitle(payload: RenderStatsWindowPayload): string {
  return `Render Stats · ${payload.label}`
}

export const renderStatsOpenPolicy: WindowOpenPolicy<'render-stats'> = {
  reuse: 'match',
  matchExisting: (win, payload) =>
    win.payload.source === payload.source && win.payload.sourceId === payload.sourceId,
  resolvePreview: noPreview,
  makeId: (payload) => `win_render_stats_${payload.source}_${payload.sourceId}`,
  title: renderStatsWindowTitle,
  minSize: { width: 320, height: 180 },
  autoSize: true,
}
