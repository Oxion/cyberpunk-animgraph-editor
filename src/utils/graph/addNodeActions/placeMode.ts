import type { PlaceInParentMode } from './types'

/** Default: link under parent using position from the diagram builder (Add Node, paste, …). */
export function resolvePlaceInParentMode(): PlaceInParentMode {
  return 'preserve-position'
}
