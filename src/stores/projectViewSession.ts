/**
 * Project view session: applies body chrome + mount for explicit intents.
 *
 * Layers:
 * - graphProject — RenderData model only
 * - bodyViews — diagram body / stack chrome
 * - useMainDiagramMount — Pixi mount / suspend / teardown
 * - this module — intent → chrome + mount (no IO, no App watchers)
 */
import { nextTick } from 'vue'
import { clearWindows } from './appWindows'
import {
  replaceProjectDiagramBodies,
  syncProjectDiagramBodies,
} from './bodyViews'
import { activeDiagramId, listDiagramIds } from './graphProject'
import {
  remountProject,
  softActivateDiagram,
  teardownProjectView,
} from '../composables/useMainDiagramMount'

function resolvePresentDiagramId(preferred?: string | null): string | null {
  const ids = listDiagramIds.value
  if (!ids.length) return null
  if (preferred && ids.includes(preferred)) return preferred
  const active = activeDiagramId.value
  if (active && ids.includes(active)) return active
  return ids[0] ?? null
}

/** After setProject / full replace (Open, load project, sample). */
export function presentReplacedProject(preferredDiagramId?: string | null) {
  const diagramId = resolvePresentDiagramId(preferredDiagramId)
  replaceProjectDiagramBodies(listDiagramIds.value, diagramId)
  clearWindows()
  if (!diagramId) {
    teardownProjectView()
    return
  }
  remountProject(diagramId)
}

/** After addDiagram (Add Animgraph into current project). */
export function presentAddedDiagram(diagramId: string) {
  syncProjectDiagramBodies(listDiagramIds.value, diagramId)
  void nextTick(() => {
    softActivateDiagram(diagramId)
  })
}

/** Soft switch between already-loaded diagrams (taskbar / body focus). */
export function presentActiveDiagram(diagramId: string) {
  softActivateDiagram(diagramId)
}

/** After resetProject / close. */
export function presentClosedProject() {
  clearWindows()
  replaceProjectDiagramBodies([], null)
  teardownProjectView()
}
