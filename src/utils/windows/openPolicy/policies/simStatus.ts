import { noPreview } from '../helpers'
import type { WindowOpenPolicy } from '../types'

export const simStatusOpenPolicy: WindowOpenPolicy<'sim-status'> = {
  reuse: 'singleton',
  resolvePreview: noPreview,
  makeId: () => 'win_sim_status',
  title: () => 'Sim Status',
  minSize: { width: 320, height: 240 },
}
