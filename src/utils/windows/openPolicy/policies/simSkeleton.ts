import { noPreview } from '../helpers'
import type { WindowOpenPolicy } from '../types'

export const simSkeletonOpenPolicy: WindowOpenPolicy<'sim-skeleton'> = {
  reuse: 'singleton',
  resolvePreview: noPreview,
  makeId: () => 'win_sim_skeleton',
  title: () => 'Sim Skeleton',
  minSize: { width: 480, height: 400 },
}
