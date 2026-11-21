import { computed, ref } from 'vue'
import { currentView } from './activeGraphView'
import { bodyContentRoot } from './bodyContent'
import { bodyViews } from './bodyViews'
import { hasProject } from './graphProject'

/** View ids that have reported ready (and are still registered). */
const readyViewIds = new Set<string>()
const readyViewIdsRev = ref(0)

function bumpReadyViewIds() {
  readyViewIdsRev.value += 1
}

/** Called when a diagram view surface finishes mounting Pixi / chrome. */
export function markDiagramViewReady(id: string) {
  if (readyViewIds.has(id)) return
  readyViewIds.add(id)
  bumpReadyViewIds()
}

/** Called when a diagram view unregisters / unmounts. */
export function clearDiagramViewReady(id: string) {
  if (!readyViewIds.delete(id)) return
  bumpReadyViewIds()
}

function rootMainViewIdForDiagram(projectDiagramId: string): string | null {
  const root = bodyViews.value.find((v) => !v.closable && v.id === projectDiagramId)
  if (!root) return null
  return bodyContentRoot(root.id) ?? null
}

/**
 * Body loading overlay gate: project is open and the active diagram's root
 * main surface (or the current top, if it reports ready) is ready.
 * Derived — do not assign.
 */
export const diagramViewReadyRef = computed(() => {
  void readyViewIdsRev.value
  if (!hasProject.value) return false
  const top = currentView.value
  if (!top) return false
  if (readyViewIds.has(top.id)) return true
  // Non-Pixi tops (sm-ring) do not gate the body overlay.
  if (top.kind === 'sm-ring') return true
  // Stacked lenses keep the diagram-root main mounted; overlay clears once that main is ready.
  const rootMainId = rootMainViewIdForDiagram(top.projectDiagramId)
  return rootMainId != null && readyViewIds.has(rootMainId)
})
