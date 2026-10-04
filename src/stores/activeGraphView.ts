import type { GraphViewEntry } from '../types/GraphView'
import { type DiagramBodyView } from '../types/DiagramBodyView'
import { activeBodyView, currentView, MAIN_BODY_ID } from './bodyViews'

/** Top view of the active body surface. */
export function getActiveGraphView(): GraphViewEntry | null {
  return currentView.value ?? null
}

export function getActiveBodyView(): DiagramBodyView | null {
  return activeBodyView.value ?? null
}

export { MAIN_BODY_ID }
