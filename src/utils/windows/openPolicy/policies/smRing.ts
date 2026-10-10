import type { WindowOpenPolicy } from '../types'

export const smRingOpenPolicy: WindowOpenPolicy<'sm-ring'> = {
  reuse: 'none',
  resolvePreview: (_payload, options) => Boolean(options.preview),
  makeId: (payload) => `win_smring_${Date.now()}_${payload.stateMachineNodeId}`,
  title: (payload) => `SM Ring · ${payload.rootLabel}`,
}
