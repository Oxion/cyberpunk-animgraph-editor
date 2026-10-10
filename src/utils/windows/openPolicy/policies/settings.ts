import { noPreview } from '../helpers'
import type { WindowOpenPolicy } from '../types'

export const settingsOpenPolicy: WindowOpenPolicy<'settings'> = {
  reuse: 'singleton',
  resolvePreview: noPreview,
  makeId: () => 'win_settings',
  title: () => 'Settings',
  minSize: { width: 640, height: 440 },
}
