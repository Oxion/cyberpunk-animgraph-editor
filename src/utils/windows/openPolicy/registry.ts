import type { AppWindowType } from '../../../types/AppWindow'
import type { WindowOpenPolicy } from './types'
import { lensOpenPolicy } from './policies/lens'
import { renderStatsOpenPolicy } from './policies/renderStats'
import { settingsOpenPolicy } from './policies/settings'
import { simSkeletonOpenPolicy } from './policies/simSkeleton'
import { simStatusOpenPolicy } from './policies/simStatus'
import { smRingOpenPolicy } from './policies/smRing'
import { stateLinksOpenPolicy } from './policies/stateLinks'

export const windowOpenPolicies: { [K in AppWindowType]: WindowOpenPolicy<K> } = {
  lens: lensOpenPolicy,
  'sm-ring': smRingOpenPolicy,
  'state-links': stateLinksOpenPolicy,
  settings: settingsOpenPolicy,
  'render-stats': renderStatsOpenPolicy,
  'sim-skeleton': simSkeletonOpenPolicy,
  'sim-status': simStatusOpenPolicy,
}

export function getWindowOpenPolicy<T extends AppWindowType>(type: T): WindowOpenPolicy<T> {
  return windowOpenPolicies[type]
}
