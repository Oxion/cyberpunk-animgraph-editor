import { ref, watch } from 'vue'
import { windows } from './appWindows'
import { getGraphView } from './graphViewRegistry'
import { getWindowStackTop } from './windowStacks'

export type FocusedDiagramSurface =
  | { kind: 'body' }
  | { kind: 'window'; windowId: string }

/** Which host currently has keyboard focus: body area or a window. */
export const focusedDiagramSurface = ref<FocusedDiagramSurface | null>(null)

/** Last diagram host that had focus — kept when chrome (menu, tools) steals keyboard focus. */
const lastFocusedDiagramSurface = ref<FocusedDiagramSurface | null>(null)

watch(focusedDiagramSurface, (surface) => {
  if (surface) lastFocusedDiagramSurface.value = surface
})

function isStateLinksRootSurface(surface: FocusedDiagramSurface | null): boolean {
  if (surface?.kind !== 'window') return false
  const win = windows.value.find((w) => w.id === surface.windowId)
  if (!win || win.minimized || win.type !== 'state-links') return false
  const topId = getWindowStackTop(surface.windowId)
  return topId != null && getGraphView(topId)?.kind === 'state-links'
}

/**
 * State-links window on its root view: select + open children only (no move/resize/wires).
 */
export function isStateLinksRootViewFocused(): boolean {
  return isStateLinksRootSurface(focusedDiagramSurface.value)
}

/** Same as focused, but still true after focus leaves the window for the menubar / tools. */
export function isStateLinksRootContext(): boolean {
  return isStateLinksRootSurface(focusedDiagramSurface.value ?? lastFocusedDiagramSurface.value)
}
