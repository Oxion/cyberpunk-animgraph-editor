/**
 * Project view session: applies body chrome for explicit intents.
 *
 * Layers:
 * - graphProject — RenderData model only
 * - bodyViews — closable / non-closable / active chrome
 * - bodyContent — hosted view ids per body
 * - graphViewRegistry — GraphViewEntry instances
 * - this module — diagram-root factories + body sync (components own Pixi)
 */
import { clearWindows } from './appWindows'
import {
  activateBodyView,
  replaceNonClosableBodies,
  syncNonClosableBodies,
} from './bodyViews'
import { getBodyContentIds, setBodyContentIds } from './bodyContent'
import { registerGraphView } from './graphViewRegistry'
import { resetDiagramRendererIdAllocator } from './diagramRenderers'
import type { StackableBodyView } from '../types/DiagramBodyView'
import { activeDiagramId, listDiagramIds } from './graphProject'
import { createMainGraphView } from '../utils/views/viewRegistry'

function createDiagramRootChrome(projectDiagramId: string): StackableBodyView {
  return {
    id: projectDiagramId,
    surface: 'stackable',
    closable: false,
    preview: false,
    minimized: false,
  }
}

function ensureDiagramRootContent(projectDiagramId: string) {
  if (getBodyContentIds(projectDiagramId).length > 0) return
  const entry = createMainGraphView(projectDiagramId)
  registerGraphView(entry)
  setBodyContentIds(projectDiagramId, [entry.id])
}

function seedDiagramRootContent(projectDiagramId: string) {
  const entry = createMainGraphView(projectDiagramId)
  registerGraphView(entry)
  setBodyContentIds(projectDiagramId, [entry.id])
}

function resolvePresentDiagramId(preferred?: string | null): string | null {
  const ids = listDiagramIds.value
  if (!ids.length) return null
  if (preferred && ids.includes(preferred)) return preferred
  const active = activeDiagramId.value
  if (active && ids.includes(active)) return active
  return ids[0] ?? null
}

/** Soft sync: one non-closable body per project diagram. */
export function syncProjectDiagramBodies(
  diagramIds: string[],
  preferActiveId?: string | null
) {
  syncNonClosableBodies(
    diagramIds.map((id) => createDiagramRootChrome(id)),
    preferActiveId
  )
  for (const id of diagramIds) ensureDiagramRootContent(id)
}

/** Hard replace diagram-root bodies; drop parallels. */
export function replaceProjectDiagramBodies(
  diagramIds: string[],
  preferActiveId?: string | null
) {
  replaceNonClosableBodies(
    diagramIds.map((id) => createDiagramRootChrome(id)),
    preferActiveId
  )
  for (const id of diagramIds) seedDiagramRootContent(id)
}

/** After setProject / full replace (Open, load project, sample). */
export function presentReplacedProject(preferredDiagramId?: string | null) {
  const diagramId = resolvePresentDiagramId(preferredDiagramId)
  replaceProjectDiagramBodies(listDiagramIds.value, diagramId)
  clearWindows()
  if (diagramId) activateBodyView(diagramId)
}

/** After addDiagram (Add Animgraph into current project). */
export function presentAddedDiagram(diagramId: string) {
  syncProjectDiagramBodies(listDiagramIds.value, diagramId)
  activateBodyView(diagramId)
}

/** Soft switch between already-loaded diagrams (taskbar / body focus). */
export function presentActiveDiagram(diagramId: string) {
  activateBodyView(diagramId)
}

/** After resetProject / close. */
export function presentClosedProject() {
  clearWindows()
  replaceProjectDiagramBodies([], null)
  resetDiagramRendererIdAllocator()
}
