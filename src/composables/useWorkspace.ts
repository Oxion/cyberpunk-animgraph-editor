import { watch } from 'vue'
import {
  activateBodyView,
  activeBodyViewId,
  bodyBelongsToDiagram,
  bodyViewRoot,
  bodyViews,
} from '../stores/bodyViews'
import {
  activeDiagramId,
  hasDiagramId,
  setActiveDiagramId,
} from '../stores/graphProject'
import { presentActiveDiagram } from '../stores/projectViewSession'

/**
 * @TODO it can't be composable, because it can be reused, but it interlinks 2 modules, repeated use will lead to repeated effects.
 * Pairs active diagram with active body.
 * Structural body sync / mount is owned by projectViewSession (explicit intents).
 */
export function useWorkspace() {
  watch(activeDiagramId, (diagramId) => {
    if (!diagramId) return
    const current = bodyViews.value.find((v) => v.id === activeBodyViewId.value)
    if (current && bodyBelongsToDiagram(current, diagramId)) return
    const root = bodyViews.value.find((v) => !v.closable && v.id === diagramId)
    if (!root) return
    activateBodyView(root.id)
  })

  watch(activeBodyViewId, (bodyId) => {
    const body = bodyViews.value.find((v) => v.id === bodyId)
    if (!body) return
    const diagramId = bodyViewRoot(body).projectDiagramId
    if (!diagramId || !hasDiagramId(diagramId)) return
    if (activeDiagramId.value === diagramId) return
    setActiveDiagramId(diagramId)
    presentActiveDiagram(diagramId)
  })
}
